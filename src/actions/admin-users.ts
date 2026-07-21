"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { auth } from "@/lib/auth/auth";
import { requireAdmin } from "@/lib/auth/session";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import { nextFreeCombo } from "@/lib/palette";

const USERNAME_RE = /^[a-z0-9._-]+$/;

const createUserSchema = z.object({
  name: z.string().min(2).max(60),
  username: z.string().min(2).max(30).regex(USERNAME_RE, "שם משתמש באנגלית קטנה, ספרות, נקודה או מקף"),
  tempPassword: z.string().min(8).max(72),
  role: z.enum(["admin", "user"]),
  tier: z.enum(["staff", "intern", "student"]),
  // color/pattern are auto-assigned to stay unique; an explicit color is optional
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function createStaffUser(
  input: z.infer<typeof createUserSchema>
): Promise<ActionResult<{ userId: string }>> {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  await requireAdmin();
  const d = parsed.data;

  const existing = await db.select().from(t.user).where(eq(t.user.username, d.username));
  if (existing.length > 0) return { error: "שם המשתמש כבר תפוס" };

  // pick a color+pattern not used by any other user, so everyone stays distinct
  const all = await db.select({ color: t.user.color, pattern: t.user.pattern }).from(t.user);
  const combo = nextFreeCombo(all);

  try {
    const created = await auth.api.createUser({
      headers: await headers(),
      body: {
        email: `${d.username}@clinic.local`,
        password: d.tempPassword,
        name: d.name,
        role: d.role,
      },
    });
    await db
      .update(t.user)
      .set({
        username: d.username,
        displayUsername: d.username,
        tier: d.tier,
        color: d.color ?? combo.color,
        pattern: d.color ? "solid" : combo.pattern,
        mustSetPassword: true,
        emailVerified: true,
      })
      .where(eq(t.user.id, created.user.id));
    revalidatePath("/admin/users");
    return { ok: true, userId: created.user.id };
  } catch (e) {
    console.error(e);
    return { error: "יצירת המשתמש נכשלה" };
  }
}

const updateUserSchema = z.object({
  userId: z.string(),
  name: z.string().min(2).max(60).optional(),
  username: z.string().min(2).max(30).regex(USERNAME_RE, "שם משתמש באנגלית קטנה, ספרות, נקודה או מקף").optional(),
  role: z.enum(["admin", "user"]).optional(),
  tier: z.enum(["staff", "intern", "student"]).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  pattern: z.enum(["solid", "stripes", "dots"]).optional(),
  isActive: z.boolean().optional(),
});

export async function updateStaffUser(
  input: z.infer<typeof updateUserSchema>
): Promise<ActionResult> {
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  const session = await requireAdmin();
  const { userId, username, ...fields } = parsed.data;
  if (userId === session.user.id && fields.role === "user") {
    return { error: "אי אפשר להוריד הרשאות ניהול לעצמך" };
  }
  if (userId === session.user.id && fields.isActive === false) {
    return { error: "אי אפשר להשבית את החשבון של עצמך" };
  }

  // username is the login id — enforce uniqueness and keep the derived email in sync
  const updates: Record<string, unknown> = { ...fields };
  if (username) {
    const clash = await db.select().from(t.user).where(eq(t.user.username, username));
    if (clash.some((u) => u.id !== userId)) return { error: "שם המשתמש כבר תפוס" };
    updates.username = username;
    updates.displayUsername = username;
    updates.email = `${username}@clinic.local`;
  }

  await db.update(t.user).set(updates).where(eq(t.user.id, userId));

  // deactivation must actually lock the account, not just hide it from boards:
  // ban blocks future sign-ins, revoke kills sessions on every device
  if (fields.isActive === false) {
    const hdrs = await headers();
    await auth.api.banUser({ headers: hdrs, body: { userId, banReason: "הושבת על ידי הניהול" } });
    await auth.api.revokeUserSessions({ headers: hdrs, body: { userId } });
  } else if (fields.isActive === true) {
    await auth.api.unbanUser({ headers: await headers(), body: { userId } });
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Admin resets a forgotten password: sets a new temp password, kicks the user
 * out of all devices, and forces them to choose their own password on next login.
 */
export async function resetUserPassword(
  userId: string,
  tempPassword: string
): Promise<ActionResult> {
  await requireAdmin();
  if (tempPassword.length < 8) return { error: "סיסמה זמנית קצרה מדי (מינימום 8 תווים)" };
  try {
    const hdrs = await headers();
    await auth.api.setUserPassword({
      headers: hdrs,
      body: { userId, newPassword: tempPassword },
    });
    await auth.api.revokeUserSessions({ headers: hdrs, body: { userId } });
    await db.update(t.user).set({ mustSetPassword: true }).where(eq(t.user.id, userId));
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { error: "איפוס הסיסמה נכשל" };
  }
}

/**
 * Permanent deletion — for staff who left the clinic for good.
 * Only allowed on already-deactivated users; wipes their assignments,
 * bookings, absences, swaps and notifications via FK cascade.
 */
export async function deleteStaffUser(userId: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (userId === session.user.id) return { error: "אי אפשר למחוק את החשבון של עצמך" };
  const [target] = await db.select().from(t.user).where(eq(t.user.id, userId));
  if (!target) return { error: "המשתמש לא נמצא" };
  if (target.isActive) return { error: "יש להשבית את המשתמש לפני מחיקה לצמיתות" };
  await db.delete(t.user).where(eq(t.user.id, userId));
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

/** Admin-only list including tier — never call from user-facing screens. */
export async function listStaff() {
  await requireAdmin();
  const rows = await db.select().from(t.user);
  rows.sort((a, b) => a.name.localeCompare(b.name, "he"));
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    tier: u.tier,
    color: u.color,
    pattern: u.pattern,
    isActive: u.isActive,
    mustSetPassword: u.mustSetPassword,
  }));
}
