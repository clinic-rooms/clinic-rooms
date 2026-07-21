import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import type {
  DayData,
  EngineAbsence,
  EngineAssignment,
  EngineAvailability,
  EngineBooking,
  EngineLabel,
  EngineReduction,
  EngineRoom,
  EngineUser,
} from "./types";
import type { ScoringContext } from "./scoring";
import type { EngineClosure } from "./types";
import { addDays, dowOf, type SlotConfig } from "./slots";
import { getClinicSettings, getScheduleConfig } from "./config";
import { autoClosureForDate } from "@/lib/holidays";

/**
 * One batched load that can answer any set of dates. The clinic is small
 * (~20 users, ~12 rooms), so we load whole tables for the static parts and
 * date-bounded rows for the one-time layers — 6 queries total.
 */
export type EngineDataset = {
  cfg: SlotConfig;
  rooms: EngineRoom[];
  users: EngineUser[];
  availability: EngineAvailability[];
  assignments: EngineAssignment[];
  reductions: EngineReduction[];
  absences: EngineAbsence[];
  bookings: EngineBooking[];
  labels: EngineLabel[];
  resolveClosure: (date: string) => EngineClosure | null;
  dayData: (date: string) => DayData;
};

export async function loadEngineData(fromDate: string, toDate: string): Promise<EngineDataset> {
  const [cfg, rooms, users, availability, assignments, reductions, absences, bookings, labels, closures] =
    await Promise.all([
      getScheduleConfig(),
      db.select().from(t.rooms).where(eq(t.rooms.isActive, true)),
      // all users, including deactivated — the engine renders their fixed slots as ghosts
      db.select().from(t.user),
      db.select().from(t.roomAvailability),
      db.select().from(t.fixedAssignments),
      db.select().from(t.recurringReductions),
      db
        .select()
        .from(t.oneTimeAbsences)
        .where(and(lte(t.oneTimeAbsences.dateFrom, toDate), gte(t.oneTimeAbsences.dateTo, fromDate))),
      db
        .select()
        .from(t.oneTimeBookings)
        .where(
          and(
            gte(t.oneTimeBookings.date, fromDate),
            lte(t.oneTimeBookings.date, toDate),
            eq(t.oneTimeBookings.status, "active")
          )
        ),
      db.select().from(t.manualLabels),
      db
        .select()
        .from(t.clinicClosures)
        .where(and(gte(t.clinicClosures.date, fromDate), lte(t.clinicClosures.date, toDate))),
    ]);

  const engineRooms: EngineRoom[] = rooms;
  const engineUsers: EngineUser[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    color: u.color,
    pattern: u.pattern,
    role: u.role,
    tier: u.tier as EngineUser["tier"],
    isActive: u.isActive,
  }));
  const engineAssignments: EngineAssignment[] = assignments.map((a) => ({
    ...a,
    kind: a.kind as "regular" | "group",
  }));
  const engineBookings: EngineBooking[] = bookings.map((b) => ({
    ...b,
    kind: b.kind as "regular" | "group",
  }));
  const engineLabels: EngineLabel[] = labels;

  // override map: admin decisions win over the auto-detected Hebrew-calendar holiday
  const overrideByDate = new Map(closures.map((c) => [c.date, c]));
  const resolveClosure = (date: string): EngineClosure | null => {
    const override = overrideByDate.get(date);
    if (override) {
      if (override.type === "open") return null; // admin says work as usual
      return { type: override.type as "closed" | "early", endMin: override.endMin, label: override.label ?? "סגירה" };
    }
    return autoClosureForDate(date, cfg.dayEndMin);
  };

  const dataset: EngineDataset = {
    cfg,
    rooms: engineRooms,
    users: engineUsers,
    availability,
    assignments: engineAssignments,
    reductions,
    absences,
    bookings: engineBookings,
    labels: engineLabels,
    resolveClosure,
    dayData: (date: string): DayData => ({
      date,
      cfg,
      rooms: engineRooms,
      users: engineUsers,
      availability,
      assignments: engineAssignments,
      reductions,
      absences,
      bookings: engineBookings,
      labels: engineLabels,
      closure: resolveClosure(date),
    }),
  };
  return dataset;
}

export async function loadDayData(date: string): Promise<EngineDataset> {
  return loadEngineData(date, date);
}

/** Scoring context for a user and a target day-of-week, as of `refDate`. */
export function buildScoringContext(
  dataset: EngineDataset,
  userId: string,
  dayOfWeek: number,
  refDate: string
): ScoringContext {
  const user = dataset.users.find((u) => u.id === userId);
  const fixedRoomsSameDay = new Set<string>();
  const fixedRoomsOtherDays = new Set<string>();
  const usageCount = new Map<string, number>();

  for (const a of dataset.assignments) {
    if (a.userId !== userId) continue;
    if (a.effectiveTo && refDate > a.effectiveTo) continue;
    if (a.dayOfWeek === dayOfWeek) fixedRoomsSameDay.add(a.roomId);
    else fixedRoomsOtherDays.add(a.roomId);
    usageCount.set(a.roomId, (usageCount.get(a.roomId) ?? 0) + 2);
  }
  for (const b of dataset.bookings) {
    if (b.userId !== userId) continue;
    usageCount.set(b.roomId, (usageCount.get(b.roomId) ?? 0) + 1);
  }

  return {
    user: user ?? {
      id: userId,
      name: "",
      color: "#888",
      pattern: "solid",
      role: "user",
      tier: "staff",
      isActive: true,
    },
    fixedRoomsSameDay,
    fixedRoomsOtherDays,
    usageCount,
  };
}

export async function getActiveDays(): Promise<number[]> {
  return (await getClinicSettings()).activeDays;
}

/** Active dates within the 7-day window starting at `fromDate` (inclusive). */
export function activeWeekDates(fromDate: string, activeDays: number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(fromDate, i);
    if (activeDays.includes(dowOf(d))) out.push(d);
  }
  return out;
}
