/**
 * Room-consistency scoring — the top scheduling heuristic:
 * keep every therapist in the same room as much as possible.
 *
 * Tier is a SUBTLE server-side tiebreaker only (admin > staff > intern > student),
 * an order of magnitude below consistency. It never overrides first-come-first-served,
 * and is never mentioned in user-facing reasons.
 */

import type { DaySchedule, EngineRoom, EngineUser, RoomFilters, ScoredRoom } from "./types";
import { covers } from "./slots";

export const SCORE = {
  FIXED_ROOM_SAME_DAY: 1000,
  FIXED_ROOM_OTHER_DAY: 500,
  CONTIGUITY: 200, // already in this room earlier/later the same day
  PREFERENCE_MATCH: 100, // requested window / large room and this room has it
  PERMANENT_ROOM: 50, // prefer keeping pool rooms as spare capacity
  USAGE_PER_TIME: 5, // per past use of this room (capped)
  USAGE_CAP: 30,
  TIER: { admin: 30, staff: 20, intern: 10, student: 0 } as Record<string, number>,
} as const;

export type ScoringContext = {
  user: EngineUser;
  /** room ids that are the user's fixed rooms on the requested day-of-week */
  fixedRoomsSameDay: Set<string>;
  /** room ids that are the user's fixed rooms on any other day */
  fixedRoomsOtherDays: Set<string>;
  /** recent usage count per room id (assignments occurrences + bookings, last ~60 days) */
  usageCount: Map<string, number>;
};

export function tierBonus(user: EngineUser): number {
  if (user.role === "admin") return SCORE.TIER.admin;
  return SCORE.TIER[user.tier] ?? 0;
}

export function scoreRoom(
  room: EngineRoom,
  ctx: ScoringContext,
  opts: {
    schedule?: DaySchedule; // for contiguity
    preferences?: RoomFilters; // soft preferences (window / large)
  } = {}
): ScoredRoom {
  let score = 0;
  const reasons: string[] = [];

  if (ctx.fixedRoomsSameDay.has(room.id)) {
    score += SCORE.FIXED_ROOM_SAME_DAY;
    reasons.push("החדר הקבוע שלך ביום הזה");
  } else if (ctx.fixedRoomsOtherDays.has(room.id)) {
    score += SCORE.FIXED_ROOM_OTHER_DAY;
    reasons.push("החדר הקבוע שלך בימים אחרים");
  }

  if (opts.schedule) {
    const rd = opts.schedule.rooms.find((r) => r.room.id === room.id);
    if (rd && rd.occupants.some((o) => o.userId === ctx.user.id && o.mask !== 0)) {
      score += SCORE.CONTIGUITY;
      reasons.push("את/ה כבר בחדר הזה באותו יום");
    }
  }

  const prefs = opts.preferences;
  if (prefs?.hasWindow && room.hasWindow) {
    score += SCORE.PREFERENCE_MATCH;
    reasons.push("חדר עם חלון");
  }
  if (prefs?.hasSink && room.hasSink) {
    score += SCORE.PREFERENCE_MATCH;
    reasons.push("חדר עם כיור");
  }
  if (prefs?.isLarge && room.isLarge) {
    score += SCORE.PREFERENCE_MATCH;
    reasons.push("חדר גדול, מתאים לזוגי/משפחתי");
  }

  if (!room.isPool) {
    score += SCORE.PERMANENT_ROOM;
  }

  const usage = Math.min((ctx.usageCount.get(room.id) ?? 0) * SCORE.USAGE_PER_TIME, SCORE.USAGE_CAP);
  if (usage > 0) {
    score += usage;
    reasons.push("חדר שעבדת בו לאחרונה");
  }

  // subtle hierarchy tiebreaker — server-side only, never in reasons
  score += tierBonus(ctx.user);

  return { room, score, reasons };
}

/**
 * Free rooms for a window, best first.
 * `filters` are HARD requirements (e.g. group room), `preferences` are soft.
 */
export function rankFreeRooms(
  schedule: DaySchedule,
  wantedMask: number,
  ctx: ScoringContext,
  opts: { filters?: RoomFilters; preferences?: RoomFilters } = {}
): ScoredRoom[] {
  const out: ScoredRoom[] = [];
  for (const rd of schedule.rooms) {
    if (!covers(rd.freeMask, wantedMask)) continue;
    const { filters } = opts;
    if (filters?.hasWindow && !rd.room.hasWindow) continue;
    if (filters?.isLarge && !rd.room.isLarge) continue;
    if (filters?.isGroupRoom && !rd.room.isGroupRoom) continue;
    out.push(scoreRoom(rd.room, ctx, { schedule, preferences: opts.preferences }));
  }
  out.sort((a, b) => b.score - a.score || a.room.sortOrder - b.room.sortOrder);
  return out;
}
