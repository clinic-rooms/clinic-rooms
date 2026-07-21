"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/action-result";

type SubInput = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function savePushSubscription(sub: SubInput): Promise<ActionResult> {
  const session = await requireUser();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "מנוי לא תקין" };
  await db
    .insert(pushSubscriptions)
    .values({ userId: session.user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: session.user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  await requireUser();
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  return { ok: true };
}
