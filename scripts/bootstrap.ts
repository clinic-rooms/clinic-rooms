/**
 * Bootstrap script — creates the minimal state for a fresh install:
 * one clinic_settings row (setup not complete yet) and one admin user.
 * The rest (name, days, hours, rooms, staff) is configured in the in-app
 * first-run wizard at /setup.
 *
 * Inputs via environment variables (the setup wizard passes them for you):
 *   CLINIC_NAME     — initial clinic name (optional, editable later)
 *   ADMIN_NAME      — the admin's display name
 *   ADMIN_USERNAME  — login username (lowercase english)
 *   ADMIN_PASSWORD  — login password (min 8 chars)
 *
 * Run: npm run db:bootstrap        (aborts if users already exist)
 *      npm run db:bootstrap -- --force   (re-creates on a non-empty DB — careful!)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hashPassword } from "better-auth/crypto";
import * as t from "../src/lib/db/schema";

const sql = neon((process.env.DATABASE_URL ?? process.env.POSTGRES_URL)!);
const db = drizzle(sql, { schema: t });

const USERNAME_RE = /^[a-z0-9._-]+$/;

async function main() {
  const force = process.argv.includes("--force");
  const clinicName = (process.env.CLINIC_NAME || "המרפאה").trim().slice(0, 40);
  const adminName = (process.env.ADMIN_NAME || "").trim();
  const adminUsername = (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "";

  if (adminName.length < 2) throw new Error("ADMIN_NAME is missing or too short");
  if (!USERNAME_RE.test(adminUsername) || adminUsername.length < 2) {
    throw new Error("ADMIN_USERNAME must be lowercase english (letters/digits/dot/dash)");
  }
  if (adminPassword.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");

  const existingUsers = await db.select({ id: t.user.id }).from(t.user).limit(1);
  if (existingUsers.length > 0 && !force) {
    throw new Error(
      "The database already contains users - running again would wipe them. If that is intended, run with --force"
    );
  }

  if (force) {
    // wipe (order matters for FKs)
    await db.delete(t.notifications);
    await db.delete(t.swapRequests);
    await db.delete(t.roomRequests);
    await db.delete(t.assignmentRequests);
    await db.delete(t.oneTimeBookings);
    await db.delete(t.oneTimeAbsences);
    await db.delete(t.recurringReductions);
    await db.delete(t.fixedAssignments);
    await db.delete(t.manualLabels);
    await db.delete(t.roomAvailability);
    await db.delete(t.rooms);
    await db.delete(t.clinicClosures);
    await db.delete(t.pushSubscriptions);
    await db.delete(t.clinicSettings);
    await db.delete(t.session);
    await db.delete(t.account);
    await db.delete(t.verification);
    await db.delete(t.user);
  }

  await db
    .insert(t.clinicSettings)
    .values({ id: "main", clinicName, setupComplete: false })
    .onConflictDoNothing();

  const hashed = await hashPassword(adminPassword);
  const adminId = "u_admin_initial";
  await db.insert(t.user).values({
    id: adminId,
    name: adminName,
    email: `${adminUsername}@clinic.local`,
    emailVerified: true,
    username: adminUsername,
    displayUsername: adminUsername,
    role: "admin",
    tier: "staff",
    color: "#0d9488",
    mustSetPassword: false, // the admin chose this password themselves
    isActive: true,
  });
  await db.insert(t.account).values({
    id: `acc_${adminId}`,
    accountId: adminId,
    providerId: "credential",
    userId: adminId,
    password: hashed,
  });

  console.log(`[OK] Clinic created with admin account: ${adminUsername}`);
  console.log("     A short Hebrew setup wizard opens inside the app on first login.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
);
