"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/action-result";
import { notify } from "@/lib/notifications";
import { loadEngineData } from "@/lib/schedule/data";
import { checkRecurring } from "@/lib/schedule/suggestions";
import { addDays, DAY_NAMES, fmtRange } from "@/lib/schedule/slots";

export async function respondAssignmentRequest(id: string, approve: boolean): Promise<ActionResult> {
  await requireAdmin();
  const [reqRow] = await db.select().from(t.assignmentRequests).where(eq(t.assignmentRequests.id, id));
  if (!reqRow) return { error: "הבקשה לא נמצאה" };
  if (reqRow.status !== "pending") return { error: "הבקשה כבר טופלה" };

  if (!approve) {
    await db
      .update(t.assignmentRequests)
      .set({ status: "declined", resolvedAt: new Date() })
      .where(eq(t.assignmentRequests.id, id));
    await notify(reqRow.userId, "admin_change", {
      change: `בקשתך לשעה קבועה (יום ${DAY_NAMES[reqRow.dayOfWeek]} ${fmtRange(reqRow.startMin, reqRow.endMin)}) נדחתה`,
    });
    revalidatePath("/notifications");
    return { ok: true };
  }

  // re-verify the room is still free on the upcoming occurrences before granting
  const dataset = await loadEngineData(reqRow.effectiveFrom, addDays(reqRow.effectiveFrom, 60));
  const check = checkRecurring(
    (d) => dataset.dayData(d),
    reqRow.roomId,
    reqRow.effectiveFrom,
    reqRow.dayOfWeek,
    reqRow.startMin,
    reqRow.endMin
  );
  if (!check.ok) {
    return { error: `החדר כבר תפוס בחלק מהמועדים (למשל ${check.conflicts[0]?.date ?? ""}) — לא ניתן לאשר` };
  }

  await db.insert(t.fixedAssignments).values({
    userId: reqRow.userId,
    roomId: reqRow.roomId,
    dayOfWeek: reqRow.dayOfWeek,
    startMin: reqRow.startMin,
    endMin: reqRow.endMin,
    effectiveFrom: reqRow.effectiveFrom,
    source: "request",
    kind: reqRow.kind as "regular" | "group",
  });
  await db
    .update(t.assignmentRequests)
    .set({ status: "approved", resolvedAt: new Date() })
    .where(eq(t.assignmentRequests.id, id));

  const [room] = await db.select().from(t.rooms).where(eq(t.rooms.id, reqRow.roomId));
  await notify(reqRow.userId, "booking_confirmed", {
    roomName: room?.name,
    recurring: true,
    dayName: DAY_NAMES[reqRow.dayOfWeek],
    range: fmtRange(reqRow.startMin, reqRow.endMin),
  });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/notifications");
  return { ok: true };
}

/** Pending recurring-slot requests, for the admin approval inbox. */
export async function listPendingAssignmentRequests() {
  await requireAdmin();
  const rows = await db
    .select({
      id: t.assignmentRequests.id,
      dayOfWeek: t.assignmentRequests.dayOfWeek,
      startMin: t.assignmentRequests.startMin,
      endMin: t.assignmentRequests.endMin,
      effectiveFrom: t.assignmentRequests.effectiveFrom,
      userName: t.user.name,
      roomName: t.rooms.name,
    })
    .from(t.assignmentRequests)
    .innerJoin(t.user, eq(t.assignmentRequests.userId, t.user.id))
    .innerJoin(t.rooms, eq(t.assignmentRequests.roomId, t.rooms.id))
    .where(eq(t.assignmentRequests.status, "pending"))
    .orderBy(desc(t.assignmentRequests.createdAt));
  return rows;
}
