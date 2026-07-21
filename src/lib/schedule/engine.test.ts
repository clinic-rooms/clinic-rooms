import { describe, it, expect } from "vitest";
import {
  makeSlotConfig,
  validateDayBounds,
  maskFor,
  maskToRanges,
  covers,
  fmtRange,
  dowOf,
  countSlots,
} from "./slots";
import { computeDaySchedule } from "./engine";
import { rankFreeRooms, scoreRoom, type ScoringContext } from "./scoring";
import {
  suggestAlternatives,
  suggestSwaps,
  stitchPlacement,
  buildPlacementPlan,
  checkRecurring,
} from "./suggestions";
import type { DayData, EngineRoom, EngineUser } from "./types";

// default clinic geometry — 07:00–19:00, matching the schema defaults
const CFG = makeSlotConfig(420, 1140);

// ---------- fixtures ----------

let seq = 0;
const uid = () => `id_${++seq}`;

function room(partial: Partial<EngineRoom> & { name: string }): EngineRoom {
  return {
    id: uid(),
    isPool: false,
    isGroupRoom: false,
    hasWindow: false,
    hasSink: false,
    isLarge: false,
    sortOrder: seq,
    isActive: true,
    ...partial,
  };
}

function user(partial: Partial<EngineUser> & { name: string }): EngineUser {
  return { id: uid(), color: "#000", pattern: "solid", role: "user", tier: "staff", isActive: true, ...partial };
}

// 2026-07-19 is a Sunday
const SUN = "2026-07-19";
const MON = "2026-07-20";
const TUE = "2026-07-21";
const WED = "2026-07-22";

function emptyCtx(u: EngineUser): ScoringContext {
  return { user: u, fixedRoomsSameDay: new Set(), fixedRoomsOtherDays: new Set(), usageCount: new Map() };
}

function baseData(date: string, rooms: EngineRoom[], users: EngineUser[]): DayData {
  return {
    date,
    cfg: CFG,
    rooms,
    users,
    // all rooms open Sun–Thu 07:00–19:00 by default
    availability: rooms.flatMap((r) =>
      [0, 1, 2, 3, 4].map((dow) => ({
        roomId: r.id,
        dayOfWeek: dow,
        startMin: 420,
        endMin: 1140,
        effectiveFrom: null,
        effectiveTo: null,
      }))
    ),
    assignments: [],
    reductions: [],
    absences: [],
    bookings: [],
  };
}

// ---------- slots ----------

describe("slots", () => {
  it("builds masks for ranges", () => {
    expect(maskFor(CFG, 420, 480)).toBe(0b11); // 07:00–08:00 = first two slots
    expect(countSlots(maskFor(CFG, 480, 900))).toBe(14); // 08:00–15:00
    expect(maskFor(CFG, 420, 1140)).toBe(CFG.fullMask);
  });

  it("clamps out-of-day ranges", () => {
    expect(maskFor(CFG, 0, 480)).toBe(maskFor(CFG, 420, 480));
    expect(maskFor(CFG, 1110, 2000)).toBe(maskFor(CFG, 1110, 1140));
  });

  it("decomposes masks into ranges", () => {
    const m = maskFor(CFG, 480, 540) | maskFor(CFG, 600, 660);
    expect(maskToRanges(CFG, m)).toEqual([
      { startMin: 480, endMin: 540 },
      { startMin: 600, endMin: 660 },
    ]);
  });

  it("covers and formats", () => {
    expect(covers(maskFor(CFG, 480, 660), maskFor(CFG, 510, 600))).toBe(true);
    expect(covers(maskFor(CFG, 480, 660), maskFor(CFG, 450, 600))).toBe(false);
    expect(fmtRange(480, 660)).toBe("08:00–11:00");
  });

  it("computes day-of-week with Sunday=0", () => {
    expect(dowOf(SUN)).toBe(0);
    expect(dowOf(WED)).toBe(3);
  });

  it("supports a custom clinic day (08:00–16:00 = 16 slots)", () => {
    const narrow = makeSlotConfig(480, 960);
    expect(narrow.nSlots).toBe(16);
    expect(narrow.fullMask).toBe((1 << 16) - 1);
    expect(maskFor(narrow, 480, 540)).toBe(0b11);
    // clamps to the configured day, not the default one
    expect(maskFor(narrow, 420, 1140)).toBe(narrow.fullMask);
    expect(maskToRanges(narrow, narrow.fullMask)).toEqual([{ startMin: 480, endMin: 960 }]);
    // peak clamped to intersection with 08:00–15:00
    expect(narrow.peakMask).toBe(maskFor(narrow, 480, 900));
  });

  it("supports the maximum 31-slot day and rejects longer ones", () => {
    const wide = makeSlotConfig(390, 1320); // 06:30–22:00 = 31 slots
    expect(wide.nSlots).toBe(31);
    expect(wide.fullMask).toBe(0x7fffffff);
    expect(countSlots(wide.fullMask)).toBe(31);
    expect(validateDayBounds(390, 1320)).toBeNull();
    expect(validateDayBounds(360, 1320)).toMatch(/15.5/); // 32 slots — too long
  });

  it("validateDayBounds rejects malformed bounds", () => {
    expect(validateDayBounds(420, 1140)).toBeNull();
    expect(validateDayBounds(425, 1140)).toMatch(/חצאי שעות/);
    expect(validateDayBounds(900, 480)).toMatch(/אחרי/);
    expect(validateDayBounds(-30, 480)).toMatch(/יממה/);
    expect(validateDayBounds(420, 1470)).toMatch(/יממה/);
  });
});

// ---------- engine: effective schedule ----------

describe("computeDaySchedule", () => {
  it("applies the core formula: fixed − reduction − absence + booking", () => {
    const r1 = room({ name: "חדר 1" });
    const alice = user({ name: "אליס" });
    const bob = user({ name: "בוב" });
    const data = baseData(MON, [r1], [alice, bob]);

    data.assignments.push({
      id: uid(), userId: alice.id, roomId: r1.id, dayOfWeek: 1,
      startMin: 480, endMin: 900, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular",
    });
    // alice leaves at 14:00 every Monday
    data.reductions.push({
      id: uid(), userId: alice.id, dayOfWeek: 1, startMin: 840, endMin: 900, effectiveFrom: "2026-01-01",
    });
    // alice out 08:00–09:00 this specific Monday
    data.absences.push({
      id: uid(), userId: alice.id, dateFrom: MON, dateTo: MON, startMin: 480, endMin: 540,
    });
    // bob booked the freed 14:00–15:00
    data.bookings.push({
      id: uid(), userId: bob.id, roomId: r1.id, date: MON, startMin: 840, endMin: 900,
      status: "active", kind: "regular",
    });

    const sched = computeDaySchedule(data);
    const rd = sched.rooms[0];
    const aliceOcc = rd.occupants.find((o) => o.userId === alice.id)!;
    expect(aliceOcc.mask).toBe(maskFor(CFG, 540, 840)); // 09:00–14:00 left
    // only the one-time absence (08:00–09:00) is "freed" (hatched); the recurring
    // reduction (14:00–15:00) becomes plain free, not part of freedMask
    expect(aliceOcc.freedMask).toBe(maskFor(CFG, 480, 540));
    const bobOcc = rd.occupants.find((o) => o.userId === bob.id)!;
    expect(bobOcc.mask).toBe(maskFor(CFG, 840, 900));
    // free: 07:00–08:00 + the freed-but-unbooked 08:00–09:00 + evening 15:00–19:00
    expect(rd.freeMask).toBe(maskFor(CFG, 420, 540) | maskFor(CFG, 900, 1140));
  });

  it("respects assignment effective_from/to boundaries", () => {
    const r1 = room({ name: "חדר 1" });
    const alice = user({ name: "אליס" });
    const data = baseData(MON, [r1], [alice]);
    data.assignments.push({
      id: uid(), userId: alice.id, roomId: r1.id, dayOfWeek: 1,
      startMin: 480, endMin: 600, effectiveFrom: "2026-08-01", effectiveTo: null, kind: "regular",
    });
    expect(computeDaySchedule(data).rooms[0].occupants).toHaveLength(0); // not yet effective

    data.assignments[0].effectiveFrom = "2026-01-01";
    data.assignments[0].effectiveTo = "2026-06-30";
    expect(computeDaySchedule(data).rooms[0].occupants).toHaveLength(0); // already ended
  });

  it("reduction applies only from its effective_from", () => {
    const r1 = room({ name: "חדר 1" });
    const alice = user({ name: "אליס" });
    const data = baseData(MON, [r1], [alice]);
    data.assignments.push({
      id: uid(), userId: alice.id, roomId: r1.id, dayOfWeek: 1,
      startMin: 480, endMin: 900, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular",
    });
    data.reductions.push({
      id: uid(), userId: alice.id, dayOfWeek: 1, startMin: 840, endMin: 900, effectiveFrom: "2026-09-01",
    });
    // before effective_from — no reduction
    expect(computeDaySchedule(data).rooms[0].occupants[0].mask).toBe(maskFor(CFG, 480, 900));
  });

  it("whole-day vacation range frees all days in the range", () => {
    const r1 = room({ name: "חדר 1" });
    const alice = user({ name: "אליס" });
    const data = baseData(TUE, [r1], [alice]);
    data.assignments.push({
      id: uid(), userId: alice.id, roomId: r1.id, dayOfWeek: 2,
      startMin: 480, endMin: 900, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular",
    });
    // vacation Sunday→Wednesday, whole days
    data.absences.push({
      id: uid(), userId: alice.id, dateFrom: SUN, dateTo: WED, startMin: null, endMin: null,
    });
    const sched = computeDaySchedule(data);
    expect(sched.rooms[0].occupants[0].mask).toBe(0);
    expect(sched.rooms[0].freeMask).toBe(CFG.fullMask);
  });

  it("pool room only exists in its availability window", () => {
    const pool = room({ name: "פול רביעי", isPool: true });
    const alice = user({ name: "אליס" });
    const data: DayData = {
      date: WED,
      cfg: CFG,
      rooms: [pool],
      users: [alice],
      availability: [
        { roomId: pool.id, dayOfWeek: 3, startMin: 420, endMin: 720, effectiveFrom: null, effectiveTo: null },
      ],
      assignments: [], reductions: [], absences: [], bookings: [],
    };
    const sched = computeDaySchedule(data);
    expect(sched.rooms[0].openMask).toBe(maskFor(CFG, 420, 720));
    expect(sched.rooms[0].freeMask).toBe(maskFor(CFG, 420, 720));

    // on Monday the pool room is closed entirely
    const monData = { ...data, date: MON };
    expect(computeDaySchedule(monData).rooms[0].openMask).toBe(0);
  });

  it("availability window honors effective_to", () => {
    const pool = room({ name: "פול זמני", isPool: true });
    const data: DayData = {
      date: WED,
      cfg: CFG,
      rooms: [pool],
      users: [],
      availability: [
        { roomId: pool.id, dayOfWeek: 3, startMin: 420, endMin: 720, effectiveFrom: null, effectiveTo: "2026-07-01" },
      ],
      assignments: [], reductions: [], absences: [], bookings: [],
    };
    expect(computeDaySchedule(data).rooms[0].openMask).toBe(0); // window expired
  });

  it("deactivated user's fixed slots become background ghosts — room stays free", () => {
    const r1 = room({ name: "חדר 1" });
    const maternity = user({ name: "בחופשת לידה", isActive: false });
    const data = baseData(MON, [r1], [maternity]);
    data.assignments.push({
      id: uid(), userId: maternity.id, roomId: r1.id, dayOfWeek: 1,
      startMin: 480, endMin: 900, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular",
    });
    const sched = computeDaySchedule(data);
    const occ = sched.rooms[0].occupants[0];
    expect(occ.ghost).toBe(true);
    expect(occ.mask).toBe(0); // not occupying
    expect(occ.freedMask).toBe(maskFor(CFG, 480, 900)); // but visible as background
    expect(sched.rooms[0].freeMask).toBe(CFG.fullMask); // room bookable by others
  });

  it("a full closure (holiday) removes all availability for the day", () => {
    const r1 = room({ name: "חדר 1" });
    const alice = user({ name: "אליס" });
    const data = baseData(MON, [r1], [alice]);
    data.assignments.push({
      id: uid(), userId: alice.id, roomId: r1.id, dayOfWeek: 1,
      startMin: 480, endMin: 900, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular",
    });
    data.closure = { type: "closed", endMin: 1140, label: "יום כיפור" };
    const sched = computeDaySchedule(data);
    expect(sched.rooms[0].openMask).toBe(0);
    expect(sched.rooms[0].freeMask).toBe(0);
    expect(sched.rooms[0].occupants[0]?.mask ?? 0).toBe(0);
  });

  it("an erev (early close) caps availability at endMin", () => {
    const r1 = room({ name: "חדר 1" });
    const alice = user({ name: "אליס" });
    const data = baseData(MON, [r1], [alice]);
    data.closure = { type: "early", endMin: 780, label: "ערב פסח" }; // 13:00
    const sched = computeDaySchedule(data);
    expect(sched.rooms[0].openMask).toBe(maskFor(CFG, 420, 780));
  });

  it("cancelled bookings are ignored", () => {
    const r1 = room({ name: "חדר 1" });
    const alice = user({ name: "אליס" });
    const data = baseData(MON, [r1], [alice]);
    data.bookings.push({
      id: uid(), userId: alice.id, roomId: r1.id, date: MON, startMin: 480, endMin: 540,
      status: "cancelled", kind: "regular",
    });
    expect(computeDaySchedule(data).rooms[0].occupants).toHaveLength(0);
  });

  it("works end-to-end with a narrow custom day (08:00–16:00)", () => {
    const narrow = makeSlotConfig(480, 960);
    const r1 = room({ name: "חדר 1" });
    const alice = user({ name: "אליס" });
    const data: DayData = {
      date: MON,
      cfg: narrow,
      rooms: [r1],
      users: [alice],
      availability: [
        { roomId: r1.id, dayOfWeek: 1, startMin: 480, endMin: 960, effectiveFrom: null, effectiveTo: null },
      ],
      assignments: [
        {
          id: uid(), userId: alice.id, roomId: r1.id, dayOfWeek: 1,
          // assignment recorded under wider historical hours — clamped to the day
          startMin: 420, endMin: 1020, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular",
        },
      ],
      reductions: [], absences: [], bookings: [],
    };
    const sched = computeDaySchedule(data);
    expect(sched.rooms[0].openMask).toBe(narrow.fullMask);
    expect(sched.rooms[0].occupants[0].mask).toBe(narrow.fullMask); // clamped, not overflowing
    expect(sched.rooms[0].freeMask).toBe(0);
  });
});

// ---------- scoring ----------

describe("scoring", () => {
  it("orders: same-day fixed room > other-day fixed room > recently used > neutral", () => {
    const rooms = [room({ name: "א" }), room({ name: "ב" }), room({ name: "ג" }), room({ name: "ד" })];
    const alice = user({ name: "אליס" });
    const ctx: ScoringContext = {
      user: alice,
      fixedRoomsSameDay: new Set([rooms[0].id]),
      fixedRoomsOtherDays: new Set([rooms[1].id]),
      usageCount: new Map([[rooms[2].id, 4]]),
    };
    const data = baseData(MON, rooms, [alice]);
    const sched = computeDaySchedule(data);
    const ranked = rankFreeRooms(sched, maskFor(CFG, 480, 540), ctx);
    expect(ranked.map((r) => r.room.name)).toEqual(["א", "ב", "ג", "ד"]);
  });

  it("tier is a subtle tiebreaker only — cannot beat consistency", () => {
    const r1 = room({ name: "א" });
    const staff = user({ name: "בכיר", tier: "staff" });
    const student = user({ name: "סטודנט", tier: "student" });
    // student has the consistency advantage
    const studentCtx: ScoringContext = {
      user: student,
      fixedRoomsSameDay: new Set([r1.id]),
      fixedRoomsOtherDays: new Set(),
      usageCount: new Map(),
    };
    const staffCtx = emptyCtx(staff);
    const sStudent = scoreRoom(r1, studentCtx).score;
    const sStaff = scoreRoom(r1, staffCtx).score;
    expect(sStudent).toBeGreaterThan(sStaff); // consistency dominates hierarchy

    // all else equal — staff wins the tiebreak
    const s2 = scoreRoom(r1, emptyCtx(student)).score;
    const s3 = scoreRoom(r1, emptyCtx(staff)).score;
    expect(s3).toBeGreaterThan(s2);
  });

  it("never mentions hierarchy in reasons", () => {
    const r1 = room({ name: "א", hasWindow: true });
    const res = scoreRoom(r1, emptyCtx(user({ name: "x", tier: "student" })), {
      preferences: { hasWindow: true },
    });
    expect(res.reasons.join(" ")).not.toMatch(/סטודנט|מתמחה|דרג|היררכ/);
  });

  it("hard filters exclude, soft preferences rank", () => {
    const windowRoom = room({ name: "חלון", hasWindow: true });
    const plain = room({ name: "רגיל" });
    const alice = user({ name: "אליס" });
    const data = baseData(MON, [plain, windowRoom], [alice]);
    const sched = computeDaySchedule(data);

    const hard = rankFreeRooms(sched, maskFor(CFG, 480, 540), emptyCtx(alice), {
      filters: { hasWindow: true },
    });
    expect(hard.map((r) => r.room.name)).toEqual(["חלון"]);

    const soft = rankFreeRooms(sched, maskFor(CFG, 480, 540), emptyCtx(alice), {
      preferences: { hasWindow: true },
    });
    expect(soft[0].room.name).toBe("חלון");
    expect(soft).toHaveLength(2);
  });
});

// ---------- suggestions ----------

describe("suggestAlternatives", () => {
  it("finds the nearest shifted window on the same day", () => {
    const r1 = room({ name: "חדר 1" });
    const alice = user({ name: "אליס" });
    const bob = user({ name: "בוב" });

    const getDayData = (date: string): DayData => {
      const data = baseData(date, [r1], [alice, bob]);
      // bob occupies 09:00–10:00 every day
      data.assignments.push({
        id: "a1", userId: bob.id, roomId: r1.id, dayOfWeek: dowOf(date),
        startMin: 540, endMin: 600, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular",
      });
      return data;
    };

    const alts = suggestAlternatives(getDayData, MON, 540, 600, emptyCtx(alice));
    expect(alts.length).toBeGreaterThan(0);
    // a ±30 shift still overlaps the blocked hour, so the nearest valid option is ±60
    expect(alts[0].date).toBe(MON);
    expect(Math.abs(alts[0].startMin - 540)).toBe(60);
  });
});

describe("suggestSwaps", () => {
  it("proposes relocating a single blocker and never displaces a group", () => {
    const r1 = room({ name: "חדר 1" });
    const r2 = room({ name: "חדר 2" });
    const groupRoom = room({ name: "קבוצות", isGroupRoom: true });
    const alice = user({ name: "אליס" });
    const bob = user({ name: "בוב" });
    const carol = user({ name: "קרול" });

    const data = baseData(MON, [r1, r2, groupRoom], [alice, bob, carol]);
    // bob holds room 1 (regular), carol runs a GROUP in the group room
    data.assignments.push(
      {
        id: "a1", userId: bob.id, roomId: r1.id, dayOfWeek: 1,
        startMin: 540, endMin: 600, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular",
      },
      {
        id: "a2", userId: carol.id, roomId: groupRoom.id, dayOfWeek: 1,
        startMin: 540, endMin: 600, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "group",
      }
    );
    const sched = computeDaySchedule(data);
    const wanted = maskFor(CFG, 540, 600);

    const candidates = suggestSwaps(sched, wanted, alice.id, (id) =>
      emptyCtx(id === bob.id ? bob : carol)
    );
    // r1 (bob relocatable to r2) is proposed; group room never proposed via displacing carol
    const roomsProposed = candidates.map((c) => c.roomName);
    expect(roomsProposed).toContain("חדר 1");
    expect(roomsProposed).not.toContain("קבוצות");
    const c1 = candidates.find((c) => c.roomName === "חדר 1")!;
    expect(c1.targetUserId).toBe(bob.id);
    expect(c1.altRoomName).toBeTruthy(); // bob has somewhere to go
  });
});

describe("stitchPlacement", () => {
  it("stitches a patchwork day, minimizes switches, reports gaps", () => {
    const r1 = room({ name: "א" });
    const r2 = room({ name: "ב" });
    const alice = user({ name: "אליס" });
    const blocker = user({ name: "חוסם" });
    const data = baseData(MON, [r1, r2], [alice, blocker]);

    // r1 free 08:00–10:00 only; r2 free 10:00–12:00 only; 12:00–12:30 nothing free
    data.assignments.push(
      { id: "b1", userId: blocker.id, roomId: r1.id, dayOfWeek: 1, startMin: 600, endMin: 1140, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular" },
      { id: "b2", userId: blocker.id, roomId: r2.id, dayOfWeek: 1, startMin: 420, endMin: 600, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular" },
      { id: "b3", userId: alice.id, roomId: r2.id, dayOfWeek: 1, startMin: 720, endMin: 1140, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular" }
    );

    const sched = computeDaySchedule(data);
    const wanted = maskFor(CFG, 480, 750); // 08:00–12:30
    const res = stitchPlacement(sched, wanted, emptyCtx(alice));

    expect(res.segments).toEqual([
      { roomId: r1.id, roomName: "א", startMin: 480, endMin: 600 },
      { roomId: r2.id, roomName: "ב", startMin: 600, endMin: 720 },
    ]);
    expect(res.roomSwitches).toBe(1);
    expect(res.gaps).toEqual([{ startMin: 720, endMin: 750 }]);
  });
});

describe("buildPlacementPlan", () => {
  it("ranks: consistent single room first, patchwork last", () => {
    const r1 = room({ name: "א" });
    const r2 = room({ name: "ב" });
    const alice = user({ name: "חדשה" });
    const blocker = user({ name: "חוסם" });

    const getDayData = (date: string): DayData => {
      const data = baseData(date, [r1, r2], [alice, blocker]);
      if (dowOf(date) === 3) {
        // Wednesday: no single room covers 08:00–12:00 (r1 blocked 10–12, r2 blocked 08–10)
        data.assignments.push(
          { id: "w1", userId: blocker.id, roomId: r1.id, dayOfWeek: 3, startMin: 600, endMin: 720, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular" },
          { id: "w2", userId: blocker.id, roomId: r2.id, dayOfWeek: 3, startMin: 480, endMin: 600, effectiveFrom: "2026-01-01", effectiveTo: null, kind: "regular" }
        );
      }
      return data;
    };

    // Sunday+Wednesday, 08:00–12:00
    const plans = buildPlacementPlan(
      getDayData,
      [
        { date: SUN, dayOfWeek: 0, startMin: 480, endMin: 720 },
        { date: WED, dayOfWeek: 3, startMin: 480, endMin: 720 },
      ],
      emptyCtx(alice)
    );

    // Wednesday has no contiguous room → no "consistent" or "per-day" plan; patchwork exists
    const labels = plans.map((p) => p.label);
    expect(labels).toContain("יום טלאים (בלית ברירה)");
    const patch = plans.find((p) => p.label === "יום טלאים (בלית ברירה)")!;
    expect(patch.quality).toBe(3);
    const wedDay = patch.days.find((d) => d.dayOfWeek === 3)!;
    expect(wedDay.segments.length).toBe(2); // stitched across both rooms
    expect(wedDay.contiguous).toBe(false);

    // Sunday-only request → consistent plan ranks first
    const easyPlans = buildPlacementPlan(
      getDayData,
      [{ date: SUN, dayOfWeek: 0, startMin: 480, endMin: 720 }],
      emptyCtx(alice)
    );
    expect(easyPlans[0].label).toBe("חדר קבוע אחיד");
    expect(easyPlans[0].quality).toBe(1);
  });
});

describe("checkRecurring", () => {
  it("detects conflicts across future occurrences", () => {
    const r1 = room({ name: "א" });
    const alice = user({ name: "אליס" });
    const bob = user({ name: "בוב" });

    const getDayData = (date: string): DayData => {
      const data = baseData(date, [r1], [alice, bob]);
      // bob occupies Mondays 09:00–10:00 starting 2026-08-01
      data.assignments.push({
        id: "a1", userId: bob.id, roomId: r1.id, dayOfWeek: 1,
        startMin: 540, endMin: 600, effectiveFrom: "2026-08-01", effectiveTo: null, kind: "regular",
      });
      return data;
    };

    const res = checkRecurring(getDayData, r1.id, MON, 1, 540, 600, 8);
    expect(res.ok).toBe(false);
    // first two Mondays (Jul 20, 27) are fine; conflicts start in August
    expect(res.conflicts.every((c) => c.date >= "2026-08-01")).toBe(true);
    expect(res.conflicts.length).toBeGreaterThan(0);
  });
});
