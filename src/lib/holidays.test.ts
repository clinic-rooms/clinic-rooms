import { describe, it, expect } from "vitest";
import { HebrewCalendar } from "@hebcal/core";
import { autoClosureForDate, upcomingHolidays } from "./holidays";

// the installer's holidays API takes the clinic's configurable day end
const DAY_END = 1140; // 19:00 — default clinic day

/** Gregorian yyyy-mm-dd of a holiday (by hebcal desc prefix) in a Hebrew year. */
function findDate(hyear: number, descPrefix: string): string {
  const events = HebrewCalendar.calendar({ year: hyear, isHebrewYear: true, il: true, noModern: false });
  const e = events.find((ev) => ev.getDesc().startsWith(descPrefix));
  if (!e) throw new Error(`not found: ${descPrefix} in ${hyear}`);
  const d = e.getDate().greg();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shift(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Hebrew year 5788 = fall 2027 → summer 2028 (a future year, no overrides involved)
const HY = 5788;

describe("holiday closure rules", () => {
  it("full chag closes the day; its erev closes at 13:00", () => {
    const kippur = findDate(HY, "Yom Kippur");
    expect(autoClosureForDate(kippur, DAY_END)?.type).toBe("closed");
    expect(autoClosureForDate(shift(kippur, -1), DAY_END)).toMatchObject({ type: "early", endMin: 780 });
  });

  it("Purim, Chanukah, Tisha B'Av and their erevs are regular work days", () => {
    const purim = findDate(HY, "Purim");
    expect(autoClosureForDate(purim, DAY_END)).toBeNull();
    expect(autoClosureForDate(shift(purim, -1), DAY_END)).toBeNull(); // Erev Purim
    const tishaBav = findDate(HY, "Tish'a B'Av");
    expect(autoClosureForDate(tishaBav, DAY_END)).toBeNull();
    expect(autoClosureForDate(shift(tishaBav, -1), DAY_END)).toBeNull(); // Erev Tisha B'Av
    const chanukah = findDate(HY, "Chanukah: 2 Candles");
    expect(autoClosureForDate(chanukah, DAY_END)).toBeNull();
  });

  it("Yom HaAtzmaut closed; Yom HaZikaron until 13:00", () => {
    const atzmaut = findDate(HY, "Yom HaAtzma");
    expect(autoClosureForDate(atzmaut, DAY_END)?.type).toBe("closed");
    const zikaron = findDate(HY, "Yom HaZikaron");
    expect(autoClosureForDate(zikaron, DAY_END)).toMatchObject({ type: "early", endMin: 780 });
  });

  it("a full-chag closure uses the clinic's configured day end", () => {
    const kippur = findDate(HY, "Yom Kippur");
    expect(autoClosureForDate(kippur, 960)?.endMin).toBe(960); // 16:00 clinic
  });

  it("chol hamoed is a regular day by default but listed as markable in the review", () => {
    const sukkot = findDate(HY, "Sukkot I");
    const cholHamoed = shift(sukkot, 2); // inside chol hamoed sukkot
    expect(autoClosureForDate(cholHamoed, DAY_END)).toBeNull();

    const rows = upcomingHolidays(shift(sukkot, -30), DAY_END, 3);
    const chmRows = rows.filter((r) => r.label === "חול המועד סוכות");
    expect(chmRows.length).toBeGreaterThanOrEqual(3);
    expect(chmRows.every((r) => r.type === "open")).toBe(true);
  });

  it("erev Yom HaZikaron is listed as markable (open by default)", () => {
    const zikaron = findDate(HY, "Yom HaZikaron");
    const rows = upcomingHolidays(shift(zikaron, -30), DAY_END, 3);
    const erev = rows.find((r) => r.label === "ערב יום הזיכרון");
    expect(erev).toMatchObject({ type: "open", date: shift(zikaron, -1) });
  });
});
