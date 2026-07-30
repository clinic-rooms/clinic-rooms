import { and, gte, isNull, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { todayIL } from "@/lib/dates";
import { VacationsBoard, type VacationRow } from "@/components/vacations-board";

export const dynamic = "force-dynamic";

/** Centralized full-day absences/vacations board for the admin. */
export default async function VacationsPage() {
  await requireAdmin();
  const today = todayIL();

  const rows = await db
    .select({
      id: t.oneTimeAbsences.id,
      userId: t.oneTimeAbsences.userId,
      dateFrom: t.oneTimeAbsences.dateFrom,
      dateTo: t.oneTimeAbsences.dateTo,
      note: t.oneTimeAbsences.note,
      createdBy: t.oneTimeAbsences.createdBy,
      userName: t.user.name,
      color: t.user.color,
      pattern: t.user.pattern,
    })
    .from(t.oneTimeAbsences)
    .innerJoin(t.user, eq(t.oneTimeAbsences.userId, t.user.id))
    // full days only — hour-level vacates stay on the daily board
    .where(and(isNull(t.oneTimeAbsences.startMin), gte(t.oneTimeAbsences.dateTo, today)))
    .orderBy(t.oneTimeAbsences.dateFrom);

  return <VacationsBoard rows={rows as VacationRow[]} today={today} />;
}
