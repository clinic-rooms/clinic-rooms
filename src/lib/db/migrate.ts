import "server-only";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

/**
 * Applies the committed SQL migrations in /drizzle (idempotent — drizzle keeps
 * a journal table). Normally this runs during the Vercel build
 * (scripts/migrate.mjs); this in-app fallback covers the very first visit on
 * deployments where the build-time step was skipped.
 */
export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = drizzle(neon(url));
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
