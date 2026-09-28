import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// DATABASE_URL = superuser (dono das tabelas). A role da app (RLS) e criada pelo db:rls.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
