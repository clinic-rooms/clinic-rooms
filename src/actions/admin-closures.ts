"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/action-result";
import { upcomingHolidays, autoClosureForDate } from "@/lib/holidays";
import { getScheduleConfig } from "@/lib/schedule/config";
import { todayIL } from "@/lib/dates";

export type ClosureRow = {
  date: string;
  type: "closed" | "early" | "open";
  endMin: number;
  label: string;
  source: "auto" | "override";
};

/**
 * Merged upcoming-closures view for the admin: auto-detected Hebrew-calendar
 * holidays combined with admin overrides. Admin overrides win.
 */
export async function listClosures(): Promise<ClosureRow[]> {
  await requireAdmin();
  const today = todayIL();
  const cfg = await getScheduleConfig();
  const overrides = await db.select().from(t.clinicClosures);
  const overrideByDate = new Map(overrides.map((o) => [o.date, o]));

  const rows = new Map<string, ClosureRow>();

  // auto-detected holidays for the next ~14 months
  for (const { date, closure } of upcomingHolidays(today, cfg.dayEndMin, 14)) {
    rows.set(date, { date, type: closure.type, endMin: closure.endMin, label: closure.label, source: "auto" });
  }

  // apply / add overrides (manual closures or changes to detected ones)
  for (const o of overrides) {
    if (o.date < today) continue;
    rows.set(o.date, {
      date: o.date,
      type: o.type as ClosureRow["type"],
      endMin: o.endMin,
      label: o.label ?? rows.get(o.date)?.label ?? "סגירה",
      source: "override",
    });
  }

  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const upsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["closed", "early", "open"]),
  endMin: z.number().int().min(0).max(1440).multipleOf(30).optional(),
  label: z.string().max(60).optional(),
});

/** Set an admin override for a date (closed / early / open-as-usual). */
export async function upsertClosure(input: z.infer<typeof upsertSchema>): Promise<ActionResult> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { error: "נתונים לא תקינים" };
  await requireAdmin();
  const d = parsed.data;
  const cfg = await getScheduleConfig();
  const label = d.label || autoClosureForDate(d.date, cfg.dayEndMin)?.label || "סגירה";
  const endMin = d.type === "early" ? d.endMin ?? Math.min(780, cfg.dayEndMin) : cfg.dayEndMin;

  await db
    .insert(t.clinicClosures)
    .values({ date: d.date, type: d.type, endMin, label })
    .onConflictDoUpdate({
      target: t.clinicClosures.date,
      set: { type: d.type, endMin, label },
    });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}

/** Remove an override — reverts to the auto-detected default for that date. */
export async function deleteClosure(date: string): Promise<ActionResult> {
  await requireAdmin();
  await db.delete(t.clinicClosures).where(eq(t.clinicClosures.date, date));
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true };
}
