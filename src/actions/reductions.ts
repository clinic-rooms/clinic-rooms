"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { maskFor, dowOf } from "@/lib/schedule/slots";
import { getScheduleConfig, checkWindow } from "@/lib/schedule/config";
import { todayIL } from "@/lib/dates";
import type { ActionResult } from "@/lib/action-result";
import { checkWaitlistRecurring } from "@/lib/waitlist";

const reductionSchema = z
  .object({
    userId: z.string().optional(),
    dayOfWeek: z.number().int().min(0).max(5),
    startMin: z.number().int().min(0).max(1440).multipleOf(30),
    endMin: z.number().int().min(0).max(1440).multipleOf(30),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(200).optional(),
  })
  .refine((v) => v.endMin > v.startMin, { message: "טווח שעות הפוך" });

/** Removing a reduction restores recurring slots — fail if someone booked them meanwhile. */
async function restoreConflicts(
  userId: string,
  dayOfWeek: number,
  startMin: number,
  endMin: number
): Promise<boolean> {
  const [assignments, bookings] = await Promise.all([
    db.select().from(t.fixedAssignments).where(eq(t.fixedAssignments.userId, userId)),
    db
      .select()
      .from(t.oneTimeBookings)
      .where(
        and(
          gte(t.oneTimeBookings.date, todayIL()),
          eq(t.oneTimeBookings.status, "active"),
          ne(t.oneTimeBookings.userId, userId)
        )
      ),
  ]);
  const cfg = await getScheduleConfig();
  const window = maskFor(cfg, startMin, endMin);
  for (const b of bookings) {
    if (dowOf(b.date) !== dayOfWeek) continue;
    for (const a of assignments) {
      if (a.roomId !== b.roomId || a.dayOfWeek !== dayOfWeek) continue;
      if (b.date < a.effectiveFrom || (a.effectiveTo && b.date > a.effectiveTo)) continue;
      if (maskFor(cfg, a.startMin, a.endMin) & maskFor(cfg, b.startMin, b.endMin) & window) return true;
    }
  }
  return false;
}

export async function createReduction(
  input: z.infer<typeof reductionSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = reductionSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  const session = await requireUser();
  const isAdmin = session.user.role === "admin";
  const userId = isAdmin && parsed.data.userId ? parsed.data.userId : session.user.id;
  const windowErr = checkWindow(await getScheduleConfig(), parsed.data.startMin, parsed.data.endMin);
  if (windowErr) return { error: windowErr };

  const [row] = await db
    .insert(t.recurringReductions)
    .values({
      userId,
      dayOfWeek: parsed.data.dayOfWeek,
      startMin: parsed.data.startMin,
      endMin: parsed.data.endMin,
      effectiveFrom: parsed.data.effectiveFrom,
      note: parsed.data.note,
    })
    .returning();

  // a recurring reduction frees this weekday window — notify matching waiters
  await checkWaitlistRecurring(
    parsed.data.dayOfWeek,
    parsed.data.startMin,
    parsed.data.endMin,
    parsed.data.effectiveFrom
  );

  revalidatePath("/");
  revalidatePath("/absences");
  revalidatePath("/admin");
  return { ok: true, id: row.id };
}

export async function updateReduction(
  id: string,
  input: z.infer<typeof reductionSchema>
): Promise<ActionResult> {
  const parsed = reductionSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  const session = await requireUser();
  const isAdmin = session.user.role === "admin";
  const windowErr = checkWindow(await getScheduleConfig(), parsed.data.startMin, parsed.data.endMin);
  if (windowErr) return { error: windowErr };

  const [existing] = await db
    .select()
    .from(t.recurringReductions)
    .where(eq(t.recurringReductions.id, id));
  if (!existing) return { error: "הרשומה לא נמצאה" };
  if (existing.userId !== session.user.id && !isAdmin) return { error: "אין הרשאה" };

  if (
    await restoreConflicts(existing.userId, existing.dayOfWeek, existing.startMin, existing.endMin)
  ) {
    return { error: "מישהו כבר שובץ לחלון שהתפנה. לשינוי — פנו למנהל/ת המרפאה." };
  }

  await db
    .update(t.recurringReductions)
    .set({
      dayOfWeek: parsed.data.dayOfWeek,
      startMin: parsed.data.startMin,
      endMin: parsed.data.endMin,
      effectiveFrom: parsed.data.effectiveFrom,
      note: parsed.data.note,
    })
    .where(eq(t.recurringReductions.id, id));

  revalidatePath("/");
  revalidatePath("/absences");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteReduction(id: string): Promise<ActionResult> {
  const session = await requireUser();
  const isAdmin = session.user.role === "admin";

  const [existing] = await db
    .select()
    .from(t.recurringReductions)
    .where(eq(t.recurringReductions.id, id));
  if (!existing) return { error: "הרשומה לא נמצאה" };
  if (existing.userId !== session.user.id && !isAdmin) return { error: "אין הרשאה" };

  if (
    await restoreConflicts(existing.userId, existing.dayOfWeek, existing.startMin, existing.endMin)
  ) {
    return { error: "מישהו כבר שובץ לחלון שהתפנה, לכן אי אפשר לבטל את הצמצום. פנו למנהל/ת המרפאה." };
  }

  await db.delete(t.recurringReductions).where(eq(t.recurringReductions.id, id));
  revalidatePath("/");
  revalidatePath("/absences");
  revalidatePath("/admin");
  return { ok: true };
}

export async function listMyReductions(forUserId?: string) {
  const session = await requireUser();
  const isAdmin = session.user.role === "admin";
  const userId = isAdmin && forUserId ? forUserId : session.user.id;
  const rows = await db
    .select()
    .from(t.recurringReductions)
    .where(eq(t.recurringReductions.userId, userId));
  rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMin - b.startMin);
  return rows;
}
