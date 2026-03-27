import { datetime, int, text, varchar, mysqlTable, index, bigint } from "drizzle-orm/mysql-core";
import { propertiesTable } from "./properties";

export const propertyImagesTable = mysqlTable("property_images", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  propertyId: bigint("property_id", { mode: "number" }).notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  sortOrder: int("sort_order").notNull().default(1),
  imageUrl: text("image_url").notNull(),
  width: int("width"),
  height: int("height"),
  capturedAt: datetime("captured_at", { mode: "date" }),
  sourceMid: varchar("source_mid", { length: 64 }),
}, (table) => [
  index("property_images_property_idx").on(table.propertyId),
]);

export const propertyVideosTable = mysqlTable("property_videos", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  propertyId: bigint("property_id", { mode: "number" }).notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  videoUrl: text("video_url").notNull(),
  thumbUrl: text("thumb_url"),
  durationMs: int("duration_ms"),
  width: int("width"),
  height: int("height"),
  capturedAt: datetime("captured_at", { mode: "date" }),
  sourceMid: varchar("source_mid", { length: 64 }),
}, (table) => [
  index("property_videos_property_idx").on(table.propertyId),
]);

export type PropertyImageRecord = typeof propertyImagesTable.$inferSelect;
export type PropertyVideoRecord = typeof propertyVideosTable.$inferSelect;
