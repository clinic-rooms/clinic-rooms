import "server-only";
import { loadDayData, loadEngineData, getActiveDays, activeWeekDates } from "@/lib/schedule/data";
import { computeDaySchedule } from "@/lib/schedule/engine";
import type { RoomDay, EngineUser } from "@/lib/schedule/types";
import { dowOf, addDays, type SlotBounds, type SlotConfig } from "@/lib/schedule/slots";
import { todayIL, fmtDayMonth } from "@/lib/dates";
import type { GridCell, GridRoom, GridUser, OnLeaveEntry } from "@/components/admin-grid";

/** Slot cells for one room-day — shared by the daily board and the room-week view. */
function cellsForRoomDay(cfg: SlotConfig, rd: RoomDay, userById: Map<string, EngineUser>): GridCell[] {
  return Array.from({ length: cfg.nSlots }, (_, slot) => {
    const bit = 1 << slot;
    if ((rd.openMask & bit) === 0) return { type: "closed" as const };
    const occs = rd.occupants.filter((o) => o.mask & bit);
    if (occs.length > 0) {
      const [first, second] = occs;
      const nameOf = (o: (typeof occs)[number]) =>
        o.source === "label" ? o.label ?? "" : userById.get(o.userId)?.name ?? "?";
      const colorOf = (o: (typeof occs)[number]) =>
        o.source === "label" ? o.color ?? "#64748b" : userById.get(o.userId)?.color ?? "#888";
      const patternOf = (o: (typeof occs)[number]) =>
        o.source === "label" ? "solid" : userById.get(o.userId)?.pattern ?? "solid";
      return {
        type: "occupied" as const,
        userId: first.userId,
        name: nameOf(first),
        color: colorOf(first),
        pattern: patternOf(first),
        kind: first.kind,
        source: first.source,
        refId: first.refId,
        refStartMin: first.refStartMin,
        refEndMin: first.refEndMin,
        // admin-made double booking — rendered split and flagged
        second: second
          ? {
              userId: second.userId,
              name: nameOf(second),
              color: colorOf(second),
              pattern: patternOf(second),
              source: second.source,
              refId: second.refId,
            }
          : undefined,
      };
    }
    const freedOcc = rd.occupants.find((o) => o.freedMask & bit);
    if (freedOcc) {
      const u = userById.get(freedOcc.userId);
      return {
        type: "freed" as const,
        userId: freedOcc.userId,
        name: u?.name ?? "?",
        color: u?.color ?? "#888",
        pattern: u?.pattern ?? "solid",
        // deactivated user on long leave — background ghost of their fixed slot
        inactive: freedOcc.ghost,
      };
    }
    return { type: "free" as const };
  });
}

/**
 * Shared grid data for the schedule board — used by both the admin grid
 * (editable) and the staff board (read-only). Emits names+colors only,
 * never tier.
 */
export async function buildGridForDate(requestedDate?: string): Promise<{
  date: string;
  activeDays: number[];
  bounds: SlotBounds;
  rooms: GridRoom[];
  users: GridUser[];
  onLeave: OnLeaveEntry[];
  closure: { type: "closed" | "early"; label: string; endMin: number } | null;
  isToday: boolean;
}> {
  const activeDays = await getActiveDays();

  let date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : todayIL();
  for (let i = 0; i < 7 && !activeDays.includes(dowOf(date)); i++) date = addDays(date, 1);

  const dataset = await loadDayData(date);
  const cfg = dataset.cfg;
  const schedule = computeDaySchedule(dataset.dayData(date));
  const userById = new Map(dataset.users.map((u) => [u.id, u]));

  const rooms: GridRoom[] = schedule.rooms
    .filter((rd) => rd.openMask !== 0)
    .map((rd) => {
      const cells = cellsForRoomDay(cfg, rd, userById);
      return {
        id: rd.room.id,
        name: rd.room.name,
        hasWindow: rd.room.hasWindow,
        hasSink: rd.room.hasSink,
        isLarge: rd.room.isLarge,
        isGroupRoom: rd.room.isGroupRoom,
        isPool: rd.room.isPool,
        cells,
      };
    });

  const users: GridUser[] = dataset.users
    .filter((u) => u.isActive)
    .map((u) => ({ id: u.id, name: u.name, color: u.color, pattern: u.pattern }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  // header list shows ONLY staff who are absent the WHOLE day (full vacation or
  // long leave) — so it's clear why their rooms are empty. Partial changes
  // (leaving early, a mid-day hour out) just appear as gaps, not in this list.
  const perUser = new Map<string, { active: number; base: number; ghost: boolean }>();
  for (const rd of schedule.rooms) {
    for (const o of rd.occupants) {
      if (o.source !== "fixed" || !o.userId) continue;
      const agg = perUser.get(o.userId) ?? { active: 0, base: 0, ghost: false };
      agg.active |= o.mask;
      agg.base |= o.mask | o.freedMask;
      if (o.ghost) agg.ghost = true;
      perUser.set(o.userId, agg);
    }
  }
  const onLeave: OnLeaveEntry[] = [];
  for (const [userId, agg] of perUser) {
    // fully absent = has a normal schedule today (base>0) but none of it is active
    if (agg.base === 0 || agg.active !== 0) continue;
    const u = userById.get(userId);
    if (!u) continue;
    // until-when: the latest full-day absence row covering this date
    let until: string | null = null;
    for (const a of dataset.absences) {
      if (a.userId !== userId || a.startMin != null) continue;
      if (a.dateFrom <= date && a.dateTo >= date && (!until || a.dateTo > until)) until = a.dateTo;
    }
    const detail = agg.ghost
      ? "בחופשה ארוכה"
      : until && until > date
        ? `בחופש עד ${fmtDayMonth(until)}`
        : "בחופש / נעדר/ת היום";
    onLeave.push({ name: u.name, color: u.color, pattern: u.pattern, detail });
  }
  onLeave.sort((a, b) => a.name.localeCompare(b.name, "he"));

  return {
    date,
    activeDays,
    bounds: { dayStartMin: cfg.dayStartMin, dayEndMin: cfg.dayEndMin },
    rooms,
    users,
    onLeave,
    closure: schedule.closure ?? null,
    isToday: date === todayIL(),
  };
}

export type RoomWeekDay = {
  date: string;
  cells: GridCell[] | null; // null = room not open that day
  closure: { type: "closed" | "early"; label: string; endMin: number } | null;
};

/** One room across a whole week — for the per-room weekly view. */
export async function buildRoomWeek(
  roomId: string,
  fromDate?: string
): Promise<{
  room: { id: string; name: string };
  weekFrom: string;
  bounds: SlotBounds;
  days: RoomWeekDay[];
  today: string;
} | null> {
  const activeDays = await getActiveDays();
  const today = todayIL();
  let from = fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : today;
  // anchor to the week's first active day (Sunday-based clinic week)
  from = addDays(from, -dowOf(from));

  const dates = activeWeekDates(from, activeDays);
  const dataset = await loadEngineData(dates[0] ?? from, dates[dates.length - 1] ?? from);
  const cfg = dataset.cfg;
  const room = dataset.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const userById = new Map(dataset.users.map((u) => [u.id, u]));

  const days: RoomWeekDay[] = dates.map((date) => {
    const schedule = computeDaySchedule(dataset.dayData(date));
    const rd = schedule.rooms.find((r) => r.room.id === roomId);
    return {
      date,
      cells: rd && rd.openMask !== 0 ? cellsForRoomDay(cfg, rd, userById) : null,
      closure: schedule.closure ?? null,
    };
  });

  return {
    room: { id: room.id, name: room.name },
    weekFrom: from,
    bounds: { dayStartMin: cfg.dayStartMin, dayEndMin: cfg.dayEndMin },
    days,
    today,
  };
}
