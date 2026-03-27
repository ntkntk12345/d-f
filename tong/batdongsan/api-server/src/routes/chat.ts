import { Router } from "express";
import { db } from "../../db";
import { messagesTable, usersTable } from "../../db/schema";
import { eq, and, or, desc, count } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/messages/conversations", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const rows = await db
      .select()
      .from(messagesTable)
      .where(or(
        eq(messagesTable.senderId, userId),
        eq(messagesTable.receiverId, userId),
      ))
      .orderBy(desc(messagesTable.createdAt));

    const seen = new Set<number>();
    const conversations: any[] = [];
    for (const msg of rows) {
      const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!seen.has(otherId)) {
        seen.add(otherId);
        const [other] = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
          .from(usersTable).where(eq(usersTable.id, otherId)).limit(1);
        conversations.push({ user: other, lastMessage: msg });
      }
    }
    res.json(conversations);
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.get("/messages/unread-count", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const [{ value }] = await db
      .select({ value: count() })
      .from(messagesTable)
      .where(and(eq(messagesTable.receiverId, userId), eq(messagesTable.isRead, false)));
    res.json({ count: Number(value || 0) });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.get("/messages/:userId", requireAuth, async (req, res) => {
  try {
    const myId = req.user!.id;
    const otherId = Number(req.params.userId);
    const msgs = await db
      .select()
      .from(messagesTable)
      .where(or(
        and(eq(messagesTable.senderId, myId), eq(messagesTable.receiverId, otherId)),
        and(eq(messagesTable.senderId, otherId), eq(messagesTable.receiverId, myId)),
      ))
      .orderBy(messagesTable.createdAt);

    await db.update(messagesTable)
      .set({ isRead: true })
      .where(and(eq(messagesTable.receiverId, myId), eq(messagesTable.senderId, otherId)));

    res.json(msgs);
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.post("/messages", requireAuth, async (req, res) => {
  try {
    const senderId = req.user!.id;
    const { receiverId, content } = req.body;
    if (!receiverId || !content?.trim()) {
      res.status(400).json({ message: "Thiếu thông tin" });
      return;
    }
    const [{ id }] = await db.insert(messagesTable).values({
      senderId,
      receiverId: Number(receiverId),
      content: content.trim(),
      isRead: false,
    }).$returningId();
    const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, id)).limit(1);
    if (!msg) {
      res.status(500).json({ message: "Khong the tai lai tin nhan vua tao" });
      return;
    }
    res.json(msg);
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

export default router;
