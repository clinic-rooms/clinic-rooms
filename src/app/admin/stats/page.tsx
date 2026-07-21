import { requireAdmin } from "@/lib/auth/session";
import { loadEngineData, getActiveDays, activeWeekDates } from "@/lib/schedule/data";
import { computeDaySchedule } from "@/lib/schedule/engine";
import { countSlots, slotToMin, fmtMin, addDays } from "@/lib/schedule/slots";
import { todayIL } from "@/lib/dates";
import { StatsScreen, type RoomStat, type SlotStat } from "@/components/stats-screen";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  await requireAdmin();
  const today = todayIL();
  const activeDays = await getActiveDays();
  const dates = activeWeekDates(today, activeDays);
  const dataset = await loadEngineData(today, addDays(today, 7));
  const cfg = dataset.cfg;

  // aggregate occupied vs open slots per room and per slot-of-day over the week
  const roomAgg = new Map<string, { name: string; occ: number; open: number; sort: number }>();
  const slotOcc = new Array(cfg.nSlots).fill(0);
  const slotOpen = new Array(cfg.nSlots).fill(0);
  let peakOcc = 0;
  let peakOpen = 0;

  for (const date of dates) {
    const schedule = computeDaySchedule(dataset.dayData(date));
    for (const rd of schedule.rooms) {
      if (rd.openMask === 0) continue;
      const a = roomAgg.get(rd.room.id) ?? { name: rd.room.name, occ: 0, open: 0, sort: rd.room.sortOrder };
      a.occ += countSlots(rd.occupiedMask);
      a.open += countSlots(rd.openMask);
      roomAgg.set(rd.room.id, a);
      for (let s = 0; s < cfg.nSlots; s++) {
        const bit = 1 << s;
        if (rd.openMask & bit) {
          slotOpen[s]++;
          if (rd.occupiedMask & bit) slotOcc[s]++;
        }
      }
      peakOpen += countSlots(rd.openMask & cfg.peakMask);
      peakOcc += countSlots(rd.occupiedMask & cfg.peakMask);
    }
  }

  const rooms: RoomStat[] = [...roomAgg.values()]
    .map((a) => ({
      name: a.name,
      pct: a.open === 0 ? 0 : Math.round((a.occ / a.open) * 100),
      occupiedHours: a.occ / 2,
      openHours: a.open / 2,
    }))
    .sort((a, b) => b.pct - a.pct);

  const peak: SlotStat[] = Array.from({ length: cfg.nSlots }, (_, s) => ({
    label: fmtMin(slotToMin(cfg, s)),
    pct: slotOpen[s] === 0 ? 0 : Math.round((slotOcc[s] / slotOpen[s]) * 100),
  }));

  const totalOcc = rooms.reduce((sum, r) => sum + r.occupiedHours, 0);
  const totalOpen = rooms.reduce((sum, r) => sum + r.openHours, 0);
  const busiestSlot = peak.reduce((m, s) => (s.pct > m.pct ? s : m), peak[0]);

  return (
    <StatsScreen
      rooms={rooms}
      peak={peak}
      overallPct={totalOpen === 0 ? 0 : Math.round((totalOcc / totalOpen) * 100)}
      peakHoursPct={peakOpen === 0 ? 0 : Math.round((peakOcc / peakOpen) * 100)}
      busiestLabel={busiestSlot?.label ?? "-"}
      daysCount={dates.length}
    />
  );
}
