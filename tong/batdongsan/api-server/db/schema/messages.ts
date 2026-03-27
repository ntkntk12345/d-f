import { mysqlTable, text, bigint, int, boolean, datetime, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const messagesTable = mysqlTable("messages", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  senderId: int("sender_id", { unsigned: true }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  receiverId: int("receiver_id", { unsigned: true }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("messages_sender_idx").on(table.senderId),
  index("messages_receiver_idx").on(table.receiverId),
  index("messages_created_at_idx").on(table.createdAt),
]);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
