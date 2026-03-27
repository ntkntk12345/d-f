import { sql } from "drizzle-orm";
import {
  mysqlTable,
  int,
  bigint,
  datetime,
  index,
  uniqueIndex,
  varchar,
  decimal,
} from "drizzle-orm/mysql-core";
import { usersTable } from "./users";
import { propertiesTable } from "./properties";

export const favoritesTable = mysqlTable("favorites", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("user_id", { unsigned: true }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  propertyId: bigint("property_id", { mode: "number" }).notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("favorites_user_property_unique").on(table.userId, table.propertyId),
  index("favorites_user_idx").on(table.userId),
  index("favorites_property_idx").on(table.propertyId),
]);

export const searchHistoryTable = mysqlTable("search_history", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("user_id", { unsigned: true }).notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  keyword: varchar("keyword", { length: 255 }),
  requirement: varchar("requirement", { length: 255 }),
  province: varchar("province", { length: 128 }),
  district: varchar("district", { length: 128 }),
  category: varchar("category", { length: 64 }),
  roomType: varchar("room_type", { length: 64 }),
  priceMin: decimal("price_min", { precision: 10, scale: 2 }),
  priceMax: decimal("price_max", { precision: 10, scale: 2 }),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("search_history_user_idx").on(table.userId),
  index("search_history_created_idx").on(table.createdAt),
]);

export type Favorite = typeof favoritesTable.$inferSelect;
export type SearchHistoryRecord = typeof searchHistoryTable.$inferSelect;
