/**
 * Higher-level search on top of the engine: alternative times, swap candidates,
 * patchwork ("stitched") days and multi-day placement plans.
 * All pure — callers provide computed DaySchedules.
 */

import { computeDaySchedule } from "./engine";
import { rankFreeRooms, scoreRoom, type ScoringContext } from "./scoring";
import {
  covers,
  countSlots,
  maskFor,
  maskToRanges,
  slotToMin,
  slotIndex,
  SLOT_MIN,
  addDays,
  dowOf,
} from "./slots";
import type { DayData, DaySchedule, RoomFilters, ScoredRoom } from "./types";

// ---------- alternative times ----------

export type Alternative = {
  date: string;
  startMin: number;
  endMin: number;
  room: ScoredRoom;
  distance: number; // minutes shifted + day-change penalty, for ranking
};

/**
 * No room free for the requested window? Slide it ±30/±60…±180 min on the same
 * day, then try adjacent days, collecting up to `limit` options.
 */
export function suggestAlternatives(
  getDayData: (date: string) => DayData | null,
  date: string,
  startMin: number,
  endMin: number,
  ctx: ScoringContext,
  opts: { filters?: RoomFilters; preferences?: RoomFilters; limit?: number; activeDays?: number[] } = {}
): Alternative[] {
  const limit = opts.limit ?? 5;
  const durMin = endMin - startMin;
  const out: Alternative[] = [];
  const seen = new Set<string>();

  const tryWindow = (d: string, s: number, dayPenalty: number) => {
    const e = s + durMin;
    const key = `${d}|${s}`;
    if (seen.has(key)) return;
    seen.add(key);
    const data = getDayData(d);
    if (!data) return;
    if (s < data.cfg.dayStartMin || e > data.cfg.dayEndMin) return;
    const schedule = computeDaySchedule(data);
    const ranked = rankFreeRooms(schedule, maskFor(data.cfg, s, e), ctx, opts);
    if (ranked.length > 0) {
      out.push({
        date: d,
        startMin: s,
        endMin: e,
        room: ranked[0],
        distance: Math.abs(s - startMin) + dayPenalty,
      });
    }
  };

  // same day, sliding window
  for (let shift = SLOT_MIN; shift <= 180; shift += SLOT_MIN) {
    tryWindow(date, startMin + shift, 0);
    tryWindow(date, startMin - shift, 0);
    if (out.length >= limit) break;
  }

  // adjacent days (skip inactive days / Saturday)
  if (out.length < limit) {
    const activeDays = opts.activeDays ?? [0, 1, 2, 3, 4];
    for (const dayShift of [1, -1, 2, -2]) {
      const d = addDays(date, dayShift);
      if (!activeDays.includes(dowOf(d))) continue;
      tryWindow(d, startMin, 1000 * Math.abs(dayShift));
      for (let shift = SLOT_MIN; shift <= 120 && out.length < limit + 3; shift += SLOT_MIN) {
        tryWindow(d, startMin + shift, 1000 * Math.abs(dayShift));
        tryWindow(d, startMin - shift, 1000 * Math.abs(dayShift));
      }
      if (out.length >= limit) break;
    }
  }

  out.sort((a, b) => a.distance - b.distance || b.room.score - a.room.score);
  return out.slice(0, limit);
}

// ---------- swap candidates ----------

export type SwapCandidate = {
  targetUserId: string;
  roomId: string; // the room the requester wants
  roomName: string;
  /** where the displaced target can go for the overlapping segment (null = requester must offer their own room) */
  altRoomId: string | null;
  altRoomName: string | null;
  overlapStartMin: number;
  overlapEndMin: number;
  disruptionScore: number; // lower = less disruption to the target
};

/**
 * For each occupant blocking the wanted window: can they be relocated?
 * Ranked by least disruption to the target (their relocation room score, desc).
 * Never proposes displacing a group (kind='group').
 */
export function suggestSwaps(
  schedule: DaySchedule,
  wantedMask: number,
  requesterUserId: string,
  makeTargetCtx: (targetUserId: string) => ScoringContext,
  opts: { filters?: RoomFilters; onlyRoomId?: string; offeredRoomId?: string | null } = {}
): SwapCandidate[] {
  const out: SwapCandidate[] = [];

  for (const rd of schedule.rooms) {
    if (opts.onlyRoomId && rd.room.id !== opts.onlyRoomId) continue;
    if (!covers(rd.openMask, wantedMask)) continue;
    if (opts.filters?.hasWindow && !rd.room.hasWindow) continue;
    if (opts.filters?.isLarge && !rd.room.isLarge) continue;
    if (opts.filters?.isGroupRoom && !rd.room.isGroupRoom) continue;

    const blockers = rd.occupants.filter((o) => (o.mask & wantedMask) !== 0 && o.userId !== requesterUserId);
    if (blockers.length !== 1) continue; // only simple single-occupant swaps
    const blocker = blockers[0];
    if (blocker.kind === "group") continue; // groups are never displaced
    if (blocker.source === "label" || !blocker.userId) continue; // free-text labels can't be relocated
    // the wanted window must be free apart from this blocker
    const othersMask = rd.occupants
      .filter((o) => o !== blocker)
      .reduce((m, o) => m | o.mask, 0);
    if ((othersMask & wantedMask) !== 0) continue;

    const overlap = blocker.mask & wantedMask;
    const ranges = maskToRanges(schedule.cfg, overlap);
    if (ranges.length === 0) continue;
    const seg = { startMin: ranges[0].startMin, endMin: ranges[ranges.length - 1].endMin };
    const segMask = maskFor(schedule.cfg, seg.startMin, seg.endMin);

    // where can the target go instead?
    const targetCtx = makeTargetCtx(blocker.userId);
    const relocations = rankFreeRooms(schedule, segMask, targetCtx).filter(
      (r) => r.room.id !== rd.room.id
    );

    // explicitly offered room (e.g. requester's own room in the group flow)
    const offered = opts.offeredRoomId
      ? schedule.rooms.find((r) => r.room.id === opts.offeredRoomId)
      : undefined;
    const offeredFree = offered ? covers(offered.freeMask | wantedMask, segMask) : false;

    const best = relocations[0];
    const altRoom = best?.room ?? (offeredFree ? offered!.room : null);

    out.push({
      targetUserId: blocker.userId,
      roomId: rd.room.id,
      roomName: rd.room.name,
      altRoomId: altRoom?.id ?? null,
      altRoomName: altRoom?.name ?? null,
      overlapStartMin: seg.startMin,
      overlapEndMin: seg.endMin,
      disruptionScore: best ? -best.score : offeredFree ? 0 : 10_000,
    });
  }

  out.sort((a, b) => a.disruptionScore - b.disruptionScore);
  return out;
}

// ---------- patchwork day (last resort) ----------

export type StitchSegment = { roomId: string; roomName: string; startMin: number; endMin: number };
export type StitchResult = {
  segments: StitchSegment[];
  gaps: { startMin: number; endMin: number }[];
  coveredSlots: number;
  wantedSlots: number;
  roomSwitches: number;
};

/**
 * Greedy patchwork: cover the wanted window from free fragments across rooms.
 * At each uncovered slot pick the room that stays free the longest from there
 * (ties → higher consistency score). Always ranked AFTER any contiguous option.
 */
export function stitchPlacement(
  schedule: DaySchedule,
  wantedMask: number,
  ctx: ScoringContext,
  opts: { filters?: RoomFilters } = {}
): StitchResult {
  const candidates = schedule.rooms.filter((rd) => {
    if (opts.filters?.hasWindow && !rd.room.hasWindow) return false;
    if (opts.filters?.isLarge && !rd.room.isLarge) return false;
    if (opts.filters?.isGroupRoom && !rd.room.isGroupRoom) return false;
    return true;
  });
  const scores = new Map(
    candidates.map((rd) => [rd.room.id, scoreRoom(rd.room, ctx, { schedule }).score])
  );

  const cfg = schedule.cfg;
  const segments: StitchSegment[] = [];
  const gaps: { startMin: number; endMin: number }[] = [];
  let currentRoomId: string | null = null;

  let i = 0;
  while (i < cfg.nSlots) {
    const bit = 1 << i;
    if ((wantedMask & bit) === 0) {
      i++;
      currentRoomId = null;
      continue;
    }

    // extend current segment if possible
    if (currentRoomId) {
      const rd = candidates.find((r) => r.room.id === currentRoomId)!;
      if (rd.freeMask & bit) {
        const last = segments[segments.length - 1];
        last.endMin = slotToMin(cfg, i + 1);
        i++;
        continue;
      }
      currentRoomId = null;
    }

    // pick the room free the longest from slot i (within wanted), tiebreak by score
    let best: { rd: (typeof candidates)[number]; run: number } | null = null;
    for (const rd of candidates) {
      if ((rd.freeMask & bit) === 0) continue;
      let run = 0;
      for (let j = i; j < cfg.nSlots; j++) {
        const b = 1 << j;
        if ((wantedMask & b) === 0) break;
        if ((rd.freeMask & b) === 0) break;
        run++;
      }
      if (
        !best ||
        run > best.run ||
        (run === best.run && (scores.get(rd.room.id) ?? 0) > (scores.get(best.rd.room.id) ?? 0))
      ) {
        best = { rd, run };
      }
    }

    if (!best) {
      // gap — no room free at this slot
      const gapStart = i;
      while (i < cfg.nSlots && (wantedMask & (1 << i)) !== 0) {
        let anyFree = false;
        for (const rd of candidates) if (rd.freeMask & (1 << i)) anyFree = true;
        if (anyFree) break;
        i++;
      }
      gaps.push({ startMin: slotToMin(cfg, gapStart), endMin: slotToMin(cfg, i) });
      continue;
    }

    currentRoomId = best.rd.room.id;
    segments.push({
      roomId: best.rd.room.id,
      roomName: best.rd.room.name,
      startMin: slotToMin(cfg, i),
      endMin: slotToMin(cfg, i + 1),
    });
    i++;
  }

  const coveredMask = segments.reduce((m, s) => m | maskFor(cfg, s.startMin, s.endMin), 0);
  return {
    segments,
    gaps,
    coveredSlots: countSlots(coveredMask & wantedMask),
    wantedSlots: countSlots(wantedMask),
    roomSwitches: Math.max(0, segments.length - 1),
  };
}

// ---------- multi-day placement plans (admin: "place a new employee / student") ----------

export type PlacementDayInput = {
  /** representative concrete date for the day-of-week (used for schedule computation) */
  date: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
};

export type PlacementDayResult = {
  dayOfWeek: number;
  date: string;
  startMin: number;
  endMin: number;
  segments: StitchSegment[];
  gaps: { startMin: number; endMin: number }[];
  contiguous: boolean;
};

export type PlacementPlan = {
  label: "חדר קבוע אחיד" | "החדר הטוב ביותר לכל יום" | "יום טלאים (בלית ברירה)";
  quality: 1 | 2 | 3; // 1 best
  days: PlacementDayResult[];
  totalGapSlots: number;
  totalSwitches: number;
};

/**
 * Up to 3 ranked plans:
 *  1. one consistent room across all requested days (if such a room exists)
 *  2. best contiguous room per day (rooms may differ between days)
 *  3. patchwork where contiguous coverage is impossible — last resort
 */
export function buildPlacementPlan(
  getDayData: (date: string) => DayData | null,
  days: PlacementDayInput[],
  ctx: ScoringContext,
  opts: { filters?: RoomFilters; preferences?: RoomFilters } = {}
): PlacementPlan[] {
  const plans: PlacementPlan[] = [];
  const schedules = days.map((d) => {
    const data = getDayData(d.date);
    return { input: d, schedule: data ? computeDaySchedule(data) : null };
  });

  // plan 1: same room everywhere.
  // A placement is PERMANENT, so a room that is free on the representative date
  // only because of a one-time absence must NOT count — verify it is free on
  // the next several occurrences of that weekday before offering it.
  const perDayRanked = schedules.map(({ input, schedule }) =>
    schedule
      ? rankFreeRooms(schedule, maskFor(schedule.cfg, input.startMin, input.endMin), ctx, opts).filter(
          (r) =>
            checkRecurring(
              getDayData,
              r.room.id,
              input.date,
              input.dayOfWeek,
              input.startMin,
              input.endMin
            ).ok
        )
      : []
  );
  if (perDayRanked.every((r) => r.length > 0)) {
    const commonIds = perDayRanked
      .map((r) => new Set(r.map((x) => x.room.id)))
      .reduce((acc, s) => new Set([...acc].filter((id) => s.has(id))));
    if (commonIds.size > 0) {
      // pick the common room with the best summed score
      let bestId: string | null = null;
      let bestScore = -Infinity;
      for (const id of commonIds) {
        const sum = perDayRanked.reduce(
          (acc, r) => acc + (r.find((x) => x.room.id === id)?.score ?? 0),
          0
        );
        if (sum > bestScore) {
          bestScore = sum;
          bestId = id;
        }
      }
      const room = perDayRanked[0].find((x) => x.room.id === bestId)!.room;
      plans.push({
        label: "חדר קבוע אחיד",
        quality: 1,
        days: schedules.map(({ input }) => ({
          dayOfWeek: input.dayOfWeek,
          date: input.date,
          startMin: input.startMin,
          endMin: input.endMin,
          segments: [
            { roomId: room.id, roomName: room.name, startMin: input.startMin, endMin: input.endMin },
          ],
          gaps: [],
          contiguous: true,
        })),
        totalGapSlots: 0,
        totalSwitches: 0,
      });
    }
  }

  // plan 2: best contiguous per day (if at least one day differs from plan 1 or plan 1 failed)
  if (perDayRanked.every((r) => r.length > 0)) {
    const daysOut = schedules.map(({ input }, idx) => {
      const best = perDayRanked[idx][0];
      return {
        dayOfWeek: input.dayOfWeek,
        date: input.date,
        startMin: input.startMin,
        endMin: input.endMin,
        segments: [
          {
            roomId: best.room.id,
            roomName: best.room.name,
            startMin: input.startMin,
            endMin: input.endMin,
          },
        ],
        gaps: [],
        contiguous: true,
      };
    });
    const distinctFromPlan1 =
      plans.length === 0 ||
      daysOut.some((d, i) => d.segments[0].roomId !== plans[0].days[i].segments[0].roomId);
    if (distinctFromPlan1) {
      plans.push({
        label: "החדר הטוב ביותר לכל יום",
        quality: 2,
        days: daysOut,
        totalGapSlots: 0,
        totalSwitches: 0,
      });
    }
  }

  // plan 3: patchwork for days lacking a contiguous room
  if (perDayRanked.some((r) => r.length === 0)) {
    const daysOut: PlacementDayResult[] = [];
    let gapsTotal = 0;
    let switchesTotal = 0;
    for (let idx = 0; idx < schedules.length; idx++) {
      const { input, schedule } = schedules[idx];
      if (!schedule) continue;
      const wanted = maskFor(schedule.cfg, input.startMin, input.endMin);
      if (perDayRanked[idx].length > 0) {
        const best = perDayRanked[idx][0];
        daysOut.push({
          dayOfWeek: input.dayOfWeek,
          date: input.date,
          startMin: input.startMin,
          endMin: input.endMin,
          segments: [
            { roomId: best.room.id, roomName: best.room.name, startMin: input.startMin, endMin: input.endMin },
          ],
          gaps: [],
          contiguous: true,
        });
      } else {
        const stitched = stitchPlacement(schedule, wanted, ctx, opts);
        gapsTotal += stitched.wantedSlots - stitched.coveredSlots;
        switchesTotal += stitched.roomSwitches;
        daysOut.push({
          dayOfWeek: input.dayOfWeek,
          date: input.date,
          startMin: input.startMin,
          endMin: input.endMin,
          segments: stitched.segments,
          gaps: stitched.gaps,
          contiguous: false,
        });
      }
    }
    plans.push({
      label: "יום טלאים (בלית ברירה)",
      quality: 3,
      days: daysOut,
      totalGapSlots: gapsTotal,
      totalSwitches: switchesTotal,
    });
  }

  return plans;
}

// ---------- recurring feasibility ----------

export type RecurringCheck = {
  ok: boolean;
  conflicts: { date: string; occupiedBy: string | null }[];
};

/** Verify a recurring slot in a specific room over the next N concrete occurrences. */
export function checkRecurring(
  getDayData: (date: string) => DayData | null,
  roomId: string,
  fromDate: string,
  dayOfWeek: number,
  startMin: number,
  endMin: number,
  occurrences = 8
): RecurringCheck {
  const conflicts: { date: string; occupiedBy: string | null }[] = [];
  // first occurrence of dayOfWeek on/after fromDate
  let d = fromDate;
  while (dowOf(d) !== dayOfWeek) d = addDays(d, 1);
  for (let i = 0; i < occurrences; i++, d = addDays(d, 7)) {
    const data = getDayData(d);
    if (!data) continue;
    const wanted = maskFor(data.cfg, startMin, endMin);
    const schedule = computeDaySchedule(data);
    const rd = schedule.rooms.find((r) => r.room.id === roomId);
    if (!rd) continue;
    // a day where the room isn't open at all (holiday closure / not this weekday)
    // is NOT a conflict — the recurring slot just doesn't apply that day.
    if (!covers(rd.openMask, wanted)) continue;
    if (!covers(rd.freeMask, wanted)) {
      const blocker = rd.occupants.find((o) => (o.mask & wanted) !== 0);
      conflicts.push({ date: d, occupiedBy: blocker?.userId ?? null });
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}

// re-export for callers' convenience
export { slotIndex };
