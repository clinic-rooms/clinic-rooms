import { requireUser } from "@/lib/auth/session";
import { getActiveDays, activeWeekDates } from "@/lib/schedule/data";
import { getScheduleConfig } from "@/lib/schedule/config";
import { buildGridForDate } from "@/lib/schedule/grid";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { todayIL } from "@/lib/dates";
import { PrintWeek, type PrintDay } from "@/components/print-week";

export const dynamic = "force-dynamic";

export default async function PrintPage() {
  // weekly print/PDF is available to all staff, not only admins
  await requireUser();
  const today = todayIL();
  const activeDays = await getActiveDays();
  const dates = activeWeekDates(today, activeDays);
  const [settings] = await db.select().from(t.clinicSettings).limit(1);

  const cfg = await getScheduleConfig();
  const days: PrintDay[] = [];
  for (const date of dates) {
    const grid = await buildGridForDate(date);
    const centerName = new Map(grid.centers.map((c) => [c.id, c.name]));
    days.push({
      date,
      closure: grid.closure,
      rooms: grid.rooms.map((r) => ({
        // multi-center: the center name rides along so the printout stays readable
        name:
          grid.multiCenter && r.centerId && centerName.has(r.centerId)
            ? `${r.name} · ${centerName.get(r.centerId)}`
            : r.name,
        cells: r.cells.map((c) =>
          c.type === "occupied"
            ? { name: c.name + (c.second ? ` +${c.second.name}` : ""), color: c.color }
            : c.type === "closed"
              ? { closed: true }
              : {}
        ),
      })),
    });
  }

  return (
    <PrintWeek
      clinicName={settings?.clinicName ?? "המרפאה"}
      days={days}
      bounds={{ dayStartMin: cfg.dayStartMin, dayEndMin: cfg.dayEndMin }}
    />
  );
}
