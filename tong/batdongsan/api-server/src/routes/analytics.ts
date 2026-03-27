import { Router, type Request } from "express";
import { desc, gte } from "drizzle-orm";
import { db } from "../../db";
import { trafficVisitsTable, usersTable } from "../../db/schema";
import { optionalAuth, requireBichHaAdmin, signBichHaAdminToken } from "../middleware/auth";
import { createFeaturedPost, deleteFeaturedPost, listFeaturedPosts, listFeaturedPostsForPublic } from "../lib/featured-posts";
import { getPropertyPostingAvailability, setPropertyPostingEnabled } from "../lib/posting-settings";
import { getSiteContactControl, normalizeSiteContactLink, setSiteContactLink } from "../lib/site-contact";
import { getSiteMaintenanceStatus, setSiteMaintenanceEnabled } from "../lib/site-maintenance";

const router = Router();

const BICHHA_ADMIN_USERNAME = process.env.BICHHA_ADMIN_USERNAME || "admin";
const BICHHA_ADMIN_PASSWORD = process.env.BICHHA_ADMIN_PASSWORD || "BichHa0101@";
const DASHBOARD_TIMEZONE = "Asia/Ho_Chi_Minh";
const MAX_DASHBOARD_DAYS = 30;

type VisitEntry = {
  visitDate: string;
  ipAddress: string;
  path: string;
  userAgent: string | null;
  userId: number | null;
  createdAt: Date;
};

function toDateKey(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

function getDateRange(days: number) {
  const safeDays = Math.max(1, Math.min(days, MAX_DASHBOARD_DAYS));
  const dateKeys: string[] = [];
  const anchor = new Date();

  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const nextDate = new Date(anchor);
    nextDate.setDate(anchor.getDate() - offset);
    dateKeys.push(toDateKey(nextDate));
  }

  return dateKeys;
}

function normalizeIp(rawIp?: string | string[] | null) {
  const value = Array.isArray(rawIp) ? rawIp[0] : rawIp;
  if (!value) return "unknown";

  const firstIp = value.split(",")[0]?.trim() || "unknown";
  return firstIp.replace(/^::ffff:/, "");
}

function getClientIp(req: Request) {
  return normalizeIp(
    req.headers["x-forwarded-for"]
      || req.headers["x-real-ip"]
      || req.ip
      || req.socket.remoteAddress
      || null,
  );
}

function normalizePath(value: unknown) {
  const path = typeof value === "string" ? value.trim() : "";
  if (!path || !path.startsWith("/")) return "/";
  return path.slice(0, 255);
}

function buildSummary(visits: VisitEntry[]) {
  const uniqueIps = new Set(visits.map((visit) => visit.ipAddress));
  const uniqueUserIds = new Set(
    visits
      .map((visit) => visit.userId)
      .filter((userId): userId is number => Number.isInteger(userId)),
  );

  return {
    totalHits: visits.length,
    totalVisitors: uniqueIps.size,
    uniqueIps: uniqueIps.size,
    knownAccountsVisited: uniqueUserIds.size,
  };
}

function buildDailyStats(visits: VisitEntry[], dateKeys: string[]) {
  const statsMap = new Map(
    dateKeys.map((dateKey) => [
      dateKey,
      {
        date: dateKey,
        totalHits: 0,
        uniqueIps: new Set<string>(),
        knownAccountsVisited: new Set<number>(),
        ipMap: new Map<string, number>(),
      },
    ]),
  );

  for (const visit of visits) {
    const entry = statsMap.get(visit.visitDate);
    if (!entry) continue;

    entry.totalHits += 1;
    entry.uniqueIps.add(visit.ipAddress);
    entry.ipMap.set(visit.ipAddress, (entry.ipMap.get(visit.ipAddress) || 0) + 1);

    if (visit.userId != null) {
      entry.knownAccountsVisited.add(visit.userId);
    }
  }

  return dateKeys.map((dateKey) => {
    const entry = statsMap.get(dateKey)!;

    return {
      date: entry.date,
      totalHits: entry.totalHits,
      uniqueIps: entry.uniqueIps.size,
      knownAccountsVisited: entry.knownAccountsVisited.size,
      ipVisits: Array.from(entry.ipMap.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([ipAddress, hits]) => ({ ipAddress, hits })),
    };
  });
}

router.post("/analytics/track", optionalAuth, async (req, res) => {
  try {
    const path = normalizePath(req.body?.path);

    if (path.startsWith("/admin/bichha")) {
      res.status(204).end();
      return;
    }

    await db.insert(trafficVisitsTable).values({
      visitDate: toDateKey(new Date()),
      ipAddress: getClientIp(req),
      path,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 512) || null,
      userId: req.user?.id ?? null,
    });

    res.status(204).end();
  } catch (error) {
    console.error("[analytics.track]", error);
    res.status(500).json({ message: "Khong the ghi nhan luot truy cap" });
  }
});

router.post("/admin/bichha/login", async (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");

  if (username !== BICHHA_ADMIN_USERNAME || password !== BICHHA_ADMIN_PASSWORD) {
    res.status(401).json({ message: "Tai khoan hoac mat khau khong dung" });
    return;
  }

  res.json({
    token: signBichHaAdminToken(username),
    username,
  });
});

router.get("/site/maintenance-status", async (_req, res) => {
  try {
    const maintenanceControl = await getSiteMaintenanceStatus();
    res.json(maintenanceControl);
  } catch (error) {
    console.error("[site.maintenance-status]", error);
    res.status(500).json({ message: "Khong the tai trang thai bao tri" });
  }
});

router.get("/site/contact-settings", async (_req, res) => {
  try {
    const contactControl = await getSiteContactControl();
    res.json(contactControl);
  } catch (error) {
    console.error("[site.contact-settings]", error);
    res.status(500).json({ message: "Khong the tai link lien he" });
  }
});

router.get("/site/featured-posts", async (_req, res) => {
  try {
    const featuredPosts = await listFeaturedPostsForPublic();
    res.json(featuredPosts);
  } catch (error) {
    console.error("[site.featured-posts]", error);
    res.status(500).json({ message: "Khong the tai bai viet noi bat" });
  }
});

router.get("/admin/bichha/dashboard", requireBichHaAdmin, async (_req, res) => {
  try {
    const dateKeys30 = getDateRange(30);
    const dateKeys1 = dateKeys30.slice(-1);
    const dateKeys7 = dateKeys30.slice(-7);
    const firstDateKey = dateKeys30[0];

    const [visits, users, postingControl, maintenanceControl, contactControl, featuredPosts] = await Promise.all([
      db.select({
        visitDate: trafficVisitsTable.visitDate,
        ipAddress: trafficVisitsTable.ipAddress,
        path: trafficVisitsTable.path,
        userAgent: trafficVisitsTable.userAgent,
        userId: trafficVisitsTable.userId,
        createdAt: trafficVisitsTable.createdAt,
      })
        .from(trafficVisitsTable)
        .where(gte(trafficVisitsTable.visitDate, firstDateKey))
        .orderBy(desc(trafficVisitsTable.createdAt)),
      db.select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
      })
        .from(usersTable)
        .orderBy(desc(usersTable.createdAt)),
      getPropertyPostingAvailability(),
      getSiteMaintenanceStatus({ forceRefresh: true }),
      getSiteContactControl({ forceRefresh: true }),
      listFeaturedPosts(),
    ]);

    const dailyStats1 = buildDailyStats(visits, dateKeys1);
    const dailyStats30 = buildDailyStats(visits, dateKeys30);
    const dailyStats7 = dailyStats30.slice(-7);
    const visits1 = visits.filter((visit) => visit.visitDate >= dateKeys1[0]);
    const visits7 = visits.filter((visit) => visit.visitDate >= dateKeys7[0]);

    res.json({
      generatedAt: new Date().toISOString(),
      timezone: DASHBOARD_TIMEZONE,
      summary1Day: buildSummary(visits1),
      summary7Days: buildSummary(visits7),
      summary30Days: buildSummary(visits),
      dailyStats1,
      dailyStats7,
      dailyStats30,
      postingControl,
      maintenanceControl,
      contactControl,
      featuredPosts,
      accounts: {
        total: users.length,
        users,
      },
    });
  } catch (error) {
    console.error("[analytics.dashboard]", error);
    res.status(500).json({ message: "Khong the tai du lieu dashboard" });
  }
});

router.post("/admin/bichha/posting-status", requireBichHaAdmin, async (req, res) => {
  try {
    if (typeof req.body?.isEnabled !== "boolean") {
      res.status(400).json({ message: "isEnabled phai la boolean" });
      return;
    }

    const postingControl = await setPropertyPostingEnabled(req.body.isEnabled);
    res.json(postingControl);
  } catch (error) {
    console.error("[analytics.posting-status]", error);
    res.status(500).json({ message: "Khong the cap nhat trang thai dang bai" });
  }
});

router.post("/admin/bichha/maintenance-status", requireBichHaAdmin, async (req, res) => {
  try {
    if (typeof req.body?.isEnabled !== "boolean") {
      res.status(400).json({ message: "isEnabled phai la boolean" });
      return;
    }

    const maintenanceControl = await setSiteMaintenanceEnabled(req.body.isEnabled);
    res.json(maintenanceControl);
  } catch (error) {
    console.error("[analytics.maintenance-status]", error);
    res.status(500).json({ message: "Khong the cap nhat trang thai bao tri" });
  }
});

router.post("/admin/bichha/contact-settings", requireBichHaAdmin, async (req, res) => {
  try {
    const rawContactLink = String(req.body?.contactLink ?? "").trim();

    if (!rawContactLink) {
      res.status(400).json({ message: "contactLink khong duoc de trong" });
      return;
    }

    if (!normalizeSiteContactLink(rawContactLink)) {
      res.status(400).json({ message: "contactLink khong hop le" });
      return;
    }

    const contactControl = await setSiteContactLink(rawContactLink);
    res.json(contactControl);
  } catch (error) {
    console.error("[analytics.contact-settings]", error);
    res.status(500).json({ message: "Khong the cap nhat link lien he" });
  }
});

router.post("/admin/bichha/featured-posts", requireBichHaAdmin, async (req, res) => {
  try {
    const post = await createFeaturedPost({
      title: req.body?.title,
      summary: req.body?.summary,
      content: req.body?.content,
      address: req.body?.address,
      roomType: req.body?.roomType,
      priceLabel: req.body?.priceLabel,
      imageDataUrls: Array.isArray(req.body?.imageDataUrls) ? req.body.imageDataUrls : [],
      imageDataUrl: req.body?.imageDataUrl,
      actionLabel: req.body?.actionLabel,
      actionUrl: req.body?.actionUrl,
      routingKeywords: Array.isArray(req.body?.routingKeywords) ? req.body.routingKeywords : [],
    });

    res.status(201).json(post);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Khong the tao bai viet noi bat";

    if (message === "FEATURED_POST_TITLE_REQUIRED") {
      res.status(400).json({ message: "Vui long nhap tieu de bai viet" });
      return;
    }

    if (message === "FEATURED_POST_CONTENT_REQUIRED") {
      res.status(400).json({ message: "Vui long nhap noi dung bai viet" });
      return;
    }

    if (message === "FEATURED_POST_PRICE_REQUIRED") {
      res.status(400).json({ message: "Vui long nhap gia phong" });
      return;
    }

    if (message === "FEATURED_POST_ADDRESS_REQUIRED") {
      res.status(400).json({ message: "Vui long nhap dia chi" });
      return;
    }

    if (message === "FEATURED_POST_ROOM_TYPE_REQUIRED") {
      res.status(400).json({ message: "Vui long nhap loai phong" });
      return;
    }

    if (message === "FEATURED_POST_KEYWORDS_REQUIRED") {
      res.status(400).json({ message: "Vui long nhap it nhat 1 keyword de bot dinh tuyen nhom" });
      return;
    }

    if (message === "INVALID_FEATURED_IMAGE_FORMAT") {
      res.status(400).json({ message: "Anh bai viet khong hop le" });
      return;
    }

    if (message === "INVALID_FEATURED_IMAGE_SIZE") {
      res.status(400).json({ message: "Anh bai viet vuot qua gioi han 5MB" });
      return;
    }

    if (message === "INVALID_FEATURED_IMAGE_COUNT") {
      res.status(400).json({ message: "Moi bai viet noi bat toi da 10 anh" });
      return;
    }

    console.error("[admin.bichha.featured-posts.create]", error);
    res.status(500).json({ message: "Khong the tao bai viet noi bat" });
  }
});

router.delete("/admin/bichha/featured-posts/:id", requireBichHaAdmin, async (req, res) => {
  try {
    const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const removed = await deleteFeaturedPost(postId);

    if (!removed) {
      res.status(404).json({ message: "Khong tim thay bai viet de xoa" });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[admin.bichha.featured-posts.delete]", error);
    res.status(500).json({ message: "Khong the xoa bai viet noi bat" });
  }
});

export default router;
