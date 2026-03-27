import { Router } from "express";
import { db } from "../../db";
import { groupChatsTable, groupMembersTable, groupMessagesTable, usersTable } from "../../db/schema";
import { requireAuth } from "../middleware/auth";
import { eq, and, desc, asc, notInArray } from "drizzle-orm";

const router = Router();

export const GENERAL_GROUP_ID = 1;

function getParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export async function ensureGeneralGroup() {
  const [existing] = await db.select().from(groupChatsTable).where(eq(groupChatsTable.id, GENERAL_GROUP_ID)).limit(1);
  if (!existing) {
    await db.insert(groupChatsTable).values({ name: "Nhóm chung", description: "Nhóm trò chuyện chung của tất cả thành viên TimTro.vn" });
  }
}

export async function joinGeneralGroup(userId: number, userRole: number) {
  const [existing] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, GENERAL_GROUP_ID), eq(groupMembersTable.userId, userId)))
    .limit(1);
  if (!existing) {
    await db.insert(groupMembersTable).values({
      groupId: GENERAL_GROUP_ID,
      userId,
      role: userRole === 1 ? 1 : 0,
    });
  }
}

export async function syncAllUsersToGeneralGroup() {
  try {
    await ensureGeneralGroup();
    const alreadyIn = await db
      .select({ userId: groupMembersTable.userId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.groupId, GENERAL_GROUP_ID));

    const alreadyInIds = alreadyIn.map((m) => m.userId);

    const usersToAdd = alreadyInIds.length > 0
      ? await db.select({ id: usersTable.id, role: usersTable.role })
          .from(usersTable)
          .where(notInArray(usersTable.id, alreadyInIds))
      : await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable);

    if (usersToAdd.length > 0) {
      await db.insert(groupMembersTable).values(
        usersToAdd.map((u) => ({
          groupId: GENERAL_GROUP_ID,
          userId: u.id,
          role: u.role === 1 ? 1 : 0,
        }))
      );
      console.log(`[Cron] Đã thêm ${usersToAdd.length} người dùng vào Nhóm chung`);
    } else {
      console.log("[Cron] Tất cả người dùng đã trong Nhóm chung");
    }
  } catch (err) {
    console.error("[Cron] Lỗi sync Nhóm chung:", err);
  }
}

router.get("/groups", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const memberships = await db
      .select({ groupId: groupMembersTable.groupId, memberRole: groupMembersTable.role })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, userId));

    const groups = await Promise.all(
      memberships.map(async (m) => {
        const [group] = await db.select().from(groupChatsTable).where(eq(groupChatsTable.id, m.groupId)).limit(1);
        const [lastMsg] = await db
          .select({ content: groupMessagesTable.content, senderId: groupMessagesTable.senderId, createdAt: groupMessagesTable.createdAt, isDeleted: groupMessagesTable.isDeleted })
          .from(groupMessagesTable)
          .where(eq(groupMessagesTable.groupId, m.groupId))
          .orderBy(desc(groupMessagesTable.createdAt))
          .limit(1);
        const memberCount = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, m.groupId));
        return { ...group, myRole: m.memberRole, lastMessage: lastMsg || null, memberCount: memberCount.length };
      })
    );
    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.get("/groups/:id/messages", requireAuth, async (req, res) => {
  try {
    const groupId = parseInt(getParam(req.params.id), 10);
    const userId = req.user!.id;

    const [membership] = await db.select().from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId))).limit(1);
    if (!membership) { res.status(403).json({ message: "Bạn không trong nhóm này" }); return; }

    const msgs = await db
      .select({
        id: groupMessagesTable.id,
        content: groupMessagesTable.content,
        isDeleted: groupMessagesTable.isDeleted,
        createdAt: groupMessagesTable.createdAt,
        senderId: groupMessagesTable.senderId,
        senderName: usersTable.name,
      })
      .from(groupMessagesTable)
      .leftJoin(usersTable, eq(groupMessagesTable.senderId, usersTable.id))
      .where(eq(groupMessagesTable.groupId, groupId))
      .orderBy(asc(groupMessagesTable.createdAt))
      .limit(100);

    res.json(msgs);
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.post("/groups/:id/messages", requireAuth, async (req, res) => {
  try {
    const groupId = parseInt(getParam(req.params.id), 10);
    const userId = req.user!.id;
    const { content } = req.body;

    if (!content?.trim()) { res.status(400).json({ message: "Nội dung trống" }); return; }

    const [membership] = await db.select().from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId))).limit(1);
    if (!membership) { res.status(403).json({ message: "Bạn không trong nhóm này" }); return; }

    const [{ id }] = await db.insert(groupMessagesTable)
      .values({ groupId, senderId: userId, content: content.trim() })
      .$returningId();
    const [msg] = await db.select().from(groupMessagesTable).where(eq(groupMessagesTable.id, id)).limit(1);
    if (!msg) { res.status(500).json({ message: "Khong the tai lai tin nhan nhom vua tao" }); return; }

    res.status(201).json({ ...msg, senderName: req.user!.name });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.delete("/groups/:groupId/messages/:msgId", requireAuth, async (req, res) => {
  try {
    const groupId = parseInt(getParam(req.params.groupId), 10);
    const msgId = parseInt(getParam(req.params.msgId), 10);
    const userId = req.user!.id;

    const [membership] = await db.select({ role: groupMembersTable.role }).from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId))).limit(1);
    if (!membership) { res.status(403).json({ message: "Không có quyền" }); return; }

    const [msg] = await db.select().from(groupMessagesTable).where(eq(groupMessagesTable.id, msgId)).limit(1);
    if (!msg) { res.status(404).json({ message: "Không tìm thấy" }); return; }

    const isAdmin = membership.role === 1 || req.user!.role === 1;
    const isOwner = msg.senderId === userId;

    if (!isAdmin && !isOwner) { res.status(403).json({ message: "Không có quyền xóa" }); return; }

    await db.update(groupMessagesTable).set({ isDeleted: true }).where(eq(groupMessagesTable.id, msgId));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.get("/groups/:id/members", requireAuth, async (req, res) => {
  try {
    const groupId = parseInt(getParam(req.params.id), 10);
    const members = await db
      .select({
        id: groupMembersTable.id,
        userId: groupMembersTable.userId,
        role: groupMembersTable.role,
        joinedAt: groupMembersTable.joinedAt,
        name: usersTable.name,
        phone: usersTable.phone,
      })
      .from(groupMembersTable)
      .leftJoin(usersTable, eq(groupMembersTable.userId, usersTable.id))
      .where(eq(groupMembersTable.groupId, groupId));
    res.json(members);
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.delete("/groups/:groupId/members/:userId", requireAuth, async (req, res) => {
  try {
    const groupId = parseInt(String(req.params.groupId), 10);
    const targetUserId = parseInt(String(req.params.userId), 10);
    const requesterId = req.user!.id;

    const [membership] = await db.select({ role: groupMembersTable.role }).from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, requesterId))).limit(1);

    const isAdmin = (membership?.role === 1) || req.user!.role === 1;
    if (!isAdmin) { res.status(403).json({ message: "Chỉ admin mới được kick thành viên" }); return; }
    if (targetUserId === requesterId) { res.status(400).json({ message: "Không thể kick chính mình" }); return; }

    await db.delete(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, targetUserId)));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

export default router;
