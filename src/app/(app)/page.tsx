import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { loadEngineData, getActiveDays, activeWeekDates } from "@/lib/schedule/data";
import { computeDaySchedule, userDayOccupancy } from "@/lib/schedule/engine";
import { maskToRanges, addDays, fmtMin } from "@/lib/schedule/slots";
import { todayIL } from "@/lib/dates";
import { MySchedule, type MyDay } from "@/components/my-schedule";
import { TodayDigest } from "@/components/today-digest";

export const dynamic = "force-dynamic";

export default async function MySchedulePage() {
  const session = await requireUser();
  const today = todayIL();
  const activeDays = await getActiveDays();
  const dates = activeWeekDates(today, activeDays);
  const dataset = await loadEngineData(today, addDays(today, 7));

  const days: MyDay[] = dates.map((date) => {
    const schedule = computeDaySchedule(dataset.dayData(date));
    // labels have userId "" so a user's own occupancy is only fixed/booking
    const mine = userDayOccupancy(schedule, session.user.id).filter(
      ({ occupant }) => occupant.source !== "label"
    );
    const items = mine.flatMap(({ roomDay, occupant }) => {
      const source = occupant.source as "fixed" | "booking";
      const active = maskToRanges(dataset.cfg, occupant.mask).map((r) => ({
        roomId: roomDay.room.id,
        roomName: roomDay.room.name,
        startMin: r.startMin,
        endMin: r.endMin,
        kind: occupant.kind,
        source,
        refId: occupant.refId,
        freed: false,
      }));
      const freed = maskToRanges(dataset.cfg, occupant.freedMask).map((r) => ({
        roomId: roomDay.room.id,
        roomName: roomDay.room.name,
        startMin: r.startMin,
        endMin: r.endMin,
        kind: occupant.kind,
        source,
        refId: occupant.refId,
        freed: true,
      }));
      return [...active, ...freed];
    });
    items.sort((a, b) => a.startMin - b.startMin);
    return { date, items };
  });

  // today digest: pending swaps + today's closure + today's rooms count
  const pendingSwaps = await db
    .select({ id: t.swapRequests.id })
    .from(t.swapRequests)
    .where(and(eq(t.swapRequests.targetUserId, session.user.id), eq(t.swapRequests.status, "pending")));

  const todayClosure = dataset.resolveClosure(today);
  const todayItems = days.find((d) => d.date === today)?.items.filter((i) => !i.freed) ?? [];
  const isTodayActive = activeDays.includes(new Date(today + "T12:00:00").getDay());

  return (
    <div className="space-y-4">
      <TodayDigest
        firstName={session.user.name.split(" ")[0]}
        today={today}
        pendingSwaps={pendingSwaps.length}
        rooms={todayItems.map((i) => ({ roomName: i.roomName, range: `${fmtMin(i.startMin)}–${fmtMin(i.endMin)}` }))}
        closure={
          todayClosure
            ? { type: todayClosure.type, label: todayClosure.label, endLabel: fmtMin(todayClosure.endMin) }
            : null
        }
        clinicClosedToday={!isTodayActive}
      />
      <MySchedule days={days} today={today} />
    </div>
  );
}
