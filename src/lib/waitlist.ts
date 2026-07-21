import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { loadEngineData, buildScoringContext } from "@/lib/schedule/data";
import { computeDaySchedule } from "@/lib/schedule/engine";
import { rankFreeRooms } from "@/lib/schedule/scoring";
import { maskFor, dowOf, fmtRange, addDays } from "@/lib/schedule/slots";
import { getScheduleConfig } from "@/lib/schedule/config";
import { notify } from "@/lib/notifications";
import { todayIL } from "@/lib/dates";

type WaitRow = typeof t.roomRequests.$inferSelect;

/**
 * For each still-waiting entry, check whether a matching room is now free; if so
 * notify the user (in-app + push) and mark it notified so we don't spam.
 * Best-effort: never throws (callers are mutations that must still succeed).
 */
async function runWaitlistCheck(entries: WaitRow[]): Promise<void> {
  const waiting = entries.filter((e) => e.status === "waiting");
  if (waiting.length === 0) return;

  const dates = waiting.map((e) => e.date).sort();
  const dataset = await loadEngineData(dates[0], dates[dates.length - 1]);
  const today = todayIL();

  for (const e of waiting) {
    const schedule = computeDaySchedule(dataset.dayData(e.date));
    const ctx = buildScoringContext(dataset, e.userId, dowOf(e.date), today);
    const filters = e.kind === "group" ? { isGroupRoom: true } : undefined;
    const ranked = rankFreeRooms(schedule, maskFor(dataset.cfg, e.startMin, e.endMin), ctx, { filters });
    if (ranked.length === 0) continue;

    await db
      .update(t.roomRequests)
      .set({ status: "notified", notifiedAt: new Date() })
      .where(eq(t.roomRequests.id, e.id));

    await notify(e.userId, "room_available", {
      roomName: ranked[0].room.name,
      date: e.date,
      range: fmtRange(e.startMin, e.endMin),
    });
  }
}

/** Called after a mutation that may free rooms on specific dates. */
export async function checkWaitlistForDates(dates: string[]): Promise<void> {
  try {
    const unique = [...new Set(dates)].filter((d) => d >= todayIL());
    if (unique.length === 0) return;
    const entries = await db
      .select()
      .from(t.roomRequests)
      .where(and(inArray(t.roomRequests.date, unique), eq(t.roomRequests.status, "waiting")));
    await runWaitlistCheck(entries);
  } catch (err) {
    console.error("waitlist check (dates) failed:", err);
  }
}

/** Called after a recurring change (reduction) that frees a weekday window from a date. */
export async function checkWaitlistRecurring(
  dayOfWeek: number,
  startMin: number,
  endMin: number,
  fromDate: string
): Promise<void> {
  try {
    const cfg = await getScheduleConfig();
    const from = fromDate < todayIL() ? todayIL() : fromDate;
    const entries = await db
      .select()
      .from(t.roomRequests)
      .where(and(gte(t.roomRequests.date, from), eq(t.roomRequests.status, "waiting")));
    const matched = entries.filter(
      (e) =>
        dowOf(e.date) === dayOfWeek &&
        (maskFor(cfg, e.startMin, e.endMin) & maskFor(cfg, startMin, endMin)) !== 0
    );
    await runWaitlistCheck(matched);
  } catch (err) {
    console.error("waitlist check (recurring) failed:", err);
  }
}

/** Dates spanned by an absence range (inclusive), capped to protect the query. */
export function datesInRange(dateFrom: string, dateTo: string, cap = 62): string[] {
  const out: string[] = [];
  let d = dateFrom;
  for (let i = 0; i < cap && d <= dateTo; i++) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
