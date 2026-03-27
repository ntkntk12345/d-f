import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
});

export default defineConfig({
  dialect: "mysql",
  schema: "./api-server/db/schema/index.ts",
  out: "./api-server/drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "mysql://root:password@127.0.0.1:3306/batdongsan",
  },
});
