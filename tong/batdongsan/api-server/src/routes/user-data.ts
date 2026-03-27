import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { favoritesTable, searchHistoryTable } from "../../db/schema";
import { requireAuth } from "../middleware/auth";

const router = Router();
const MAX_HISTORY = 10;

type SearchPayload = {
  keyword?: string;
  province?: string;
  district?: string;
  category?: string;
  roomType?: string;
  priceMin?: number;
  priceMax?: number;
};

function normalizeNullable(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function matchesHistoryEntry(row: typeof searchHistoryTable.$inferSelect, payload: SearchPayload) {
  return (
    (row.keyword ?? null) === normalizeNullable(payload.keyword) &&
    (row.province ?? null) === normalizeNullable(payload.province) &&
    (row.district ?? null) === normalizeNullable(payload.district) &&
    (row.category ?? null) === normalizeNullable(payload.category) &&
    (row.roomType ?? null) === normalizeNullable(payload.roomType) &&
    Number(row.priceMin ?? 0) === Number(payload.priceMin ?? 0) &&
    Number(row.priceMax ?? 0) === Number(payload.priceMax ?? 0)
  );
}

router.get("/me/favorites", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({ propertyId: favoritesTable.propertyId })
      .from(favoritesTable)
      .where(eq(favoritesTable.userId, req.user!.id))
      .orderBy(desc(favoritesTable.createdAt));

    res.json(rows.map((row) => row.propertyId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Khong the tai danh sach da luu" });
  }
});

router.post("/me/favorites", requireAuth, async (req, res) => {
  try {
    const propertyId = Number(req.body?.propertyId);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      res.status(400).json({ message: "propertyId khong hop le" });
      return;
    }

    const [existing] = await db
      .select({ id: favoritesTable.id })
      .from(favoritesTable)
      .where(and(eq(favoritesTable.userId, req.user!.id), eq(favoritesTable.propertyId, propertyId)))
      .limit(1);

    if (!existing) {
      await db.insert(favoritesTable).values({ userId: req.user!.id, propertyId });
    }

    res.status(201).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Khong the luu phong" });
  }
});

router.delete("/me/favorites/:propertyId", requireAuth, async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      res.status(400).json({ message: "propertyId khong hop le" });
      return;
    }

    await db
      .delete(favoritesTable)
      .where(and(eq(favoritesTable.userId, req.user!.id), eq(favoritesTable.propertyId, propertyId)));

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Khong the bo luu phong" });
  }
});

router.delete("/me/favorites", requireAuth, async (req, res) => {
  try {
    await db.delete(favoritesTable).where(eq(favoritesTable.userId, req.user!.id));
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Khong the xoa danh sach da luu" });
  }
});

router.get("/me/search-history", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(searchHistoryTable)
      .where(eq(searchHistoryTable.userId, req.user!.id))
      .orderBy(desc(searchHistoryTable.createdAt))
      .limit(MAX_HISTORY);

    res.json(
      rows.map((row) => ({
        keyword: row.keyword ?? undefined,
        province: row.province ?? undefined,
        district: row.district ?? undefined,
        category: row.category ?? undefined,
        roomType: row.roomType ?? undefined,
        priceMin: row.priceMin != null ? Number(row.priceMin) : undefined,
        priceMax: row.priceMax != null ? Number(row.priceMax) : undefined,
        timestamp: row.createdAt.getTime(),
      })),
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Khong the tai lich su tim kiem" });
  }
});

router.post("/me/search-history", requireAuth, async (req, res) => {
  try {
    const payload = (req.body ?? {}) as SearchPayload;
    const currentRows = await db
      .select()
      .from(searchHistoryTable)
      .where(eq(searchHistoryTable.userId, req.user!.id))
      .orderBy(desc(searchHistoryTable.createdAt));

    const duplicateRows = currentRows.filter((row) => matchesHistoryEntry(row, payload));
    if (duplicateRows.length > 0) {
      await db.delete(searchHistoryTable).where(inArray(searchHistoryTable.id, duplicateRows.map((row) => row.id)));
    }

    await db.insert(searchHistoryTable).values({
      userId: req.user!.id,
      keyword: normalizeNullable(payload.keyword),
      province: normalizeNullable(payload.province),
      district: normalizeNullable(payload.district),
      category: normalizeNullable(payload.category),
      roomType: normalizeNullable(payload.roomType),
      priceMin: payload.priceMin != null ? String(payload.priceMin) : null,
      priceMax: payload.priceMax != null ? String(payload.priceMax) : null,
    });

    const nextRows = await db
      .select({ id: searchHistoryTable.id })
      .from(searchHistoryTable)
      .where(eq(searchHistoryTable.userId, req.user!.id))
      .orderBy(desc(searchHistoryTable.createdAt));

    const overflowIds = nextRows.slice(MAX_HISTORY).map((row) => row.id);
    if (overflowIds.length > 0) {
      await db.delete(searchHistoryTable).where(inArray(searchHistoryTable.id, overflowIds));
    }

    res.status(201).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Khong the luu lich su tim kiem" });
  }
});

router.delete("/me/search-history", requireAuth, async (req, res) => {
  try {
    await db.delete(searchHistoryTable).where(eq(searchHistoryTable.userId, req.user!.id));
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Khong the xoa lich su tim kiem" });
  }
});

export default router;
