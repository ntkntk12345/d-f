import { mysqlTable, varchar, text, longtext, bigint, decimal, int, boolean, datetime, index, json } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const propertiesTable = mysqlTable("properties", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  sourceRawId: varchar("source_raw_id", { length: 64 }),
  sourceSymbol: varchar("source_symbol", { length: 64 }),
  sourceFile: varchar("source_file", { length: 128 }),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  price: decimal("price", { precision: 15, scale: 3 }).notNull().default("0"),
  priceUnit: varchar("price_unit", { length: 64 }).notNull(),
  area: decimal("area", { precision: 10, scale: 2 }).notNull().default("0"),
  address: text("address").notNull(),
  province: varchar("province", { length: 128 }).notNull(),
  district: varchar("district", { length: 128 }).notNull(),
  ward: varchar("ward", { length: 128 }),
  bedrooms: int("bedrooms"),
  bathrooms: int("bathrooms"),
  floors: int("floors"),
  description: longtext("description").notNull(),
  images: json("images").$type<string[] | null>(),
  contactName: varchar("contact_name", { length: 255 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 64 }).notNull(),
  contactLink: text("contact_link"),
  isFeatured: boolean("is_featured").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  postedAt: datetime("posted_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: datetime("expires_at", { mode: "date" }),
  views: int("views").notNull().default(0),
  pricePerSqm: decimal("price_per_sqm", { precision: 15, scale: 3 }),
  userId: int("user_id", { unsigned: true }).references(() => usersTable.id, { onDelete: "set null" }),
  status: varchar("status", { length: 32 }).notNull().default("approved"),
  commission: decimal("commission", { precision: 5, scale: 2 }),
  sourceText: longtext("source_text"),
  sourceKeywords: json("source_keywords").$type<string[] | null>(),
  createdAt: datetime("created_at", { mode: "date" }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("properties_type_idx").on(table.type),
  index("properties_category_idx").on(table.category),
  index("properties_province_idx").on(table.province),
  index("properties_district_idx").on(table.district),
  index("properties_is_featured_idx").on(table.isFeatured),
  index("properties_expires_at_idx").on(table.expiresAt),
  index("properties_user_id_idx").on(table.userId),
]);

export const insertPropertySchema = createInsertSchema(propertiesTable).omit({ id: true });
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof propertiesTable.$inferSelect;
