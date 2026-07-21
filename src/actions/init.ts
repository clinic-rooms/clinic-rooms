"use server";

import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { runMigrations } from "@/lib/db/migrate";
import type { ActionResult } from "@/lib/action-result";

const USERNAME_RE = /^[a-z0-9._-]+$/;

const schema = z.object({
  name: z.string().min(2).max(60),
  username: z.string().min(2).max(30).regex(USERNAME_RE, "שם משתמש באנגלית קטנה, ספרות, נקודה או מקף"),
  password: z.string().min(8).max(72),
});

async function userCount(): Promise<number> {
  const rows = await db.select({ id: t.user.id }).from(t.user).limit(1);
  return rows.length;
}

/**
 * Browser first-run: creates the very first admin account.
 * Only possible while the user table is EMPTY — the moment an account exists
 * this action refuses, so it exposes nothing on an installed system.
 */
export async function createFirstAdmin(
  input: z.infer<typeof schema>
): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const d = parsed.data;
  const username = d.username.toLowerCase();

  // fresh deployments may reach here before the build-time migration ran
  let count: number;
  try {
    count = await userCount();
  } catch {
    await runMigrations();
    count = await userCount();
  }
  if (count > 0) return { error: "המערכת כבר הוגדרה — יש להתחבר בעמוד הכניסה" };

  await db
    .insert(t.clinicSettings)
    .values({ id: "main", setupComplete: false })
    .onConflictDoNothing();

  const adminId = "u_admin_initial";
  const hashed = await hashPassword(d.password);
  await db.insert(t.user).values({
    id: adminId,
    name: d.name,
    email: `${username}@clinic.local`,
    emailVerified: true,
    username,
    displayUsername: username,
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

  return { ok: true };
}
