"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { getScheduleConfig, checkWindow } from "@/lib/schedule/config";
import type { ActionResult } from "@/lib/action-result";

const roomSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(40),
  isPool: z.boolean(),
  isGroupRoom: z.boolean(),
  hasWindow: z.boolean(),
  hasSink: z.boolean(),
  isLarge: z.boolean(),
  notes: z.string().max(200).optional(),
  sortOrder: z.number().int().optional(),
});

export async function upsertRoom(
  input: z.infer<typeof roomSchema>
): Promise<ActionResult<{ roomId: string }>> {
  const parsed = roomSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  await requireAdmin();
  const { id, ...fields } = parsed.data;

  if (id) {
    await db.update(t.rooms).set(fields).where(eq(t.rooms.id, id));
    revalidatePath("/admin/rooms");
    revalidatePath("/admin");
    return { ok: true, roomId: id };
  }
  const maxSort = (await db.select().from(t.rooms)).reduce((m, r) => Math.max(m, r.sortOrder), 0);
  const [row] = await db
    .insert(t.rooms)
    .values({ ...fields, sortOrder: fields.sortOrder ?? maxSort + 1 })
    .returning();
  revalidatePath("/admin/rooms");
  revalidatePath("/admin");
  return { ok: true, roomId: row.id };
}

const windowsSchema = z.object({
  roomId: z.string().uuid(),
  windows: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(0).max(5),
          startMin: z.number().int().min(0).max(1440).multipleOf(30),
          endMin: z.number().int().min(0).max(1440).multipleOf(30),
          effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
          effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        })
        .refine((w) => w.endMin > w.startMin)
    )
    .max(20),
});

/** Replace all availability windows of a room (the rooms screen edits the full list). */
export async function setAvailabilityWindows(
  input: z.infer<typeof windowsSchema>
): Promise<ActionResult> {
  const parsed = windowsSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  await requireAdmin();
  const { roomId, windows } = parsed.data;
  const cfg = await getScheduleConfig();
  for (const w of windows) {
    const err = checkWindow(cfg, w.startMin, w.endMin);
    if (err) return { error: err };
  }

  await db.delete(t.roomAvailability).where(eq(t.roomAvailability.roomId, roomId));
  if (windows.length > 0) {
    await db.insert(t.roomAvailability).values(windows.map((w) => ({ roomId, ...w })));
  }
  revalidatePath("/admin/rooms");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function setRoomActive(roomId: string, isActive: boolean): Promise<ActionResult> {
  await requireAdmin();
  await db.update(t.rooms).set({ isActive }).where(eq(t.rooms.id, roomId));
  revalidatePath("/admin/rooms");
  revalidatePath("/admin");
  return { ok: true };
}

export async function listRoomsWithWindows() {
  await requireAdmin();
  const [rooms, windows] = await Promise.all([
    db.select().from(t.rooms),
    db.select().from(t.roomAvailability),
  ]);
  rooms.sort((a, b) => a.sortOrder - b.sortOrder);
  return rooms.map((r) => ({
    ...r,
    windows: windows
      .filter((w) => w.roomId === r.id)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMin - b.startMin),
  }));
}
