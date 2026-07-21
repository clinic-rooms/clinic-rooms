/**
 * Emergency restore from a JSON backup produced by /api/cron/backup.
 * Usage: npm run db:restore -- path/to/2026-07-16.json
 * WIPES current data and replaces it with the backup contents.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as t from "./schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema: t });

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run db:restore -- <backup.json>");
    process.exit(1);
  }
  const backup = JSON.parse(readFileSync(file, "utf-8"));
  if (backup.version !== 1 || !backup.tables) {
    console.error("Unrecognized backup format");
    process.exit(1);
  }
  const tables = backup.tables;
  console.log(`Restoring backup from ${backup.createdAt}…`);

  // JSON serialized timestamps back to Date objects; trusted backup data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixDates = (rows: Record<string, unknown>[]): any[] =>
    rows.map((r) => {
      const out: Record<string, unknown> = { ...r };
      for (const k of Object.keys(out)) {
        const v = out[k];
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
          out[k] = new Date(v);
        }
      }
      return out;
    });

  // wipe in FK order
  await db.delete(t.notifications);
  await db.delete(t.swapRequests);
  await db.delete(t.oneTimeBookings);
  await db.delete(t.oneTimeAbsences);
  await db.delete(t.recurringReductions);
  await db.delete(t.fixedAssignments);
  await db.delete(t.roomAvailability);
  await db.delete(t.rooms);
  await db.delete(t.clinicSettings);
  await db.delete(t.session);
  await db.delete(t.account);
  await db.delete(t.verification);
  await db.delete(t.user);

  // insert in FK order
  if (tables.user?.length) await db.insert(t.user).values(fixDates(tables.user));
  if (tables.account?.length) await db.insert(t.account).values(fixDates(tables.account));
  if (tables.clinic_settings?.length) await db.insert(t.clinicSettings).values(tables.clinic_settings);
  if (tables.rooms?.length) await db.insert(t.rooms).values(tables.rooms);
  if (tables.room_availability?.length) await db.insert(t.roomAvailability).values(tables.room_availability);
  if (tables.fixed_assignments?.length) await db.insert(t.fixedAssignments).values(fixDates(tables.fixed_assignments));
  if (tables.recurring_reductions?.length) await db.insert(t.recurringReductions).values(fixDates(tables.recurring_reductions));
  if (tables.one_time_absences?.length) await db.insert(t.oneTimeAbsences).values(fixDates(tables.one_time_absences));
  if (tables.one_time_bookings?.length) await db.insert(t.oneTimeBookings).values(fixDates(tables.one_time_bookings));
  if (tables.swap_requests?.length) await db.insert(t.swapRequests).values(fixDates(tables.swap_requests));
  if (tables.notifications?.length) await db.insert(t.notifications).values(fixDates(tables.notifications));

  console.log("Restore complete. Users must log in again (sessions were not restored).");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
