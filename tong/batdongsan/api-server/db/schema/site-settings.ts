import { datetime, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const siteSettingsTable = mysqlTable("site_settings", {
  settingKey: varchar("setting_key", { length: 128 }).primaryKey(),
  settingValue: text("setting_value").notNull(),
  updatedAt: datetime("updated_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertSiteSettingSchema = createInsertSchema(siteSettingsTable);
export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;
export type SiteSetting = typeof siteSettingsTable.$inferSelect;
