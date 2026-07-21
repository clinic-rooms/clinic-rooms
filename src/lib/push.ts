import "server-only";
import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@clinic.local", pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string };

/**
 * Best-effort push to all of a user's devices. Never throws (notifications must
 * not fail because a push failed); prunes dead subscriptions (410/404).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  let subs;
  try {
    subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  } catch {
    return;
  }
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 410 || code === 404) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint)).catch(() => {});
        }
      }
    })
  );
}
