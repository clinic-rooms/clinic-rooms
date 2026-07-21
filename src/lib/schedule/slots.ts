/**
 * Slot math. The clinic day is configurable (default 07:00–19:00) and lives in
 * clinic_settings; callers thread it through as a SlotConfig.
 * Every (room, day) occupancy is an n-bit integer; interval math is bitwise.
 * Bit i = slot starting at dayStartMin + i*30min.
 * JS bitwise ops are 32-bit signed, so the day spans at most 31 slots (15.5h).
 */

export const SLOT_MIN = 30;
export const MAX_SLOTS = 31;

/** Serializable day bounds — safe to pass from server pages to client components. */
export type SlotBounds = { dayStartMin: number; dayEndMin: number };

export type SlotConfig = SlotBounds & {
  nSlots: number;
  fullMask: number;
  /** Peak hours 08:00–15:00 clamped to the day — where scarcity matters most. */
  peakMask: number;
};

/** Pure and isomorphic — client components rebuild the config from SlotBounds. */
export function makeSlotConfig(dayStartMin: number, dayEndMin: number): SlotConfig {
  const nSlots = Math.max(0, Math.min(MAX_SLOTS, (dayEndMin - dayStartMin) / SLOT_MIN));
  // 1 << 31 overflows 32-bit signed math, so the 31-slot mask is spelled out
  const fullMask = nSlots >= MAX_SLOTS ? 0x7fffffff : nSlots > 0 ? (1 << nSlots) - 1 : 0;
  const cfg: SlotConfig = { dayStartMin, dayEndMin, nSlots, fullMask, peakMask: 0 };
  cfg.peakMask = maskFor(cfg, 8 * 60, 15 * 60) || fullMask;
  return cfg;
}

/** Validates admin-entered day bounds. Returns a Hebrew error, or null when valid. */
export function validateDayBounds(startMin: number, endMin: number): string | null {
  if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) return "שעות לא תקינות";
  if (startMin % SLOT_MIN !== 0 || endMin % SLOT_MIN !== 0) return "השעות חייבות להתיישר לחצאי שעות";
  if (startMin < 0 || endMin > 24 * 60) return "השעות חייבות להיות בתוך היממה";
  if (endMin <= startMin) return "שעת הסיום חייבת להיות אחרי שעת ההתחלה";
  if ((endMin - startMin) / SLOT_MIN > MAX_SLOTS) return "יום הפעילות יכול להיות באורך 15.5 שעות לכל היותר";
  return null;
}

export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"] as const;

export function slotIndex(cfg: SlotBounds, min: number): number {
  return (min - cfg.dayStartMin) / SLOT_MIN;
}

export function slotToMin(cfg: SlotBounds, slot: number): number {
  return cfg.dayStartMin + slot * SLOT_MIN;
}

/** Bitmask covering [startMin, endMin). Clamps to the clinic day. */
export function maskFor(cfg: SlotBounds, startMin: number, endMin: number): number {
  const s = Math.max(startMin, cfg.dayStartMin);
  const e = Math.min(endMin, cfg.dayEndMin);
  if (e <= s) return 0;
  const from = slotIndex(cfg, s);
  const n = slotIndex(cfg, e) - from;
  return ((1 << n) - 1) << from;
}

export function countSlots(mask: number): number {
  let c = 0;
  let m = mask;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}

/** Decompose a mask into contiguous [startMin, endMin) segments. */
export function maskToRanges(cfg: SlotConfig, mask: number): { startMin: number; endMin: number }[] {
  const ranges: { startMin: number; endMin: number }[] = [];
  let start = -1;
  for (let i = 0; i <= cfg.nSlots; i++) {
    const set = i < cfg.nSlots && (mask & (1 << i)) !== 0;
    if (set && start === -1) start = i;
    if (!set && start !== -1) {
      ranges.push({ startMin: slotToMin(cfg, start), endMin: slotToMin(cfg, i) });
      start = -1;
    }
  }
  return ranges;
}

/** True if `mask` fully covers `wanted`. */
export function covers(mask: number, wanted: number): boolean {
  return (mask & wanted) === wanted;
}

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function fmtRange(startMin: number, endMin: number): string {
  return `${fmtMin(startMin)}–${fmtMin(endMin)}`;
}

/** Day-of-week for a yyyy-mm-dd date string. JS getDay(): 0=Sunday … matches our convention. */
export function dowOf(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getDay();
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
