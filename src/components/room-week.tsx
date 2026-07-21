"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ChevronLeft, ArrowRight, DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { fmtMin, slotToMin, addDays, DAY_NAMES, dowOf, SLOT_MIN, type SlotBounds } from "@/lib/schedule/slots";
import { fmtDayMonth, fmtDateShort } from "@/lib/dates";
import { cellStyle } from "@/lib/palette";
import type { RoomWeekDay } from "@/lib/schedule/grid";

/** One room across the week: columns = days, rows = half-hour slots. */
export function RoomWeek({
  room,
  weekFrom,
  bounds,
  days,
  today,
  backPath,
}: {
  room: { id: string; name: string };
  weekFrom: string;
  bounds: SlotBounds;
  days: RoomWeekDay[];
  today: string;
  backPath: string;
}) {
  const router = useRouter();
  const nSlots = (bounds.dayEndMin - bounds.dayStartMin) / SLOT_MIN;
  const nav = (dir: 1 | -1) =>
    router.push(`/room/${room.id}?from=${addDays(weekFrom, dir * 7)}&back=${encodeURIComponent(backPath)}`);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link href={backPath}>
          <Button variant="ghost" size="sm">
            <ArrowRight size={16} />
            חזרה ללוח
          </Button>
        </Link>
        <h1 className="flex items-center gap-1.5 text-lg font-bold">
          <DoorOpen size={18} className="text-primary" />
          {room.name} — תצוגה שבועית
        </h1>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" onClick={() => nav(-1)} aria-label="שבוע קודם">
          <ChevronRight size={18} />
        </Button>
        <span className="text-sm font-medium text-muted-foreground" dir="ltr">
          {fmtDateShort(weekFrom)} – {fmtDateShort(addDays(weekFrom, 6))}
        </span>
        <Button variant="outline" size="icon" onClick={() => nav(1)} aria-label="שבוע הבא">
          <ChevronLeft size={18} />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full table-fixed border-collapse text-xs" style={{ minWidth: days.length * 88 + 56 }}>
          <colgroup>
            <col style={{ width: 56 }} />
            {days.map((d) => (
              <col key={d.date} style={{ width: 88 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky right-0 z-20 border-b border-l border-border bg-card p-1 font-medium text-muted-foreground">
                שעה
              </th>
              {days.map((d) => (
                <th
                  key={d.date}
                  className={cn(
                    "border-b border-l border-border bg-card p-1.5 font-semibold",
                    d.date === today && "text-primary"
                  )}
                >
                  <div>יום {DAY_NAMES[dowOf(d.date)]}</div>
                  <div className="text-[10px] font-normal text-muted-foreground" dir="ltr">
                    {fmtDayMonth(d.date)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: nSlots }, (_, slot) => (
              <tr key={slot}>
                <td
                  className="sticky right-0 z-10 border-b border-l border-border bg-card px-1 text-center font-medium text-muted-foreground"
                  dir="ltr"
                >
                  {fmtMin(slotToMin(bounds, slot))}
                </td>
                {days.map((d) => {
                  const cell = d.cells?.[slot] ?? { type: "closed" as const };
                  const prev = slot > 0 ? d.cells?.[slot - 1] : undefined;
                  const segStart =
                    cell.type === "occupied" && (!prev || prev.type !== "occupied" || prev.userId !== cell.userId);
                  return (
                    <td
                      key={d.date}
                      className={cn(
                        "h-6 border-b border-l border-border/60 p-0 text-center align-middle",
                        cell.type === "closed" && "bg-muted/60",
                        cell.type === "free" && "bg-card",
                        cell.type === "freed" &&
                          "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,var(--border)_4px,var(--border)_6px)]"
                      )}
                      style={cell.type === "occupied" ? cellStyle(cell.color, cell.pattern) : undefined}
                    >
                      {cell.type === "occupied" && segStart && (
                        <span className="block truncate px-1 text-[10px] font-semibold" style={{ color: "white" }}>
                          {cell.name}
                          {cell.second ? ` + ${cell.second.name}` : ""}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        לבן = פנוי · מקווקו = פונה זמנית · אפור = החדר סגור
      </p>
    </div>
  );
}
