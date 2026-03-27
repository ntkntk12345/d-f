import { Router, type IRouter } from "express";
import { db } from "../../db";
import { roommatePostsTable, roommateLikesTable, roommateCommentsTable, usersTable } from "../../db/schema";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { eq, desc, sql, and, count } from "drizzle-orm";

const router: IRouter = Router();

function getParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeImageList(images: unknown): string[] {
  const sanitize = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];

  if (Array.isArray(images)) {
    return sanitize(images);
  }

  if (typeof images === "string") {
    const trimmed = images.trim();
    if (!trimmed) return [];

    try {
      return sanitize(JSON.parse(trimmed));
    } catch {
      return [trimmed];
    }
  }

  return [];
}

router.get("/roommate/posts", optionalAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string || "1"));
    const limit = 10;
    const offset = (page - 1) * limit;
    const userId = req.user?.id ?? null;

    const rows = await db
      .select({
        id: roommatePostsTable.id,
        content: roommatePostsTable.content,
        images: roommatePostsTable.images,
        province: roommatePostsTable.province,
        district: roommatePostsTable.district,
        budget: roommatePostsTable.budget,
        gender: roommatePostsTable.gender,
        slots: roommatePostsTable.slots,
        createdAt: roommatePostsTable.createdAt,
        userId: roommatePostsTable.userId,
        authorName: usersTable.name,
        authorAvatar: usersTable.avatar,
        likeCount: sql<number>`(SELECT COUNT(*) FROM roommate_likes WHERE post_id = ${roommatePostsTable.id})`.as("like_count"),
        commentCount: sql<number>`(SELECT COUNT(*) FROM roommate_comments WHERE post_id = ${roommatePostsTable.id})`.as("comment_count"),
        ...(userId ? {
          isLiked: sql<boolean>`EXISTS(SELECT 1 FROM roommate_likes WHERE post_id = ${roommatePostsTable.id} AND user_id = ${userId})`.as("is_liked"),
        } : {}),
      })
      .from(roommatePostsTable)
      .leftJoin(usersTable, eq(roommatePostsTable.userId, usersTable.id))
      .orderBy(desc(roommatePostsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db.select({ count: count() }).from(roommatePostsTable);
    const total = Number(totalResult.count || 0);

    res.json({
      data: rows.map(r => ({
        ...r,
        images: normalizeImageList(r.images),
        isLiked: userId ? Boolean(r.isLiked) : false,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.post("/roommate/posts", requireAuth, async (req, res) => {
  try {
    const { content, images, province, district, budget, gender, slots } = req.body;
    if (!content?.trim()) {
      res.status(400).json({ message: "Nội dung không được để trống" });
      return;
    }
    const [{ id }] = await db
      .insert(roommatePostsTable)
      .values({
        userId: req.user!.id,
        content: content.trim(),
        images: JSON.stringify(normalizeImageList(images)),
        province: province || null,
        district: district || null,
        budget: budget ? Number(budget) : null,
        gender: gender || null,
        slots: slots ? Number(slots) : 1,
      })
      .$returningId();
    const [post] = await db.select().from(roommatePostsTable).where(eq(roommatePostsTable.id, id)).limit(1);
    if (!post) { res.status(500).json({ message: "Khong the tai lai bai dang vua tao" }); return; }
    res.status(201).json({
      ...post,
      images: normalizeImageList(post.images),
      authorName: req.user!.name,
      likeCount: 0,
      commentCount: 0,
      isLiked: false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.delete("/roommate/posts/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(getParam(req.params.id), 10);
    const [post] = await db.select({ userId: roommatePostsTable.userId }).from(roommatePostsTable).where(eq(roommatePostsTable.id, id)).limit(1);
    if (!post) { res.status(404).json({ message: "Không tìm thấy bài đăng" }); return; }
    if (post.userId !== req.user!.id && req.user!.role !== 1) {
      res.status(403).json({ message: "Không có quyền xóa" }); return;
    }
    await db.delete(roommatePostsTable).where(eq(roommatePostsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.post("/roommate/posts/:id/like", requireAuth, async (req, res) => {
  try {
    const postId = parseInt(getParam(req.params.id), 10);
    const userId = req.user!.id;

    const [existing] = await db
      .select()
      .from(roommateLikesTable)
      .where(and(eq(roommateLikesTable.postId, postId), eq(roommateLikesTable.userId, userId)))
      .limit(1);

    let liked: boolean;
    if (existing) {
      await db.delete(roommateLikesTable).where(eq(roommateLikesTable.id, existing.id));
      liked = false;
    } else {
      await db.insert(roommateLikesTable).values({ postId, userId });
      liked = true;
    }

    const [{ likeCount }] = await db
      .select({ likeCount: count() })
      .from(roommateLikesTable)
      .where(eq(roommateLikesTable.postId, postId));

    res.json({ liked, likeCount: Number(likeCount || 0) });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.get("/roommate/posts/:id/comments", async (req, res) => {
  try {
    const postId = parseInt(getParam(req.params.id), 10);
    const rows = await db
      .select({
        id: roommateCommentsTable.id,
        content: roommateCommentsTable.content,
        createdAt: roommateCommentsTable.createdAt,
        userId: roommateCommentsTable.userId,
        authorName: usersTable.name,
        authorAvatar: usersTable.avatar,
      })
      .from(roommateCommentsTable)
      .leftJoin(usersTable, eq(roommateCommentsTable.userId, usersTable.id))
      .where(eq(roommateCommentsTable.postId, postId))
      .orderBy(roommateCommentsTable.createdAt);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.post("/roommate/posts/:id/comments", requireAuth, async (req, res) => {
  try {
    const postId = parseInt(getParam(req.params.id), 10);
    const { content } = req.body;
    if (!content?.trim()) { res.status(400).json({ message: "Nội dung trống" }); return; }

    const [{ id }] = await db
      .insert(roommateCommentsTable)
      .values({ postId, userId: req.user!.id, content: content.trim() })
      .$returningId();
    const [comment] = await db.select().from(roommateCommentsTable).where(eq(roommateCommentsTable.id, id)).limit(1);
    if (!comment) { res.status(500).json({ message: "Khong the tai lai binh luan vua tao" }); return; }

    res.status(201).json({ ...comment, authorName: req.user!.name, authorAvatar: null });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.delete("/roommate/comments/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(getParam(req.params.id), 10);
    const [cmt] = await db.select({ userId: roommateCommentsTable.userId }).from(roommateCommentsTable).where(eq(roommateCommentsTable.id, id)).limit(1);
    if (!cmt) { res.status(404).json({ message: "Không tìm thấy bình luận" }); return; }
    if (cmt.userId !== req.user!.id && req.user!.role !== 1) {
      res.status(403).json({ message: "Không có quyền" }); return;
    }
    await db.delete(roommateCommentsTable).where(eq(roommateCommentsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

export default router;
