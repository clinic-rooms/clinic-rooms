import { HebrewCalendar, flags } from "@hebcal/core";

export type ClosureType = "closed" | "early" | "open";
export type Closure = { type: "closed" | "early"; endMin: number; label: string };

const EREV_END_MIN = 780; // 13:00

function parseYmd(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

/**
 * Auto-detected clinic closure for a Gregorian date, from the Israeli Hebrew
 * calendar. A full Yom Tov (work forbidden) closes the whole day; its erev is a
 * work day that closes early (13:00). Minor holidays, Chol Hamoed, Chanukah,
 * Purim etc. are working days → no closure.
 */
export function autoClosureForDate(dateStr: string, dayEndMin: number): Closure | null {
  const { y, m, d } = parseYmd(dateStr);
  const events = HebrewCalendar.getHolidaysOnDate(new Date(y, m - 1, d), true) ?? [];
  if (events.length === 0) return null;

  // major festival (assur be'melacha) → closed all day
  const chag = events.find((e) => e.getFlags() & flags.CHAG && !(e.getFlags() & flags.EREV));
  if (chag) return { type: "closed", endMin: dayEndMin, label: chag.render("he") };

  // erev of a festival → works until 13:00
  const erev = events.find((e) => e.getFlags() & flags.EREV);
  if (erev) return { type: "early", endMin: EREV_END_MIN, label: erev.render("he") };

  return null;
}

/** Upcoming auto-detected holiday closures for the admin review screen. */
export function upcomingHolidays(fromDate: string, dayEndMin: number, months = 14): { date: string; closure: Closure }[] {
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
    noModern: true,
    noSpecialShabbat: true,
  });

  const byDate = new Map<string, Closure>();
  for (const e of events) {
    const dt = e.getDate().greg();
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const f = e.getFlags();
    if (f & flags.CHAG && !(f & flags.EREV)) {
      byDate.set(key, { type: "closed", endMin: dayEndMin, label: e.render("he") });
    } else if (f & flags.EREV && !byDate.has(key)) {
      byDate.set(key, { type: "early", endMin: EREV_END_MIN, label: e.render("he") });
    }
  }

  return [...byDate.entries()]
    .filter(([date]) => date >= fromDate)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, closure]) => ({ date, closure }));
}
