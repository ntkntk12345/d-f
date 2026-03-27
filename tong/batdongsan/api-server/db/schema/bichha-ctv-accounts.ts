import { datetime, int, mysqlTable, varchar, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const bichHaCtvAccountsTable = mysqlTable("bichha_ctv_accounts", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  nickname: varchar("nickname", { length: 120 }).notNull(),
  isEnabled: int("is_enabled").notNull().default(1),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("bichha_ctv_accounts_username_idx").on(table.username),
  index("bichha_ctv_accounts_enabled_idx").on(table.isEnabled),
]);

export type BichHaCtvAccount = typeof bichHaCtvAccountsTable.$inferSelect;
