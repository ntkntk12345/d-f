import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "../../db";
import { propertiesTable } from "../../db/schema";
import {
  ListPropertiesQueryParams,
  GetPropertyParams,
} from "../../api-zod";
import { eq, and, gte, lte, sql, count, isNull, or, gt, lt, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { getPropertyPostingAvailability } from "../lib/posting-settings";
import { createResponseCache } from "../lib/response-cache";
import { getPropertyPreviewIndex } from "../lib/property-preview-index";
import { listPropertyPreviews } from "../../../src/lib/property-preview-search";
import { buildPropertyRecommendations } from "../../../src/lib/search-recommendations";

const router: IRouter = Router();
const propertyResponseCache = createResponseCache<unknown>(500);
const PROPERTY_LIST_CACHE_TTL_MS = 60 * 1000;
const PROPERTY_FEATURED_CACHE_TTL_MS = 2 * 60 * 1000;
const PROPERTY_POSTING_STATUS_CACHE_TTL_MS = 30 * 1000;
const PROPERTY_SEARCH_CACHE_TTL_MS = 60 * 1000;
const EXPIRY_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const SearchPropertiesQueryParams = ListPropertiesQueryParams.extend({
  keyword: z.coerce.string().optional(),
  roomType: z.coerce.string().optional(),
  requirement: z.coerce.string().optional(),
});

let lastCleanupAt = 0;
let cleanupPromise: Promise<void> | null = null;

async function cleanupExpiredListings() {
  try {
    const now = new Date();
    await db
      .delete(propertiesTable)
      .where(
        and(
          sql`${propertiesTable.expiresAt} IS NOT NULL`,
          lt(propertiesTable.expiresAt, now)
        )
      );
  } catch (err) {
    console.error("Cleanup error:", err);
  }
}

async function ensureExpiredListingsCleanup() {
  const now = Date.now();

  if (cleanupPromise) {
    await cleanupPromise;
    return;
  }

  if (now - lastCleanupAt < EXPIRY_CLEANUP_INTERVAL_MS) {
    return;
  }

  cleanupPromise = cleanupExpiredListings()
    .catch((err) => {
      console.error("Cleanup error:", err);
    })
    .finally(() => {
      lastCleanupAt = Date.now();
      cleanupPromise = null;
    });

  await cleanupPromise;
}

function setSharedCacheHeaders(res: Response, maxAgeSeconds: number, sharedMaxAgeSeconds: number) {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${maxAgeSeconds}, s-maxage=${sharedMaxAgeSeconds}, stale-while-revalidate=${sharedMaxAgeSeconds * 2}`,
  );
}

async function sendCachedJson(
  req: Request,
  res: Response,
  ttlMs: number,
  payloadFactory: () => Promise<unknown>,
) {
  const cacheKey = req.originalUrl;
  const cachedPayload = propertyResponseCache.get(cacheKey);

  if (cachedPayload != null) {
    res.json(cachedPayload);
    return;
  }

  const payload = await payloadFactory();
  propertyResponseCache.set(cacheKey, payload, ttlMs);
  res.json(payload);
}

function invalidatePropertyCaches() {
  propertyResponseCache.clear();
}

router.get("/properties/featured", async (req, res) => {
  try {
    await ensureExpiredListingsCleanup();
    setSharedCacheHeaders(res, 60, 300);
    await sendCachedJson(req, res, PROPERTY_FEATURED_CACHE_TTL_MS, async () => {
      const now = new Date();
      const rows = await db
        .select()
        .from(propertiesTable)
        .where(
          and(
            eq(propertiesTable.isFeatured, true),
            eq(propertiesTable.status, "approved"),
            or(
              isNull(propertiesTable.expiresAt),
              gt(propertiesTable.expiresAt, now)
            )
          )
        )
        .limit(12)
        .orderBy(desc(propertiesTable.postedAt));

      return rows.map(mapProperty);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/properties/search", async (req, res) => {
  try {
    setSharedCacheHeaders(res, 60, 300);
    await sendCachedJson(req, res, PROPERTY_SEARCH_CACHE_TTL_MS, async () => {
      const rawQuery = SearchPropertiesQueryParams.parse(req.query);
      const query = {
        ...rawQuery,
        page: Math.max(1, Math.trunc(rawQuery.page)),
        limit: Math.min(1000, Math.max(1, Math.trunc(rawQuery.limit))),
      };
      const propertyIndex = await getPropertyPreviewIndex();
      const result = listPropertyPreviews(propertyIndex, query);

      return {
        ...result,
        recommendations: buildPropertyRecommendations(propertyIndex, query, {
          excludedIds: result.data.map((property) => property.id),
          relatedItemLimit: 8,
          groupItemLimit: 4,
          roomGroupLimit: 4,
          priceGroupLimit: 3,
        }),
      };
    });
  } catch (err) {
    console.error("[properties.search]", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/properties", async (req, res) => {
  try {
    await ensureExpiredListingsCleanup();
    setSharedCacheHeaders(res, 30, 120);
    await sendCachedJson(req, res, PROPERTY_LIST_CACHE_TTL_MS, async () => {
      const query = ListPropertiesQueryParams.parse(req.query);
      const { type, category, province, district, priceMin, priceMax, areaMin, areaMax, page, limit } = query;

      const now = new Date();
      const conditions = [
        eq(propertiesTable.status, "approved"),
        or(
          isNull(propertiesTable.expiresAt),
          gt(propertiesTable.expiresAt, now)
        ),
      ];

      if (type) conditions.push(eq(propertiesTable.type, type));
      if (category) conditions.push(eq(propertiesTable.category, category));
      if (province) conditions.push(eq(propertiesTable.province, province));
      if (district) conditions.push(eq(propertiesTable.district, district));
      if (priceMin != null) conditions.push(gte(propertiesTable.price, String(priceMin)));
      if (priceMax != null) conditions.push(lte(propertiesTable.price, String(priceMax)));
      if (areaMin != null) conditions.push(gte(propertiesTable.area, String(areaMin)));
      if (areaMax != null) conditions.push(lte(propertiesTable.area, String(areaMax)));

      const where = and(...conditions);

      const [totalResult, rows] = await Promise.all([
        db.select({ count: count() }).from(propertiesTable).where(where),
        db
          .select()
          .from(propertiesTable)
          .where(where)
          .orderBy(desc(propertiesTable.isFeatured), desc(propertiesTable.postedAt))
          .limit(limit)
          .offset((page - 1) * limit),
      ]);

      const total = Number(totalResult[0].count || 0);
      const totalPages = Math.ceil(total / limit);

      return {
        data: rows.map(mapProperty),
        total,
        page,
        limit,
        totalPages,
      };
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/properties/posting-status", async (_req, res) => {
  try {
    setSharedCacheHeaders(res, 15, 60);
    const cacheKey = "posting-status";
    const cachedPayload = propertyResponseCache.get(cacheKey);
    if (cachedPayload != null) {
      res.json(cachedPayload);
      return;
    }

    const postingAvailability = await getPropertyPostingAvailability();
    propertyResponseCache.set(cacheKey, postingAvailability, PROPERTY_POSTING_STATUS_CACHE_TTL_MS);
    res.json(postingAvailability);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Khong the tai trang thai dang bai" });
  }
});

router.post("/properties", requireAuth, async (req, res) => {
  try {
    const postingAvailability = await getPropertyPostingAvailability();

    if (!postingAvailability.isEnabled) {
      res.status(403).json({
        message: postingAvailability.message,
        isEnabled: postingAvailability.isEnabled,
      });
      return;
    }

    const {
      title, type, category, price, priceUnit, area,
      address, province, district, ward,
      bedrooms, bathrooms, floors,
      description, images,
      contactName, contactPhone,
      commission,
    } = req.body;

    if (!title || !type || !category || !price || !priceUnit || !area || !address || !province || !district || !description || !contactName || !contactPhone) {
      res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      return;
    }

    const now = new Date();
    const priceNum = Number(price);
    const areaNum = Number(area);
    const pricePerSqm = areaNum > 0 ? priceNum / areaNum : null;

    const [{ id }] = await db
      .insert(propertiesTable)
      .values({
        title,
        type,
        category,
        price: String(priceNum),
        priceUnit,
        area: String(areaNum),
        address,
        province,
        district,
        ward: ward || null,
        bedrooms: bedrooms ? Number(bedrooms) : null,
        bathrooms: bathrooms ? Number(bathrooms) : null,
        floors: floors ? Number(floors) : null,
        description,
        images: images || [],
        contactName,
        contactPhone,
        isFeatured: false,
        isVerified: false,
        postedAt: now,
        expiresAt: null,
        views: 0,
        pricePerSqm: pricePerSqm ? String(pricePerSqm) : null,
        userId: req.user!.id,
        status: "pending",
        commission: commission ? String(Number(commission)) : null,
      })
      .$returningId();
    invalidatePropertyCaches();
    const [inserted] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, id)).limit(1);
    if (!inserted) {
      res.status(500).json({ message: "Khong the tai lai tin vua tao" });
      return;
    }

    res.status(201).json({ ...mapProperty(inserted), status: inserted.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/my-properties", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.userId, req.user!.id))
      .orderBy(desc(propertiesTable.postedAt));
    res.json(rows.map(r => ({ ...mapProperty(r), status: r.status, commission: r.commission ? Number(r.commission) : undefined })));
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.get("/properties/:id", async (req, res) => {
  try {
    const { id } = GetPropertyParams.parse(req.params);
    const rows = await db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ message: "Property not found" });
      return;
    }

    await db
      .update(propertiesTable)
      .set({ views: sql`${propertiesTable.views} + 1` })
      .where(eq(propertiesTable.id, id));

    res.json(mapProperty(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/properties/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid ID" });
      return;
    }

    const rows = await db.select({ id: propertiesTable.id }).from(propertiesTable).where(eq(propertiesTable.id, id)).limit(1);
    if (rows.length === 0) {
      res.status(404).json({ message: "Property not found" });
      return;
    }

    await db.delete(propertiesTable).where(eq(propertiesTable.id, id));
    invalidatePropertyCaches();
    res.json({ success: true, message: "Đã xóa tin đăng" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

function mapProperty(row: typeof propertiesTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    category: row.category,
    price: Number(row.price),
    priceUnit: row.priceUnit,
    area: Number(row.area),
    address: row.address,
    province: row.province,
    district: row.district,
    ward: row.ward ?? undefined,
    bedrooms: row.bedrooms ?? undefined,
    bathrooms: row.bathrooms ?? undefined,
    floors: row.floors ?? undefined,
    description: row.description,
    images: row.images ?? [],
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    isFeatured: row.isFeatured,
    isVerified: row.isVerified,
    postedAt: row.postedAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : undefined,
    views: row.views,
    pricePerSqm: row.pricePerSqm ? Number(row.pricePerSqm) : undefined,
  };
}

export default router;
