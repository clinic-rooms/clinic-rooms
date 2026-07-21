import "server-only";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { sendPushToUser, type PushPayload } from "@/lib/push";
import { fmtDateShort } from "@/lib/dates";

export type NotificationType =
  | "swap_request"
  | "swap_accepted"
  | "swap_declined"
  | "booking_confirmed"
  | "admin_change"
  | "vacation_added"
  | "room_available";

/** Short Hebrew push text derived from a notification, or null to skip push. */
function pushFor(type: NotificationType, p: Record<string, unknown>): PushPayload | null {
  const s = (v: unknown) => (v == null ? "" : String(v));
  switch (type) {
    case "swap_request":
      return { title: "בקשת החלפה חדשה", body: `${s(p.from)} מבקש/ת את ${s(p.roomName)} (${s(p.range)})`, url: "/notifications" };
    case "swap_accepted":
      return { title: "החלפה אושרה", body: `${s(p.by)} · ${s(p.roomName)} ${s(p.range)}`, url: "/" };
    case "swap_declined":
      return { title: "בקשת החלפה נדחתה", body: `${s(p.by)} (${s(p.range)})`, url: "/notifications" };
    case "admin_change":
      return { title: "עדכון בלו״ז שלך", body: s(p.change), url: "/" };
    case "vacation_added":
      return { title: "נרשמה עבורך חופשה", body: `${fmtDateShort(s(p.dateFrom))}${p.dateTo && p.dateTo !== p.dateFrom ? ` עד ${fmtDateShort(s(p.dateTo))}` : ""}`, url: "/absences" };
    case "room_available":
      return { title: "התפנה חדר שהמתנת לו", body: `${s(p.roomName)} · ${s(p.range)}`, url: "/request" };
    case "booking_confirmed":
      return null; // the user just did this themselves — no push needed
    default:
      return null;
  }
}

export async function notify(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>
) {
  await db.insert(notifications).values({ userId, type, payload });
  const push = pushFor(type, payload);
  if (push) await sendPushToUser(userId, push).catch(() => {});
}

export async function notifyMany(
  items: { userId: string; type: NotificationType; payload: Record<string, unknown> }[]
) {
  if (items.length === 0) return;
  await db.insert(notifications).values(items);
  await Promise.all(
    items.map((i) => {
      const push = pushFor(i.type, i.payload);
      return push ? sendPushToUser(i.userId, push).catch(() => {}) : Promise.resolve();
    })
  );
}
