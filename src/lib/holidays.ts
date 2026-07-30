import { HebrewCalendar, flags, type Event } from "@hebcal/core";

export type ClosureType = "closed" | "early" | "open";
export type Closure = { type: "closed" | "early"; endMin: number; label: string };

/** A review-screen row: closed/early are auto-applied; "open" days are listed so the admin can mark them (e.g. chol hamoed → 13:00). */
export type HolidayRow = { date: string; type: ClosureType; endMin: number; label: string };

const EREV_END_MIN = 780; // 13:00

function parseYmd(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

function toYmd(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function eventsOn(dateStr: string): Event[] {
  const { y, m, d } = parseYmd(dateStr);
  return HebrewCalendar.getHolidaysOnDate(new Date(y, m - 1, d), true) ?? [];
}

function addDaysYmd(dateStr: string, n: number): string {
  const { y, m, d } = parseYmd(dateStr);
  const dt = new Date(y, m - 1, d + n);
  return toYmd(dt);
}

const isChag = (e: Event) => Boolean(e.getFlags() & flags.CHAG) && !(e.getFlags() & flags.EREV);

/** Erev counts for early closing only when the NEXT day is an actual chag
 *  (assur be'melacha). This excludes Erev Purim and Erev Tisha B'Av, which
 *  hebcal also flags as "erev" but are regular work days here. */
function isErevOfChag(dateStr: string, events: Event[]): Event | undefined {
  const erev = events.find((e) => e.getFlags() & flags.EREV);
  if (!erev) return undefined;
  return eventsOn(addDaysYmd(dateStr, 1)).some(isChag) ? erev : undefined;
}

const isYomHaZikaron = (e: Event) => e.getDesc().startsWith("Yom HaZikaron");
const isYomHaAtzmaut = (e: Event) => e.getDesc().startsWith("Yom HaAtzma");
const isCholHamoed = (e: Event) => Boolean(e.getFlags() & flags.CHOL_HAMOED);

function cholHamoedLabel(e: Event): string {
  return e.getDesc().includes("Sukkot") ? "חול המועד סוכות" : "חול המועד פסח";
}

/**
 * Auto-detected clinic closure for a Gregorian date, from the Israeli Hebrew
 * calendar:
 * - Full Yom Tov (work forbidden) → closed all day. Its erev → works until 13:00.
 * - Yom HaAtzmaut → closed. Yom HaZikaron (= erev Yom HaAtzmaut) → until 13:00.
 * - Purim, Chanukah, Tisha B'Av and their erevs → regular work days (no closure).
 * - Chol Hamoed → regular by default; listed in the review screen so the admin
 *   can mark "until 13:00" per day (admin override wins).
 */
export function autoClosureForDate(dateStr: string, dayEndMin: number): Closure | null {
  const events = eventsOn(dateStr);
  if (events.length === 0) return null;

  const chag = events.find(isChag);
  if (chag) return { type: "closed", endMin: dayEndMin, label: chag.render("he") };

  const atzmaut = events.find(isYomHaAtzmaut);
  if (atzmaut) return { type: "closed", endMin: dayEndMin, label: "יום העצמאות" };

  const zikaron = events.find(isYomHaZikaron);
  if (zikaron) return { type: "early", endMin: EREV_END_MIN, label: "יום הזיכרון (ערב יום העצמאות)" };

  const erev = isErevOfChag(dateStr, events);
  if (erev) return { type: "early", endMin: EREV_END_MIN, label: erev.render("he") };

  return null;
}

/**
 * Upcoming holiday rows for the admin review screen. Includes:
 * - auto closures (chag / erev chag / national days), and
 * - "open" suggestion rows (chol hamoed, erev Yom HaZikaron) that work as
 *   usual until the admin marks them otherwise.
 */
export function upcomingHolidays(fromDate: string, dayEndMin: number, months = 14): HolidayRow[] {
  const { y, m, d } = parseYmd(fromDate);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1 + months, d);
  const events = HebrewCalendar.calendar({
    start,
    end,
    il: true,
    sedrot: false,
    omer: false,
    candlelighting: false,
    noRoshChodesh: true,
    noMinorFast: true,
    noModern: false,
    noSpecialShabbat: true,
  });

  const byDate = new Map<string, HolidayRow>();
  const put = (date: string, row: HolidayRow, force = false) => {
    if (date < fromDate) return;
    if (force || !byDate.has(date)) byDate.set(date, row);
  };

  for (const e of events) {
    const date = toYmd(e.getDate().greg());
    const f = e.getFlags();

    if (isChag(e)) {
      put(date, { date, type: "closed", endMin: dayEndMin, label: e.render("he") }, true);
    } else if (isYomHaAtzmaut(e)) {
      put(date, { date, type: "closed", endMin: dayEndMin, label: "יום העצמאות" }, true);
    } else if (isYomHaZikaron(e)) {
      put(date, { date, type: "early", endMin: EREV_END_MIN, label: "יום הזיכרון (ערב יום העצמאות)" }, true);
      // the day before is listed too, markable by the admin
      const evDate = addDaysYmd(date, -1);
      put(evDate, { date: evDate, type: "open", endMin: dayEndMin, label: "ערב יום הזיכרון" });
    } else if (f & flags.EREV) {
      if (isErevOfChag(date, [e])) {
        put(date, { date, type: "early", endMin: EREV_END_MIN, label: e.render("he") });
      }
      // erev of a non-chag (Purim, Tisha B'Av) — regular day, not listed
    } else if (isCholHamoed(e)) {
      // Saturdays are closed anyway — no point listing them
      const dow = e.getDate().greg().getDay();
      if (dow !== 6) put(date, { date, type: "open", endMin: dayEndMin, label: cholHamoedLabel(e) });
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
