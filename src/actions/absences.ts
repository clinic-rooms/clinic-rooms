"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { notify } from "@/lib/notifications";
import { checkWaitlistForDates, datesInRange } from "@/lib/waitlist";
import { maskFor, dowOf } from "@/lib/schedule/slots";
import { getScheduleConfig, checkWindow } from "@/lib/schedule/config";
import { todayIL } from "@/lib/dates";
import type { ActionResult } from "@/lib/action-result";

const absenceSchema = z
  .object({
    userId: z.string().optional(), // admin may act for another user
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startMin: z.number().int().min(0).max(1440).multipleOf(30).nullable(),
    endMin: z.number().int().min(0).max(1440).multipleOf(30).nullable(),
    note: z.string().max(200).optional(),
  })
  .refine((v) => v.dateTo >= v.dateFrom, { message: "טווח תאריכים הפוך" })
  .refine((v) => (v.startMin == null) === (v.endMin == null), { message: "שעות חלקיות" })
  .refine((v) => v.startMin == null || v.endMin! > v.startMin, { message: "טווח שעות הפוך" });

async function resolveActor(requestedUserId?: string) {
  const session = await requireUser();
  const isAdmin = session.user.role === "admin";
  const userId = isAdmin && requestedUserId ? requestedUserId : session.user.id;
  return { session, isAdmin, userId, actingForOther: userId !== session.user.id };
}

/**
 * Someone may have booked the window this absence freed — restoring it would
 * double-book. Returns true if any active booking overlaps the user's fixed
 * rooms during the absence window.
 */
async function restoredWindowConflicts(
  userId: string,
  dateFrom: string,
  dateTo: string,
  startMin: number | null,
  endMin: number | null
): Promise<boolean> {
  const assignments = await db
    .select()
    .from(t.fixedAssignments)
    .where(eq(t.fixedAssignments.userId, userId));
  if (assignments.length === 0) return false;

  const bookings = await db
    .select()
    .from(t.oneTimeBookings)
    .where(
      and(
        gte(t.oneTimeBookings.date, dateFrom < todayIL() ? todayIL() : dateFrom),
        lte(t.oneTimeBookings.date, dateTo),
        eq(t.oneTimeBookings.status, "active"),
        ne(t.oneTimeBookings.userId, userId)
      )
    );
  if (bookings.length === 0) return false;

  const cfg = await getScheduleConfig();
  const absMask = startMin == null ? cfg.fullMask : maskFor(cfg, startMin, endMin!);
  for (const b of bookings) {
    const dow = dowOf(b.date);
    for (const a of assignments) {
      if (a.roomId !== b.roomId || a.dayOfWeek !== dow) continue;
      if (b.date < a.effectiveFrom || (a.effectiveTo && b.date > a.effectiveTo)) continue;
      const overlap = maskFor(cfg, a.startMin, a.endMin) & maskFor(cfg, b.startMin, b.endMin) & absMask;
      if (overlap) return true;
    }
  }
  return false;
}

export async function createAbsence(
  input: z.infer<typeof absenceSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = absenceSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  const { userId, actingForOther, session } = await resolveActor(parsed.data.userId);
  if (parsed.data.startMin != null) {
    const windowErr = checkWindow(await getScheduleConfig(), parsed.data.startMin, parsed.data.endMin!);
    if (windowErr) return { error: windowErr };
  }

  const [row] = await db
    .insert(t.oneTimeAbsences)
    .values({
      userId,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      startMin: parsed.data.startMin,
      endMin: parsed.data.endMin,
      note: parsed.data.note,
      createdBy: actingForOther ? "admin" : "self",
    })
    .returning();

  if (actingForOther) {
    await notify(userId, "vacation_added", {
      by: session.user.name,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      startMin: parsed.data.startMin,
      endMin: parsed.data.endMin,
    });
  }

  // an absence frees the user's room — notify anyone waiting for a matching window
  await checkWaitlistForDates(datesInRange(parsed.data.dateFrom, parsed.data.dateTo));

  revalidatePath("/");
  revalidatePath("/absences");
  revalidatePath("/admin");
  return { ok: true, id: row.id };
}

export async function updateAbsence(
  id: string,
  input: z.infer<typeof absenceSchema>
): Promise<ActionResult> {
  const parsed = absenceSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  const { userId, isAdmin, session } = await resolveActor(parsed.data.userId);

  const [existing] = await db.select().from(t.oneTimeAbsences).where(eq(t.oneTimeAbsences.id, id));
  if (!existing) return { error: "הרשומה לא נמצאה" };
  if (existing.userId !== session.user.id && !isAdmin) return { error: "אין הרשאה" };

  // shrinking/moving the absence restores slots — guard against booked windows
  const conflict = await restoredWindowConflicts(
    existing.userId,
    existing.dateFrom,
    existing.dateTo,
    existing.startMin,
    existing.endMin
  );
  if (conflict) {
    return {
      error: "מישהו כבר שובץ לחדר שלך בזמן הזה. לשינוי — פנו למנהל/ת המרפאה.",
    };
  }

  await db
    .update(t.oneTimeAbsences)
    .set({
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      startMin: parsed.data.startMin,
      endMin: parsed.data.endMin,
      note: parsed.data.note,
    })
    .where(eq(t.oneTimeAbsences.id, id));

  revalidatePath("/");
  revalidatePath("/absences");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteAbsence(id: string): Promise<ActionResult> {
  const session = await requireUser();
  const isAdmin = session.user.role === "admin";

  const [existing] = await db.select().from(t.oneTimeAbsences).where(eq(t.oneTimeAbsences.id, id));
  if (!existing) return { error: "הרשומה לא נמצאה" };
  if (existing.userId !== session.user.id && !isAdmin) return { error: "אין הרשאה" };

  const conflict = await restoredWindowConflicts(
    existing.userId,
    existing.dateFrom,
    existing.dateTo,
    existing.startMin,
    existing.endMin
  );
  if (conflict) {
    return {
      error: "מישהו כבר שובץ לחדר שלך בזמן הזה, לכן אי אפשר לבטל את ההיעדרות. פנו למנהל/ת המרפאה.",
    };
  }

  await db.delete(t.oneTimeAbsences).where(eq(t.oneTimeAbsences.id, id));
  revalidatePath("/");
  revalidatePath("/absences");
  revalidatePath("/admin");
  return { ok: true };
}

export async function listMyAbsences(forUserId?: string) {
  const { userId } = await resolveActor(forUserId);
  const rows = await db
    .select()
    .from(t.oneTimeAbsences)
    .where(eq(t.oneTimeAbsences.userId, userId));
  rows.sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
  return rows;
}
