import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config(); // fallback to .env

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // the Vercel Neon integration injects DATABASE_URL; POSTGRES_URL is a safety net
    url: (process.env.DATABASE_URL ?? process.env.POSTGRES_URL)!,
  },
});
