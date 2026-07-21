/**
 * Build-time migration: applies the committed SQL migrations in /drizzle to the
 * database before `next build`. Runs on every Vercel deploy, so schema upgrades
 * ship together with code updates — no manual step for the clinic.
 *
 * - No DATABASE_URL (e.g. a local build without env) → skipped with a notice.
 * - Failure on Vercel → the build fails loudly (better than deploying a broken app).
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!url) {
  console.log("[migrate] DATABASE_URL not set - skipping migrations (build only).");
  process.exit(0);
}

try {
  const db = drizzle(neon(url));
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] Database schema is up to date.");
} catch (e) {
  console.error("[migrate] Migration failed:", e?.message ?? e);
  if (process.env.VERCEL) process.exit(1); // fail the deploy — visible error
  console.warn("[migrate] Continuing local build without a database.");
  process.exit(0);
}
