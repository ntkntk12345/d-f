import { mysqlTable, varchar, text, bigint, int, datetime, boolean, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const groupChatsTable = mysqlTable("group_chats", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const groupMembersTable = mysqlTable("group_members", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  groupId: int("group_id", { unsigned: true }).notNull().references(() => groupChatsTable.id, { onDelete: "cascade" }),
  userId: int("user_id", { unsigned: true }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: int("role").notNull().default(0),
  joinedAt: datetime("joined_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("gm_group_user_idx").on(t.groupId, t.userId),
  index("gm_user_idx").on(t.userId),
]);

export const groupMessagesTable = mysqlTable("group_messages", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  groupId: int("group_id", { unsigned: true }).notNull().references(() => groupChatsTable.id, { onDelete: "cascade" }),
  senderId: int("sender_id", { unsigned: true }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("gm_group_idx").on(t.groupId),
  index("gm_created_idx").on(t.createdAt),
  index("gm_sender_idx").on(t.senderId),
]);

export type GroupChat = typeof groupChatsTable.$inferSelect;
export type GroupMember = typeof groupMembersTable.$inferSelect;
export type GroupMessage = typeof groupMessagesTable.$inferSelect;
