"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { notify } from "@/lib/notifications";
import { loadEngineData } from "@/lib/schedule/data";
import { computeDaySchedule } from "@/lib/schedule/engine";
import { maskFor, covers, fmtRange } from "@/lib/schedule/slots";
import { getScheduleConfig, checkWindow } from "@/lib/schedule/config";
import { todayIL } from "@/lib/dates";
import type { ActionResult } from "@/lib/action-result";

const createSchema = z
  .object({
    targetUserId: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startMin: z.number().int().min(0).max(1440).multipleOf(30),
    endMin: z.number().int().min(0).max(1440).multipleOf(30),
    roomId: z.string().uuid(),
    altRoomId: z.string().uuid().nullable().optional(),
    message: z.string().max(300).optional(),
    kind: z.enum(["regular", "group"]).default("regular"),
  })
  .refine((v) => v.endMin > v.startMin);

export async function createSwapRequest(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ swapId: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  const session = await requireUser();
  const d = parsed.data;
  if (d.targetUserId === session.user.id) return { error: "אי אפשר לבקש החלפה מעצמך" };
  if (d.date < todayIL()) return { error: "תאריך שעבר" };
  const cfg = await getScheduleConfig();
  const windowErr = checkWindow(cfg, d.startMin, d.endMin);
  if (windowErr) return { error: windowErr };

  // avoid duplicate pending requests for the same window
  const existing = await db
    .select()
    .from(t.swapRequests)
    .where(
      and(
        eq(t.swapRequests.requesterId, session.user.id),
        eq(t.swapRequests.targetUserId, d.targetUserId),
        eq(t.swapRequests.date, d.date),
        eq(t.swapRequests.status, "pending")
      )
    );
  if (existing.some((r) => maskFor(cfg, r.startMin, r.endMin) & maskFor(cfg, d.startMin, d.endMin))) {
    return { error: "כבר קיימת בקשת החלפה ממתינה לחלון הזה" };
  }

  const [row] = await db
    .insert(t.swapRequests)
    .values({
      requesterId: session.user.id,
      targetUserId: d.targetUserId,
      date: d.date,
      startMin: d.startMin,
      endMin: d.endMin,
      roomId: d.roomId,
      altRoomId: d.altRoomId ?? null,
      message: d.message,
      kind: d.kind,
    })
    .returning();

  const [room] = await db.select().from(t.rooms).where(eq(t.rooms.id, d.roomId));
  await notify(d.targetUserId, "swap_request", {
    swapId: row.id,
    from: session.user.name,
    date: d.date,
    range: fmtRange(d.startMin, d.endMin),
    roomName: room?.name,
    message: d.message,
  });

  revalidatePath("/notifications");
  return { ok: true, swapId: row.id };
}

export async function respondToSwap(swapId: string, accept: boolean): Promise<ActionResult> {
  const session = await requireUser();
  const [swap] = await db.select().from(t.swapRequests).where(eq(t.swapRequests.id, swapId));
  if (!swap) return { error: "הבקשה לא נמצאה" };
  if (swap.targetUserId !== session.user.id) return { error: "אין הרשאה" };
  if (swap.status !== "pending") return { error: "הבקשה כבר טופלה" };

  const [requester] = await db.select().from(t.user).where(eq(t.user.id, swap.requesterId));

  if (!accept) {
    await db
      .update(t.swapRequests)
      .set({ status: "declined", resolvedAt: new Date() })
      .where(eq(t.swapRequests.id, swapId));
    await notify(swap.requesterId, "swap_declined", {
      by: session.user.name,
      date: swap.date,
      range: fmtRange(swap.startMin, swap.endMin),
    });
    revalidatePath("/notifications");
    return { ok: true };
  }

  // --- accept: verify the swap is still executable ---
  const dataset = await loadEngineData(swap.date, swap.date);
  const schedule = computeDaySchedule(dataset.dayData(swap.date));
  const wanted = maskFor(dataset.cfg, swap.startMin, swap.endMin);

  const rd = schedule.rooms.find((r) => r.room.id === swap.roomId);
  if (!rd) return { error: "החדר אינו זמין עוד" };
  // the window must be held by the target (and only them)
  const blockers = rd.occupants.filter((o) => o.mask & wanted);
  if (blockers.some((o) => o.userId !== swap.targetUserId)) {
    await db
      .update(t.swapRequests)
      .set({ status: "expired", resolvedAt: new Date() })
      .where(eq(t.swapRequests.id, swapId));
    return { error: "החלון השתנה מאז שנשלחה הבקשה — ההחלפה בוטלה" };
  }

  // alt room (if offered) must still be free for the target
  if (swap.altRoomId) {
    const alt = schedule.rooms.find((r) => r.room.id === swap.altRoomId);
    if (!alt || !covers(alt.freeMask, wanted)) {
      return { error: "החדר החלופי שהוצע כבר נתפס — פנו למבקש/ת" };
    }
  }

  // execute: target absence + requester booking (+ target booking in alt room)
  await db.batch([
    db.insert(t.oneTimeAbsences).values({
      userId: swap.targetUserId,
      dateFrom: swap.date,
      dateTo: swap.date,
      startMin: swap.startMin,
      endMin: swap.endMin,
      note: `החלפה עם ${requester?.name ?? ""}`.trim(),
      createdBy: "self",
    }),
    db.insert(t.oneTimeBookings).values({
      userId: swap.requesterId,
      roomId: swap.roomId,
      date: swap.date,
      startMin: swap.startMin,
      endMin: swap.endMin,
      source: "swap",
      kind: swap.kind as "regular" | "group",
    }),
    ...(swap.altRoomId
      ? [
          db.insert(t.oneTimeBookings).values({
            userId: swap.targetUserId,
            roomId: swap.altRoomId,
            date: swap.date,
            startMin: swap.startMin,
            endMin: swap.endMin,
            source: "swap",
            kind: "regular" as const,
          }),
        ]
      : []),
    db
      .update(t.swapRequests)
      .set({ status: "accepted", resolvedAt: new Date() })
      .where(eq(t.swapRequests.id, swapId)),
  ]);

  const roomName = rd.room.name;
  const altName = swap.altRoomId
    ? schedule.rooms.find((r) => r.room.id === swap.altRoomId)?.room.name
    : null;
  await notify(swap.requesterId, "swap_accepted", {
    by: session.user.name,
    date: swap.date,
    range: fmtRange(swap.startMin, swap.endMin),
    roomName,
  });
  await notify(swap.targetUserId, "swap_accepted", {
    by: requester?.name,
    date: swap.date,
    range: fmtRange(swap.startMin, swap.endMin),
    roomName: altName ? `עברת ל${altName}` : `פינית את ${roomName}`,
    self: true,
  });

  revalidatePath("/");
  revalidatePath("/notifications");
  revalidatePath("/admin");
  return { ok: true };
}

export async function cancelSwapRequest(swapId: string): Promise<ActionResult> {
  const session = await requireUser();
  const [swap] = await db.select().from(t.swapRequests).where(eq(t.swapRequests.id, swapId));
  if (!swap) return { error: "הבקשה לא נמצאה" };
  if (swap.requesterId !== session.user.id && session.user.role !== "admin")
    return { error: "אין הרשאה" };
  if (swap.status !== "pending") return { error: "הבקשה כבר טופלה" };
  await db
    .update(t.swapRequests)
    .set({ status: "cancelled", resolvedAt: new Date() })
    .where(eq(t.swapRequests.id, swapId));
  revalidatePath("/notifications");
  return { ok: true };
}
