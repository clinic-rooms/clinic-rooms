"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { validateDayBounds } from "@/lib/schedule/slots";
import type { ActionResult } from "@/lib/action-result";

const schema = z.object({
  clinicName: z.string().min(1).max(40),
  activeDays: z.array(z.number().int().min(0).max(5)).min(1).max(6),
  dayStartMin: z.number().int().min(0).max(1440).multipleOf(30),
  dayEndMin: z.number().int().min(0).max(1440).multipleOf(30),
  // set after the admin explicitly approved narrowing the clinic day
  confirmNarrowing: z.boolean().optional(),
});

async function ensureSettingsRow() {
  const existing = await db.select().from(t.clinicSettings).limit(1);
  if (existing.length > 0) return existing[0];
  const [row] = await db.insert(t.clinicSettings).values({ id: "main" }).returning();
  return row;
}

/** Turn the public read-only share link on (new random token) or off (null). */
export async function setShareLink(enabled: boolean): Promise<ActionResult<{ token: string | null }>> {
  await requireAdmin();
  const row = await ensureSettingsRow();
  let token: string | null = null;
  if (enabled) {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  await db.update(t.clinicSettings).set({ shareToken: token }).where(eq(t.clinicSettings.id, row.id));
  revalidatePath("/admin/settings");
  return { ok: true, token };
}

/** Master switch for all Claude/AI features. */
export async function setAiEnabled(enabled: boolean): Promise<ActionResult> {
  await requireAdmin();
  const row = await ensureSettingsRow();
  await db.update(t.clinicSettings).set({ aiEnabled: enabled }).where(eq(t.clinicSettings.id, row.id));
  revalidatePath("/admin/settings");
  revalidatePath("/admin/chat");
  revalidatePath("/absences");
  return { ok: true };
}

/**
 * Saves (or clears, with null) the Anthropic API key pasted in-app.
 * Stored encrypted with BETTER_AUTH_SECRET — never returned to the client.
 */
export async function setAnthropicKey(key: string | null): Promise<ActionResult> {
  await requireAdmin();
  if (key !== null) {
    const trimmed = key.trim();
    if (!trimmed.startsWith("sk-ant-") || trimmed.length < 20 || trimmed.length > 300) {
      return { error: "מפתח Anthropic מתחיל ב-sk-ant-" };
    }
    const { sealSecret } = await import("@/lib/secretbox");
    const row = await ensureSettingsRow();
    await db
      .update(t.clinicSettings)
      .set({ anthropicApiKey: sealSecret(trimmed) })
      .where(eq(t.clinicSettings.id, row.id));
  } else {
    const row = await ensureSettingsRow();
    await db.update(t.clinicSettings).set({ anthropicApiKey: null }).where(eq(t.clinicSettings.id, row.id));
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/chat");
  revalidatePath("/absences");
  return { ok: true };
}

export async function updateSettings(
  input: z.infer<typeof schema>
): Promise<ActionResult<{ needsConfirm?: boolean; affected?: number }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  await requireAdmin();
  const activeDays = [...new Set(parsed.data.activeDays)].sort();
  const { dayStartMin, dayEndMin } = parsed.data;

  const boundsErr = validateDayBounds(dayStartMin, dayEndMin);
  if (boundsErr) return { error: boundsErr };

  const existing = await db.select().from(t.clinicSettings).limit(1);
  const prev = existing[0];
  const prevStart = prev?.dayStartMin ?? 420;
  const prevEnd = prev?.dayEndMin ?? 1140;

  // narrowing hides out-of-bounds portions of existing schedules (data is kept
  // and reappears if hours are widened again) — make the admin approve first
  const narrowing = dayStartMin > prevStart || dayEndMin < prevEnd;
  if (narrowing && !parsed.data.confirmNarrowing) {
    const [assignments, availability] = await Promise.all([
      db.select().from(t.fixedAssignments),
      db.select().from(t.roomAvailability),
    ]);
    const outOfBounds = (r: { startMin: number; endMin: number }) =>
      r.startMin < dayStartMin || r.endMin > dayEndMin;
    const affected = assignments.filter(outOfBounds).length + availability.filter(outOfBounds).length;
    if (affected > 0) return { ok: true, needsConfirm: true, affected };
  }

  const values = { clinicName: parsed.data.clinicName, activeDays, dayStartMin, dayEndMin };
  if (prev) {
    await db.update(t.clinicSettings).set(values).where(eq(t.clinicSettings.id, prev.id));
  } else {
    await db.insert(t.clinicSettings).values({ id: "main", ...values });
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}
