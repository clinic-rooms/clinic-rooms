/** Pure data shapes the engine works on — decoupled from Drizzle so tests need no DB. */

import type { SlotConfig } from "./slots";

export type EngineRoom = {
  id: string;
  name: string;
  isPool: boolean;
  isGroupRoom: boolean;
  hasWindow: boolean;
  hasSink: boolean;
  isLarge: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type EngineUser = {
  id: string;
  name: string;
  color: string;
  pattern: string;
  role: string;
  tier: "staff" | "intern" | "student";
  isActive: boolean;
};

export type EngineAvailability = {
  roomId: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type EngineAssignment = {
  id: string;
  userId: string;
  roomId: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  kind: "regular" | "group";
};

export type EngineReduction = {
  id: string;
  userId: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  effectiveFrom: string;
};

export type EngineAbsence = {
  id: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
  startMin: number | null;
  endMin: number | null;
};

export type EngineBooking = {
  id: string;
  userId: string;
  roomId: string;
  date: string;
  startMin: number;
  endMin: number;
  status: string;
  kind: "regular" | "group";
};

export type EngineLabel = {
  id: string;
  roomId: string;
  text: string;
  date: string | null;
  dayOfWeek: number | null;
  startMin: number;
  endMin: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  color: string;
};

export type EngineClosure = { type: "closed" | "early"; endMin: number; label: string };

export type DayData = {
  date: string; // yyyy-mm-dd
  cfg: SlotConfig;
  rooms: EngineRoom[];
  users: EngineUser[];
  availability: EngineAvailability[];
  assignments: EngineAssignment[];
  reductions: EngineReduction[];
  absences: EngineAbsence[];
  bookings: EngineBooking[];
  labels?: EngineLabel[];
  closure?: EngineClosure | null;
};

export type Occupant = {
  userId: string; // "" for free-text labels
  mask: number; // effective occupied slots
  freedMask: number; // slots the fixed occupant released (reduction/absence)
  kind: "regular" | "group";
  source: "fixed" | "booking" | "label";
  refId: string; // assignment / booking / label id
  /** user is deactivated (long leave) — slots shown as background ghost, room bookable */
  ghost: boolean;
  /** free-text label content (temp person, group name) when source==="label" */
  label?: string;
  color?: string;
  /** the source row's own hours (assignment/booking), for admin editing */
  refStartMin?: number;
  refEndMin?: number;
};

export type RoomDay = {
  room: EngineRoom;
  openMask: number;
  occupants: Occupant[];
  occupiedMask: number;
  freeMask: number;
};

export type DaySchedule = {
  date: string;
  cfg: SlotConfig;
  dow: number;
  rooms: RoomDay[];
  closure?: EngineClosure | null;
};

export type RoomFilters = {
  hasWindow?: boolean;
  hasSink?: boolean;
  isLarge?: boolean;
  isGroupRoom?: boolean;
};

export type ScoredRoom = {
  room: EngineRoom;
  score: number;
  reasons: string[]; // neutral Hebrew phrasing — never mentions tier
};
