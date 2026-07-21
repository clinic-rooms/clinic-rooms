"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { notify, notifyMany } from "@/lib/notifications";
import { loadEngineData, buildScoringContext, getActiveDays } from "@/lib/schedule/data";
import { computeDaySchedule, userDayOccupancy } from "@/lib/schedule/engine";
import { rankFreeRooms } from "@/lib/schedule/scoring";
import {
  suggestAlternatives,
  suggestSwaps,
  checkRecurring,
  type Alternative,
  type SwapCandidate,
} from "@/lib/schedule/suggestions";
import { maskFor, addDays, dowOf, covers, fmtRange, DAY_NAMES } from "@/lib/schedule/slots";
import { checkWindow } from "@/lib/schedule/config";
import { todayIL } from "@/lib/dates";
import type { ActionResult } from "@/lib/action-result";
import { checkWaitlistForDates } from "@/lib/waitlist";

const searchSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startMin: z.number().int().min(0).max(1440).multipleOf(30),
    endMin: z.number().int().min(0).max(1440).multipleOf(30),
    sessionType: z.enum(["regular", "couples", "group"]),
    recurring: z.boolean(),
    wantWindow: z.boolean().optional(),
    wantSink: z.boolean().optional(),
    wantLarge: z.boolean().optional(),
  })
  .refine((v) => v.endMin > v.startMin, { message: "טווח שעות הפוך" });

export type BookingOption = {
  roomId: string;
  roomName: string;
  reasons: string[];
  hasWindow: boolean;
  hasSink: boolean;
  isLarge: boolean;
  isGroupRoom: boolean;
};

export type SearchResult =
  | { error: string }
  | {
      options: BookingOption[];
      alternatives: Alternative[];
      swapCandidates: (SwapCandidate & { targetName: string })[];
      recurringNote?: string;
    };

export async function searchBooking(input: z.infer<typeof searchSchema>): Promise<SearchResult> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  const session = await requireUser();
  const { date, startMin, endMin, sessionType, recurring } = parsed.data;

  const activeDays = await getActiveDays();
  if (!activeDays.includes(dowOf(date))) return { error: "המרפאה אינה פעילה ביום זה" };
  if (date < todayIL()) return { error: "אי אפשר להזמין חדר בתאריך שעבר" };

  // wide load: alternatives may look ±2 days; recurring checks 8 weeks ahead
  const dataset = await loadEngineData(addDays(date, -2), addDays(date, recurring ? 60 : 2));
  const windowErr = checkWindow(dataset.cfg, startMin, endMin);
  if (windowErr) return { error: windowErr };
  const ctx = buildScoringContext(dataset, session.user.id, dowOf(date), todayIL());

  const filters = sessionType === "group" ? { isGroupRoom: true } : undefined;
  const preferences = {
    hasWindow: parsed.data.wantWindow,
    hasSink: parsed.data.wantSink,
    isLarge: sessionType === "couples" ? true : parsed.data.wantLarge,
  };

  const wanted = maskFor(dataset.cfg, startMin, endMin);
  const schedule = computeDaySchedule(dataset.dayData(date));
  let ranked = rankFreeRooms(schedule, wanted, ctx, { filters, preferences });

  // recurring request: keep only rooms free on the next 8 occurrences too
  let recurringNote: string | undefined;
  if (recurring && ranked.length > 0) {
    const ok = ranked.filter(
      (r) =>
        checkRecurring(
          (d) => dataset.dayData(d),
          r.room.id,
          date,
          dowOf(date),
          startMin,
          endMin
        ).ok
    );
    if (ok.length === 0) {
      recurringNote =
        "אין חדר שפנוי בקביעות בשעה הזו בשבועות הקרובים — מוצגות אפשרויות חד־פעמיות בלבד.";
    } else {
      ranked = ok;
    }
  }

  if (ranked.length > 0) {
    return {
      options: ranked.slice(0, 3).map((r) => ({
        roomId: r.room.id,
        roomName: r.room.name,
        reasons: r.reasons,
        hasWindow: r.room.hasWindow,
        hasSink: r.room.hasSink,
        isLarge: r.room.isLarge,
        isGroupRoom: r.room.isGroupRoom,
      })),
      alternatives: [],
      swapCandidates: [],
      recurringNote,
    };
  }

  // nothing free — alternatives + swap candidates
  const alternatives = suggestAlternatives(
    (d) => (d >= addDays(date, -2) && d <= addDays(date, 2) ? dataset.dayData(d) : null),
    date,
    startMin,
    endMin,
    ctx,
    { filters, preferences, activeDays, limit: 4 }
  );

  // in the group flow the requester offers their own room for that window
  let offeredRoomId: string | null = null;
  if (sessionType === "group") {
    const mine = userDayOccupancy(schedule, session.user.id).find(({ occupant }) =>
      covers(occupant.mask, wanted)
    );
    offeredRoomId = mine?.roomDay.room.id ?? null;
  }

  const swapCandidates = suggestSwaps(
    schedule,
    wanted,
    session.user.id,
    (targetId) => buildScoringContext(dataset, targetId, dowOf(date), todayIL()),
    { filters, offeredRoomId }
  ).slice(0, 4);

  const userById = new Map(dataset.users.map((u) => [u.id, u.name]));
  return {
    options: [],
    alternatives,
    swapCandidates: swapCandidates.map((c) => ({
      ...c,
      targetName: userById.get(c.targetUserId) ?? "מטפל/ת",
    })),
    recurringNote,
  };
}

// ---------- confirm one-time ----------

const confirmSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.number().int().min(0).max(1440).multipleOf(30),
  endMin: z.number().int().min(0).max(1440).multipleOf(30),
  roomId: z.string().uuid(),
  kind: z.enum(["regular", "group"]).default("regular"),
});

export async function confirmBooking(
  input: z.infer<typeof confirmSchema>
): Promise<ActionResult<{ bookingId: string; roomName: string }>> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  const session = await requireUser();
  const { date, startMin, endMin, roomId, kind } = parsed.data;
  if (date < todayIL()) return { error: "אי אפשר להזמין חדר בתאריך שעבר" };

  // verify still free
  const dataset = await loadEngineData(date, date);
  const windowErr = checkWindow(dataset.cfg, startMin, endMin);
  if (windowErr) return { error: windowErr };
  const schedule = computeDaySchedule(dataset.dayData(date));
  const rd = schedule.rooms.find((r) => r.room.id === roomId);
  const wanted = maskFor(dataset.cfg, startMin, endMin);
  if (!rd || !covers(rd.freeMask, wanted)) {
    return { error: "החדר כבר נתפס — נסו לחפש שוב" };
  }

  const [booking] = await db
    .insert(t.oneTimeBookings)
    .values({ userId: session.user.id, roomId, date, startMin, endMin, kind, source: "request" })
    .returning();

  // insert-then-verify: on a race, the earliest booking wins
  const overlapping = await db
    .select()
    .from(t.oneTimeBookings)
    .where(
      and(
        eq(t.oneTimeBookings.roomId, roomId),
        eq(t.oneTimeBookings.date, date),
        eq(t.oneTimeBookings.status, "active")
      )
    );
  const clash = overlapping.filter(
    (b) => b.id !== booking.id && maskFor(dataset.cfg, b.startMin, b.endMin) & wanted
  );
  if (clash.some((b) => b.createdAt <= booking.createdAt)) {
    await db.delete(t.oneTimeBookings).where(eq(t.oneTimeBookings.id, booking.id));
    return { error: "החדר נתפס ממש עכשיו על ידי מישהו אחר — נסו שוב" };
  }

  // no self-confirmation notification — the user just did this and saw a toast
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, bookingId: booking.id, roomName: rd.room.name };
}

export async function cancelBooking(id: string): Promise<ActionResult> {
  const session = await requireUser();
  const isAdmin = session.user.role === "admin";
  const [b] = await db.select().from(t.oneTimeBookings).where(eq(t.oneTimeBookings.id, id));
  if (!b) return { error: "ההזמנה לא נמצאה" };
  if (b.userId !== session.user.id && !isAdmin) return { error: "אין הרשאה" };
  await db
    .update(t.oneTimeBookings)
    .set({ status: "cancelled" })
    .where(eq(t.oneTimeBookings.id, id));
  // cancelling frees the room — notify anyone waiting for that date
  await checkWaitlistForDates([b.date]);
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

/** Undo for cancelBooking — restores if the window is still free. */
export async function restoreBooking(id: string): Promise<ActionResult> {
  const session = await requireUser();
  const isAdmin = session.user.role === "admin";
  const [b] = await db.select().from(t.oneTimeBookings).where(eq(t.oneTimeBookings.id, id));
  if (!b) return { error: "ההזמנה לא נמצאה" };
  if (b.userId !== session.user.id && !isAdmin) return { error: "אין הרשאה" };

  const dataset = await loadEngineData(b.date, b.date);
  const schedule = computeDaySchedule(dataset.dayData(b.date));
  const rd = schedule.rooms.find((r) => r.room.id === b.roomId);
  if (!rd || !covers(rd.freeMask, maskFor(dataset.cfg, b.startMin, b.endMin))) {
    return { error: "החלון כבר נתפס — אי אפשר לשחזר את ההזמנה" };
  }
  await db.update(t.oneTimeBookings).set({ status: "active" }).where(eq(t.oneTimeBookings.id, id));
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

// ---------- confirm recurring ----------

const recurringSchema = z.object({
  roomId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(5),
  startMin: z.number().int().min(0).max(1440).multipleOf(30),
  endMin: z.number().int().min(0).max(1440).multipleOf(30),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["regular", "group"]).default("regular"),
});

export async function confirmRecurring(
  input: z.infer<typeof recurringSchema>
): Promise<ActionResult<{ assignmentId: string; roomName: string; pending: boolean }>> {
  const parsed = recurringSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  const session = await requireUser();
  const isAdmin = session.user.role === "admin";
  const { roomId, dayOfWeek, startMin, endMin, effectiveFrom, kind } = parsed.data;

  const dataset = await loadEngineData(effectiveFrom, addDays(effectiveFrom, 60));
  const recurringWindowErr = checkWindow(dataset.cfg, startMin, endMin);
  if (recurringWindowErr) return { error: recurringWindowErr };
  const check = checkRecurring(
    (d) => dataset.dayData(d),
    roomId,
    effectiveFrom,
    dayOfWeek,
    startMin,
    endMin
  );
  if (!check.ok) {
    return {
      error: `החדר תפוס בחלק מהמועדים הקרובים (למשל ${check.conflicts[0]?.date ?? ""}) — נסו שעה או חדר אחרים`,
    };
  }

  const room = dataset.rooms.find((r) => r.id === roomId);

  // adding permanent hours is admin-controlled: a regular user's request goes to
  // an approval queue; an admin's request is applied directly.
  if (!isAdmin) {
    await db.insert(t.assignmentRequests).values({
      userId: session.user.id,
      roomId,
      dayOfWeek,
      startMin,
      endMin,
      effectiveFrom,
      kind,
    });
    const admins = await db.select({ id: t.user.id }).from(t.user).where(eq(t.user.role, "admin"));
    await notifyMany(
      admins.map((a) => ({
        userId: a.id,
        type: "admin_change" as const,
        payload: {
          change: `${session.user.name} מבקש/ת שעה קבועה ב${room?.name ?? "חדר"} (יום ${DAY_NAMES[dayOfWeek]} ${fmtRange(startMin, endMin)}) — ממתין לאישורך`,
        },
      }))
    );
    revalidatePath("/notifications");
    return { ok: true, pending: true, roomName: room?.name ?? "" };
  }

  const [row] = await db
    .insert(t.fixedAssignments)
    .values({ userId: session.user.id, roomId, dayOfWeek, startMin, endMin, effectiveFrom, source: "request", kind })
    .returning();

  // admin booked directly for themselves — no self-notification needed
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, assignmentId: row.id, roomName: room?.name, pending: false };
}
