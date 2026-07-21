"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/action-result";
import { maskFor } from "@/lib/schedule/slots";
import { getScheduleConfig, checkWindow } from "@/lib/schedule/config";
import { todayIL } from "@/lib/dates";

const createSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startMin: z.number().int().min(0).max(1440).multipleOf(30),
    endMin: z.number().int().min(0).max(1440).multipleOf(30),
    kind: z.enum(["regular", "group"]).default("regular"),
    wantWindow: z.boolean().optional(),
    wantLarge: z.boolean().optional(),
  })
  .refine((v) => v.endMin > v.startMin, { message: "טווח שעות הפוך" });

export async function joinWaitlist(
  input: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  const session = await requireUser();
  const d = parsed.data;
  if (d.date < todayIL()) return { error: "תאריך שעבר" };
  const cfg = await getScheduleConfig();
  const windowErr = checkWindow(cfg, d.startMin, d.endMin);
  if (windowErr) return { error: windowErr };

  // don't duplicate an overlapping active waitlist entry
  const existing = await db
    .select()
    .from(t.roomRequests)
    .where(
      and(
        eq(t.roomRequests.userId, session.user.id),
        eq(t.roomRequests.date, d.date),
        eq(t.roomRequests.status, "waiting")
      )
    );
  if (existing.some((e) => maskFor(cfg, e.startMin, e.endMin) & maskFor(cfg, d.startMin, d.endMin))) {
    return { error: "כבר קיימת רשימת המתנה לחלון הזה" };
  }

  const [row] = await db
    .insert(t.roomRequests)
    .values({
      userId: session.user.id,
      date: d.date,
      startMin: d.startMin,
      endMin: d.endMin,
      kind: d.kind,
      wantWindow: d.wantWindow ?? false,
      wantLarge: d.wantLarge ?? false,
    })
    .returning();

  revalidatePath("/request");
  return { ok: true, id: row.id };
}

export async function cancelWaitlist(id: string): Promise<ActionResult> {
  const session = await requireUser();
  const [row] = await db.select().from(t.roomRequests).where(eq(t.roomRequests.id, id));
  if (!row) return { error: "הרשומה לא נמצאה" };
  if (row.userId !== session.user.id && session.user.role !== "admin") return { error: "אין הרשאה" };
  await db
    .update(t.roomRequests)
    .set({ status: "cancelled" })
    .where(eq(t.roomRequests.id, id));
  revalidatePath("/request");
  return { ok: true };
}

export async function listMyWaitlist() {
  const session = await requireUser();
  const rows = await db
    .select()
    .from(t.roomRequests)
    .where(eq(t.roomRequests.userId, session.user.id))
    .orderBy(desc(t.roomRequests.createdAt));
  const today = todayIL();
  return rows
    .filter((r) => (r.status === "waiting" || r.status === "notified") && r.date >= today)
    .map((r) => ({
      id: r.id,
      date: r.date,
      startMin: r.startMin,
      endMin: r.endMin,
      kind: r.kind,
      status: r.status,
    }));
}
