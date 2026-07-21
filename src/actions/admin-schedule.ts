"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { notifyMany } from "@/lib/notifications";
import { DAY_NAMES, fmtRange } from "@/lib/schedule/slots";
import { getScheduleConfig, checkWindow } from "@/lib/schedule/config";
import type { ActionResult } from "@/lib/action-result";

const timeField = () => z.number().int().min(0).max(1440).multipleOf(30);

const assignmentSchema = z
  .object({
    id: z.string().uuid().optional(),
    userId: z.string(),
    roomId: z.string().uuid(),
    dayOfWeek: z.number().int().min(0).max(5),
    startMin: timeField(),
    endMin: timeField(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    kind: z.enum(["regular", "group"]).default("regular"),
  })
  .refine((v) => v.endMin > v.startMin);

export async function upsertAssignment(
  input: z.infer<typeof assignmentSchema>
): Promise<ActionResult<{ assignmentId: string }>> {
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  await requireAdmin();
  const { id, ...fields } = parsed.data;
  const windowErr = checkWindow(await getScheduleConfig(), fields.startMin, fields.endMin);
  if (windowErr) return { error: windowErr };

  let assignmentId = id;
  if (id) {
    await db
      .update(t.fixedAssignments)
      .set({ ...fields, effectiveTo: fields.effectiveTo ?? null, source: "admin" })
      .where(eq(t.fixedAssignments.id, id));
  } else {
    const [row] = await db
      .insert(t.fixedAssignments)
      .values({ ...fields, effectiveTo: fields.effectiveTo ?? null, source: "admin" })
      .returning();
    assignmentId = row.id;
  }

  await notifyMany([
    {
      userId: fields.userId,
      type: "admin_change",
      payload: {
        change: id ? "עודכן שיבוץ קבוע" : "נוסף שיבוץ קבוע",
        dayName: DAY_NAMES[fields.dayOfWeek],
        range: fmtRange(fields.startMin, fields.endMin),
      },
    },
  ]);

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, assignmentId };
}

const editHoursSchema = z
  .object({
    assignmentId: z.string().uuid(),
    startMin: timeField(),
    endMin: timeField(),
  })
  .refine((v) => v.endMin > v.startMin);

/** Directly change a fixed assignment's hours (e.g. trim the end of the day). */
export async function updateAssignmentHours(
  assignmentId: string,
  startMin: number,
  endMin: number
): Promise<ActionResult> {
  const parsed = editHoursSchema.safeParse({ assignmentId, startMin, endMin });
  if (!parsed.success) return { error: "טווח שעות לא תקין" };
  await requireAdmin();
  const windowErr = checkWindow(await getScheduleConfig(), startMin, endMin);
  if (windowErr) return { error: windowErr };
  const [a] = await db.select().from(t.fixedAssignments).where(eq(t.fixedAssignments.id, assignmentId));
  if (!a) return { error: "השיבוץ לא נמצא" };
  await db
    .update(t.fixedAssignments)
    .set({ startMin, endMin, source: "admin" })
    .where(eq(t.fixedAssignments.id, assignmentId));
  await notifyMany([
    {
      userId: a.userId,
      type: "admin_change",
      payload: {
        change: `עודכנו שעות השיבוץ הקבוע שלך ביום ${DAY_NAMES[a.dayOfWeek]}`,
        range: fmtRange(startMin, endMin),
      },
    },
  ]);
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

/** Soft-end an assignment from a given date (history preserved). */
export async function endAssignment(id: string, effectiveTo: string): Promise<ActionResult> {
  await requireAdmin();
  const [a] = await db.select().from(t.fixedAssignments).where(eq(t.fixedAssignments.id, id));
  if (!a) return { error: "השיבוץ לא נמצא" };
  await db
    .update(t.fixedAssignments)
    .set({ effectiveTo })
    .where(eq(t.fixedAssignments.id, id));
  await notifyMany([
    {
      userId: a.userId,
      type: "admin_change",
      payload: {
        change: "הסתיים שיבוץ קבוע",
        dayName: DAY_NAMES[a.dayOfWeek],
        range: fmtRange(a.startMin, a.endMin),
        from: effectiveTo,
      },
    },
  ]);
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteAssignment(id: string): Promise<ActionResult> {
  await requireAdmin();
  const [a] = await db.select().from(t.fixedAssignments).where(eq(t.fixedAssignments.id, id));
  if (!a) return { error: "השיבוץ לא נמצא" };
  await db.delete(t.fixedAssignments).where(eq(t.fixedAssignments.id, id));
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

const scheduledMoveSchema = z
  .object({
    assignmentId: z.string().uuid(),
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    newRoomId: z.string().uuid().optional(),
    newDayOfWeek: z.number().int().min(0).max(5).optional(),
    newStartMin: timeField().optional(),
    newEndMin: timeField().optional(),
  })
  .refine((v) => v.newStartMin == null || v.newEndMin == null || v.newEndMin > v.newStartMin, {
    message: "טווח שעות הפוך",
  });

/**
 * Scheduled future change: "starting date X this user's fixed slot moves".
 * Can change room, day-of-week and/or hours. Ends the current assignment the
 * day before and opens the updated one from that date — history preserved,
 * the change activates by itself when the date arrives.
 */
export async function scheduleAssignmentMove(
  input: z.infer<typeof scheduledMoveSchema>
): Promise<ActionResult> {
  const parsed = scheduledMoveSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  await requireAdmin();
  const { assignmentId, fromDate, newRoomId, newDayOfWeek, newStartMin, newEndMin } = parsed.data;

  const [a] = await db.select().from(t.fixedAssignments).where(eq(t.fixedAssignments.id, assignmentId));
  if (!a) return { error: "השיבוץ לא נמצא" };
  if (a.effectiveTo && a.effectiveTo < fromDate) return { error: "השיבוץ מסתיים לפני התאריך שנבחר" };

  const roomId = newRoomId ?? a.roomId;
  const dayOfWeek = newDayOfWeek ?? a.dayOfWeek;
  const startMin = newStartMin ?? a.startMin;
  const endMin = newEndMin ?? a.endMin;
  const unchanged = roomId === a.roomId && dayOfWeek === a.dayOfWeek && startMin === a.startMin && endMin === a.endMin;
  if (unchanged) return { error: "לא נבחר שום שינוי" };
  const windowErr = checkWindow(await getScheduleConfig(), startMin, endMin);
  if (windowErr) return { error: windowErr };

  const dayBefore = new Date(fromDate + "T12:00:00");
  dayBefore.setDate(dayBefore.getDate() - 1);
  const effectiveTo = dayBefore.toISOString().slice(0, 10);

  await db.update(t.fixedAssignments).set({ effectiveTo }).where(eq(t.fixedAssignments.id, assignmentId));
  await db.insert(t.fixedAssignments).values({
    userId: a.userId,
    roomId,
    dayOfWeek,
    startMin,
    endMin,
    effectiveFrom: fromDate,
    source: "admin",
    kind: a.kind as "regular" | "group",
  });

  const [room] = await db.select().from(t.rooms).where(eq(t.rooms.id, roomId));
  const parts: string[] = [];
  if (roomId !== a.roomId) parts.push(`חדר: ${room?.name ?? "חדר אחר"}`);
  if (dayOfWeek !== a.dayOfWeek) parts.push(`יום: ${DAY_NAMES[dayOfWeek]}`);
  if (startMin !== a.startMin || endMin !== a.endMin) parts.push(`שעות: ${fmtRange(startMin, endMin)}`);
  await notifyMany([
    {
      userId: a.userId,
      type: "admin_change",
      payload: { change: `החל מ־${fromDate} השיבוץ הקבוע שלך משתנה — ${parts.join(", ")}` },
    },
  ]);

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

// ---------- free-text room labels ----------

const labelSchema = z
  .object({
    id: z.string().uuid().optional(),
    roomId: z.string().uuid(),
    text: z.string().min(1).max(60),
    recurring: z.boolean(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    dayOfWeek: z.number().int().min(0).max(5).nullable(),
    startMin: timeField(),
    endMin: timeField(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })
  .refine((v) => v.endMin > v.startMin, { message: "טווח שעות הפוך" })
  .refine((v) => (v.recurring ? v.dayOfWeek != null : v.date != null), { message: "חסר יום/תאריך" });

export async function upsertLabel(input: z.infer<typeof labelSchema>): Promise<ActionResult> {
  const parsed = labelSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "נתונים לא תקינים" };
  await requireAdmin();
  const d = parsed.data;
  const windowErr = checkWindow(await getScheduleConfig(), d.startMin, d.endMin);
  if (windowErr) return { error: windowErr };
  const values = {
    roomId: d.roomId,
    text: d.text,
    date: d.recurring ? null : d.date,
    dayOfWeek: d.recurring ? d.dayOfWeek : null,
    startMin: d.startMin,
    endMin: d.endMin,
    effectiveFrom: d.recurring ? d.effectiveFrom ?? null : null,
    color: d.color ?? "#64748b",
  };
  if (d.id) {
    await db.update(t.manualLabels).set(values).where(eq(t.manualLabels.id, d.id));
  } else {
    await db.insert(t.manualLabels).values(values);
  }
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteLabel(id: string): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(t.manualLabels).where(eq(t.manualLabels.id, id));
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

const adminBookingSchema = z
  .object({
    userId: z.string(),
    roomId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startMin: timeField(),
    endMin: timeField(),
    kind: z.enum(["regular", "group"]).default("regular"),
  })
  .refine((v) => v.endMin > v.startMin);

export async function adminCreateBooking(
  input: z.infer<typeof adminBookingSchema>
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = adminBookingSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  await requireAdmin();
  const d = parsed.data;
  const windowErr = checkWindow(await getScheduleConfig(), d.startMin, d.endMin);
  if (windowErr) return { error: windowErr };
  const [row] = await db
    .insert(t.oneTimeBookings)
    .values({ ...d, source: "admin" })
    .returning();
  const [room] = await db.select().from(t.rooms).where(eq(t.rooms.id, d.roomId));
  await notifyMany([
    {
      userId: d.userId,
      type: "admin_change",
      payload: {
        change: "שובצת לחדר",
        roomName: room?.name,
        date: d.date,
        range: fmtRange(d.startMin, d.endMin),
      },
    },
  ]);
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, bookingId: row.id };
}

// ---------- AI proposal change-sets ----------

export type ProposalChange =
  | {
      op: "add_assignment";
      userId: string;
      roomId: string;
      dayOfWeek: number;
      startMin: number;
      endMin: number;
      effectiveFrom: string;
      kind?: "regular" | "group";
    }
  | { op: "end_assignment"; assignmentId: string; effectiveTo: string }
  | { op: "move_assignment"; assignmentId: string; newRoomId?: string; newDayOfWeek?: number }
  | {
      op: "add_booking";
      userId: string;
      roomId: string;
      date: string;
      startMin: number;
      endMin: number;
      kind?: "regular" | "group";
    }
  // one-time absence — e.g. vacating someone's fixed room for a specific window
  | {
      op: "add_absence";
      userId: string;
      dateFrom: string;
      dateTo: string;
      startMin: number | null;
      endMin: number | null;
      note?: string;
    };

/** Executes an AI-proposed change-set after explicit admin confirmation. */
export async function applyProposal(
  changes: ProposalChange[]
): Promise<ActionResult<{ appliedCount: number; applied: string[] }>> {
  await requireAdmin();
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 30) {
    return { error: "סט שינויים לא תקין" };
  }

  const cfg = await getScheduleConfig();
  const affected = new Set<string>();
  const applied: string[] = [];

  for (const c of changes) {
    if ((c.op === "add_assignment" || c.op === "add_booking" || (c.op === "add_absence" && c.startMin != null)) &&
        checkWindow(cfg, (c as { startMin: number }).startMin, (c as { endMin: number }).endMin)) {
      return { error: "שינוי בסט חורג משעות הפעילות", applied };
    }
    if (c.op === "add_assignment") {
      const res = assignmentSchema.safeParse({ ...c, effectiveTo: null });
      if (!res.success) return { error: "שינוי לא תקין בסט", applied };
      await db.insert(t.fixedAssignments).values({
        userId: c.userId,
        roomId: c.roomId,
        dayOfWeek: c.dayOfWeek,
        startMin: c.startMin,
        endMin: c.endMin,
        effectiveFrom: c.effectiveFrom,
        source: "admin",
        kind: c.kind ?? "regular",
      });
      affected.add(c.userId);
      applied.push("add_assignment");
    } else if (c.op === "end_assignment") {
      const [a] = await db
        .select()
        .from(t.fixedAssignments)
        .where(eq(t.fixedAssignments.id, c.assignmentId));
      if (a) {
        await db
          .update(t.fixedAssignments)
          .set({ effectiveTo: c.effectiveTo })
          .where(eq(t.fixedAssignments.id, c.assignmentId));
        affected.add(a.userId);
        applied.push("end_assignment");
      }
    } else if (c.op === "move_assignment") {
      const [a] = await db
        .select()
        .from(t.fixedAssignments)
        .where(eq(t.fixedAssignments.id, c.assignmentId));
      if (a) {
        await db
          .update(t.fixedAssignments)
          .set({
            roomId: c.newRoomId ?? a.roomId,
            dayOfWeek: c.newDayOfWeek ?? a.dayOfWeek,
            source: "admin",
          })
          .where(eq(t.fixedAssignments.id, c.assignmentId));
        affected.add(a.userId);
        applied.push("move_assignment");
      }
    } else if (c.op === "add_booking") {
      const res = adminBookingSchema.safeParse(c);
      if (!res.success) return { error: "שינוי לא תקין בסט", applied };
      await db.insert(t.oneTimeBookings).values({
        userId: c.userId,
        roomId: c.roomId,
        date: c.date,
        startMin: c.startMin,
        endMin: c.endMin,
        source: "admin",
        kind: c.kind ?? "regular",
      });
      affected.add(c.userId);
      applied.push("add_booking");
    } else if (c.op === "add_absence") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(c.dateFrom) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(c.dateTo) ||
        (c.startMin == null) !== (c.endMin == null)
      ) {
        return { error: "שינוי לא תקין בסט", applied };
      }
      await db.insert(t.oneTimeAbsences).values({
        userId: c.userId,
        dateFrom: c.dateFrom,
        dateTo: c.dateTo,
        startMin: c.startMin,
        endMin: c.endMin,
        note: c.note,
        createdBy: "admin",
      });
      affected.add(c.userId);
      applied.push("add_absence");
    }
  }

  await notifyMany(
    [...affected].map((userId) => ({
      userId,
      type: "admin_change" as const,
      payload: { change: "הלו״ז שלך עודכן על ידי הניהול — כדאי להציץ" },
    }))
  );

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, appliedCount: applied.length };
}
