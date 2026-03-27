import { mysqlTable, text, longtext, varchar, bigint, int, datetime, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const roommatePostsTable = mysqlTable("roommate_posts", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("user_id", { unsigned: true }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  images: longtext("images"),
  province: varchar("province", { length: 128 }),
  district: varchar("district", { length: 128 }),
  budget: int("budget"),
  gender: varchar("gender", { length: 32 }),
  slots: int("slots").notNull().default(1),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("roommate_posts_user_idx").on(table.userId),
  index("roommate_posts_created_idx").on(table.createdAt),
]);

export const roommateLikesTable = mysqlTable("roommate_likes", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  postId: bigint("post_id", { mode: "number" }).notNull().references(() => roommatePostsTable.id, { onDelete: "cascade" }),
  userId: int("user_id", { unsigned: true }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("roommate_likes_post_idx").on(table.postId),
  index("roommate_likes_user_post_idx").on(table.userId, table.postId),
]);

export const roommateCommentsTable = mysqlTable("roommate_comments", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  postId: bigint("post_id", { mode: "number" }).notNull().references(() => roommatePostsTable.id, { onDelete: "cascade" }),
  userId: int("user_id", { unsigned: true }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("roommate_comments_post_idx").on(table.postId),
  index("roommate_comments_user_idx").on(table.userId),
]);

export type RoommatePost = typeof roommatePostsTable.$inferSelect;
export type RoommateLike = typeof roommateLikesTable.$inferSelect;
export type RoommateComment = typeof roommateCommentsTable.$inferSelect;
