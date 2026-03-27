import { Router } from "express";
import { db } from "../../db";
import { propertiesTable, usersTable } from "../../db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";

const router = Router();

router.get("/admin/properties", requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const filterStatus = (status as string) || "pending";
    const rows = await db
      .select()
      .from(propertiesTable)
      .where(eq(propertiesTable.status, filterStatus))
      .orderBy(desc(propertiesTable.postedAt));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.post("/admin/properties/:id/approve", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const now = new Date();
    const expires = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    await db.update(propertiesTable)
      .set({ status: "approved", postedAt: now, expiresAt: expires })
      .where(eq(propertiesTable.id, id));
    res.json({ message: "Đã duyệt tin" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.post("/admin/properties/:id/reject", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(propertiesTable)
      .set({ status: "rejected" })
      .where(eq(propertiesTable.id, id));
    res.json({ message: "Đã từ chối tin" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      phone: usersTable.phone,
      name: usersTable.name,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    }).from(usersTable).orderBy(desc(usersTable.createdAt));
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

export default router;
