import { sql } from "drizzle-orm";
import { datetime, index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { usersTable } from "./users";

export const trafficVisitsTable = mysqlTable("traffic_visits", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  visitDate: varchar("visit_date", { length: 10 }).notNull(),
  ipAddress: varchar("ip_address", { length: 64 }).notNull(),
  path: varchar("path", { length: 255 }).notNull(),
  userAgent: varchar("user_agent", { length: 512 }),
  userId: int("user_id", { unsigned: true }).references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("traffic_visits_date_idx").on(table.visitDate),
  index("traffic_visits_ip_idx").on(table.ipAddress),
  index("traffic_visits_created_idx").on(table.createdAt),
  index("traffic_visits_user_idx").on(table.userId),
]);

export type TrafficVisitRecord = typeof trafficVisitsTable.$inferSelect;
