"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";

export async function markRead(id: string) {
  const session = await requireUser();
  await db
    .update(t.notifications)
    .set({ isRead: true })
    .where(and(eq(t.notifications.id, id), eq(t.notifications.userId, session.user.id)));
  revalidatePath("/notifications");
  return { ok: true };
}

export async function markAllRead() {
  const session = await requireUser();
  await db
    .update(t.notifications)
    .set({ isRead: true })
    .where(and(eq(t.notifications.userId, session.user.id), eq(t.notifications.isRead, false)));
  revalidatePath("/notifications");
  return { ok: true };
}
