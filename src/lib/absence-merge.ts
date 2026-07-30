import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { getActiveDays } from "@/lib/schedule/data";
import { addDays, dowOf } from "@/lib/schedule/slots";

export type AbsenceRow = typeof t.oneTimeAbsences.$inferSelect;

/** True when the gap between two date ranges contains only non-working days
 *  (e.g. Fri+Sat) — so "Sun–Thu" + "Sun–Thu" of consecutive weeks count as one
 *  continuous vacation. Overlapping/adjacent ranges always touch. */
export function rangesTouch(
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
  activeDays: number[]
): boolean {
  if (aFrom <= bTo && bFrom <= aTo) return true; // overlap
  const [earlierTo, laterFrom] = aTo < bFrom ? [aTo, bFrom] : [bTo, aFrom];
  // walk the gap; every day in it must be a non-working day
  let d = addDays(earlierTo, 1);
  let guard = 0;
  while (d < laterFrom && guard++ < 10) {
    if (activeDays.includes(dowOf(d))) return false;
    d = addDays(d, 1);
  }
  return d >= laterFrom;
}

/** Existing full-day absences of the user that overlap/touch the given range. */
export async function findTouchingFullDayAbsences(
  userId: string,
  dateFrom: string,
  dateTo: string,
  excludeId?: string
): Promise<{ touching: AbsenceRow[]; activeDays: number[] }> {
  const activeDays = await getActiveDays();
  const rows = await db
    .select()
    .from(t.oneTimeAbsences)
    .where(
      and(
        eq(t.oneTimeAbsences.userId, userId),
        isNull(t.oneTimeAbsences.startMin),
        ...(excludeId ? [ne(t.oneTimeAbsences.id, excludeId)] : [])
      )
    );
  const touching = rows
    .filter((r) => rangesTouch(r.dateFrom, r.dateTo, dateFrom, dateTo, activeDays))
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
  return { touching, activeDays };
}

export function unionRange(
  rows: { dateFrom: string; dateTo: string }[]
): { dateFrom: string; dateTo: string } {
  let from = rows[0].dateFrom;
  let to = rows[0].dateTo;
  for (const r of rows) {
    if (r.dateFrom < from) from = r.dateFrom;
    if (r.dateTo > to) to = r.dateTo;
  }
  return { dateFrom: from, dateTo: to };
}

export function mergedNote(rows: { note: string | null }[]): string | null {
  const notes = [...new Set(rows.map((r) => r.note?.trim()).filter(Boolean))] as string[];
  return notes.length ? notes.join(" · ").slice(0, 200) : null;
}

/** Merge the new range into the first touching row, absorb the rest. Returns the surviving row id. */
export async function mergeIntoExisting(
  touching: AbsenceRow[],
  dateFrom: string,
  dateTo: string,
  note?: string
): Promise<{ id: string; dateFrom: string; dateTo: string }> {
  const keep = touching[0];
  const union = unionRange([...touching, { dateFrom, dateTo }]);
  const finalNote = mergedNote([...touching, { note: note ?? null }]);
  await db
    .update(t.oneTimeAbsences)
    .set({ dateFrom: union.dateFrom, dateTo: union.dateTo, note: finalNote })
    .where(eq(t.oneTimeAbsences.id, keep.id));
  for (const r of touching.slice(1)) {
    await db.delete(t.oneTimeAbsences).where(eq(t.oneTimeAbsences.id, r.id));
  }
  return { id: keep.id, ...union };
}
