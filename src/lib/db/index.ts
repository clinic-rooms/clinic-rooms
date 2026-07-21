import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = NeonHttpDatabase<typeof schema>;

// Lazy init so the build (which imports modules without a DATABASE_URL) doesn't crash.
let _db: DB | null = null;
function getDb(): DB {
  if (!_db) {
    // the Vercel Neon integration injects DATABASE_URL; POSTGRES_URL is a safety net
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export * as tables from "./schema";
