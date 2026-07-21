import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { makeSlotConfig, fmtRange, type SlotConfig } from "./slots";

export type ClinicSettings = {
  clinicName: string;
  activeDays: number[];
  dayStartMin: number;
  dayEndMin: number;
  shareToken: string | null;
  aiEnabled: boolean;
  setupComplete: boolean;
};

const DEFAULTS: ClinicSettings = {
  clinicName: "המרפאה",
  activeDays: [0, 1, 2, 3, 4],
  dayStartMin: 420,
  dayEndMin: 1140,
  shareToken: null,
  aiEnabled: true,
  setupComplete: false,
};

/**
 * Single per-request read of clinic_settings (React cache dedupes within a
 * request). Falls back to defaults on a fresh DB where the row doesn't exist yet.
 */
export const getClinicSettings = cache(async (): Promise<ClinicSettings> => {
  const rows = await db.select().from(t.clinicSettings).limit(1);
  const row = rows[0];
  if (!row) return DEFAULTS;
  return {
    clinicName: row.clinicName,
    activeDays: row.activeDays ?? DEFAULTS.activeDays,
    dayStartMin: row.dayStartMin ?? DEFAULTS.dayStartMin,
    dayEndMin: row.dayEndMin ?? DEFAULTS.dayEndMin,
    shareToken: row.shareToken ?? null,
    aiEnabled: row.aiEnabled ?? true,
    setupComplete: row.setupComplete ?? false,
  };
});

export const getScheduleConfig = cache(async (): Promise<SlotConfig> => {
  const s = await getClinicSettings();
  return makeSlotConfig(s.dayStartMin, s.dayEndMin);
});

/**
 * Server-side window check for action inputs — zod only validates shape
 * (0–1440, 30-min aligned); real bounds live in the DB.
 */
export function checkWindow(cfg: SlotConfig, startMin: number, endMin: number): string | null {
  if (endMin <= startMin) return "שעת הסיום חייבת להיות אחרי שעת ההתחלה";
  if (startMin < cfg.dayStartMin || endMin > cfg.dayEndMin) {
    return `השעות חייבות להיות בתוך שעות הפעילות (${fmtRange(cfg.dayStartMin, cfg.dayEndMin)})`;
  }
  return null;
}
