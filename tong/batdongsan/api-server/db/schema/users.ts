import { mysqlTable, varchar, int, datetime, index, text } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = mysqlTable("users", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull().default(""),
  name: varchar("name", { length: 255 }).notNull(),
  role: int("role").notNull().default(0),
  avatar: text("avatar"),
  zaloId: varchar("zalo_id", { length: 128 }).unique(),
  referredBy: int("referred_by", { unsigned: true }),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("users_phone_idx").on(table.phone),
  index("users_zalo_id_idx").on(table.zaloId),
  index("users_referred_by_idx").on(table.referredBy),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
