/**
 * The deterministic core: effective schedule for a date.
 *
 *   occupied(room, D) = fixed_assignments(dow, effective)
 *                       − recurring_reductions(user, dow, effective)
 *                       − one_time_absences(user, D)
 *                       + one_time_bookings(D, active)
 *   free(room, D)     = room_availability(dow, effective) − occupied(room, D)
 *
 * All functions here are pure — DB loading lives in data.ts.
 */

import { maskFor, dowOf, type SlotConfig } from "./slots";
import type {
  DayData,
  DaySchedule,
  EngineAbsence,
  EngineAssignment,
  EngineAvailability,
  EngineReduction,
  Occupant,
  RoomDay,
} from "./types";

function activeOn(date: string, from: string | null, to: string | null): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function availabilityMask(cfg: SlotConfig, rows: EngineAvailability[], roomId: string, date: string): number {
  const dow = dowOf(date);
  let mask = 0;
  for (const r of rows) {
    if (r.roomId !== roomId || r.dayOfWeek !== dow) continue;
    if (!activeOn(date, r.effectiveFrom, r.effectiveTo)) continue;
    mask |= maskFor(cfg, r.startMin, r.endMin);
  }
  return mask;
}

export function assignmentActiveOn(a: EngineAssignment, date: string): boolean {
  return a.dayOfWeek === dowOf(date) && activeOn(date, a.effectiveFrom, a.effectiveTo);
}

export function reductionMask(cfg: SlotConfig, rows: EngineReduction[], userId: string, date: string): number {
  const dow = dowOf(date);
  let mask = 0;
  for (const r of rows) {
    if (r.userId !== userId || r.dayOfWeek !== dow) continue;
    if (date < r.effectiveFrom) continue;
    mask |= maskFor(cfg, r.startMin, r.endMin);
  }
  return mask;
}

export function absenceMask(cfg: SlotConfig, rows: EngineAbsence[], userId: string, date: string): number {
  let mask = 0;
  for (const r of rows) {
    if (r.userId !== userId) continue;
    if (date < r.dateFrom || date > r.dateTo) continue;
    if (r.startMin == null || r.endMin == null) {
      mask |= cfg.fullMask; // whole day
    } else {
      mask |= maskFor(cfg, r.startMin, r.endMin);
    }
  }
  return mask;
}

/** Full grid for one date. One code path for every screen and every AI tool. */
export function computeDaySchedule(data: DayData): DaySchedule {
  const { date, cfg } = data;
  const dow = dowOf(date);
  const rooms: RoomDay[] = [];
  const userById = new Map(data.users.map((u) => [u.id, u]));
  // clinic-wide closure: holiday closes the whole day, erev caps it at endMin
  const clinicMask = !data.closure
    ? cfg.fullMask
    : data.closure.type === "closed"
      ? 0
      : maskFor(cfg, cfg.dayStartMin, data.closure.endMin);
  // deactivated user (long leave): their fixed slots become background "ghosts" —
  // visible on the board but not occupying, so the room stays bookable
  const isGhost = (userId: string) => userById.get(userId)?.isActive === false;

  for (const room of data.rooms) {
    if (!room.isActive) continue;
    const openMask = availabilityMask(cfg, data.availability, room.id, date) & clinicMask;
    const occupants: Occupant[] = [];

    for (const a of data.assignments) {
      if (a.roomId !== room.id || !assignmentActiveOn(a, date)) continue;
      const base = maskFor(cfg, a.startMin, a.endMin) & openMask;
      // recurring reductions are a PERMANENT change → the slot becomes plain free.
      // one-time absences are TEMPORARY → shown hatched (freedMask).
      const recurring = reductionMask(cfg, data.reductions, a.userId, date);
      const oneTime = absenceMask(cfg, data.absences, a.userId, date);
      const ghost = isGhost(a.userId);
      const mask = ghost ? 0 : base & ~(recurring | oneTime);
      // ghost (long leave) shows the whole base as a background; otherwise only
      // one-time absences are marked freed (hatched). recurring-reduced slots
      // simply fall through to freeMask and render as plain free.
      const freedMask = ghost ? base : base & oneTime;
      if (mask || freedMask) {
        occupants.push({
          userId: a.userId, mask, freedMask, kind: a.kind, source: "fixed", refId: a.id, ghost,
          refStartMin: a.startMin, refEndMin: a.endMin,
        });
      }
    }

    for (const b of data.bookings) {
      if (b.roomId !== room.id || b.date !== date || b.status !== "active") continue;
      if (isGhost(b.userId)) continue; // bookings of deactivated users just release the slot
      const mask = maskFor(cfg, b.startMin, b.endMin) & openMask;
      if (mask) {
        occupants.push({
          userId: b.userId, mask, freedMask: 0, kind: b.kind, source: "booking", refId: b.id, ghost: false,
          refStartMin: b.startMin, refEndMin: b.endMin,
        });
      }
    }

    for (const l of data.labels ?? []) {
      if (l.roomId !== room.id) continue;
      const applies = l.date
        ? l.date === date
        : l.dayOfWeek === dow && activeOn(date, l.effectiveFrom, l.effectiveTo);
      if (!applies) continue;
      const mask = maskFor(cfg, l.startMin, l.endMin) & openMask;
      if (mask) {
        occupants.push({
          userId: "",
          mask,
          freedMask: 0,
          kind: "regular",
          source: "label",
          refId: l.id,
          ghost: false,
          label: l.text,
          color: l.color,
        });
      }
    }

    let occupiedMask = 0;
    for (const o of occupants) occupiedMask |= o.mask;
    rooms.push({ room, openMask, occupants, occupiedMask, freeMask: openMask & ~occupiedMask });
  }

  rooms.sort((a, b) => a.room.sortOrder - b.room.sortOrder);
  return { date, cfg, dow, rooms, closure: data.closure ?? null };
}

/** The mask a given user actually occupies on a date (for "my schedule" and swap checks). */
export function userDayOccupancy(
  schedule: DaySchedule,
  userId: string
): { roomDay: RoomDay; occupant: Occupant }[] {
  const out: { roomDay: RoomDay; occupant: Occupant }[] = [];
  for (const rd of schedule.rooms) {
    for (const o of rd.occupants) {
      if (o.userId === userId) out.push({ roomDay: rd, occupant: o });
    }
  }
  return out;
}
