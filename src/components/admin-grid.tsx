"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ChevronLeft, AppWindow, Maximize2, Users as UsersIcon, Layers, Eye, EyeOff, Printer, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { fmtMin, slotToMin, addDays, dowOf, SLOT_MIN, type SlotBounds } from "@/lib/schedule/slots";
import { fmtDateHe, nowMinutesIL } from "@/lib/dates";
import { GridCellSheet } from "@/components/grid-cell-sheet";
import { StaffBookSheet } from "@/components/staff-book-sheet";
import { Avatar } from "@/components/ui";
import { BoardSearch } from "@/components/board-search";
import { cellStyle } from "@/lib/palette";

export type GridCell =
  | { type: "closed" }
  | { type: "free" }
  | { type: "freed"; userId: string; name: string; color: string; pattern: string; inactive?: boolean }
  | {
      type: "occupied";
      userId: string;
      name: string;
      color: string;
      pattern: string;
      kind: "regular" | "group";
      source: "fixed" | "booking" | "label";
      refId: string;
      refStartMin?: number;
      refEndMin?: number;
      second?: {
        userId: string;
        name: string;
        color: string;
        pattern: string;
        source: "fixed" | "booking" | "label";
        refId: string;
      };
    };

export type GridRoom = {
  id: string;
  name: string;
  hasWindow: boolean;
  hasSink: boolean;
  isLarge: boolean;
  isGroupRoom: boolean;
  isPool: boolean;
  cells: GridCell[];
};

export type GridUser = { id: string; name: string; color: string; pattern: string };

export type OnLeaveEntry = { name: string; color: string; pattern: string; detail: string };

export function AdminGrid({
  date,
  activeDays,
  bounds,
  rooms,
  users,
  isToday,
  onLeave = [],
  closure = null,
  readOnly = false,
  bookable = false,
  basePath = "/admin",
  roomWeek = false,
}: {
  date: string;
  activeDays: number[];
  bounds: SlotBounds;
  rooms: GridRoom[];
  users: GridUser[];
  onLeave?: OnLeaveEntry[];
  closure?: { type: "closed" | "early"; label: string; endMin: number } | null;
  isToday: boolean;
  readOnly?: boolean;
  bookable?: boolean;
  basePath?: string;
  /** allow clicking a room header to open its weekly view (auth-only surfaces) */
  roomWeek?: boolean;
}) {
  const nSlots = (bounds.dayEndMin - bounds.dayStartMin) / SLOT_MIN;
  const router = useRouter();
  const [selected, setSelected] = useState<{ room: GridRoom; slot: number } | null>(null);
  const [bookSlot, setBookSlot] = useState<{ room: GridRoom; slot: number } | null>(null);
  // long-leave ghosts are hidden by default — the room is simply free.
  // Admins can reveal them on demand; the staff board never shows them.
  const [showGhosts, setShowGhosts] = useState(false);
  const ghostsVisible = showGhosts && !readOnly;
  const hasGhosts = useMemo(
    () => !readOnly && rooms.some((r) => r.cells.some((c) => c.type === "freed" && c.inactive)),
    [rooms, readOnly]
  );

  const effectiveCell = (raw: GridCell): GridCell =>
    raw.type === "freed" && raw.inactive && !ghostsVisible ? { type: "free" } : raw;

  const nextActive = (d: string, dir: 1 | -1) => {
    let x = addDays(d, dir);
    for (let i = 0; i < 7 && !activeDays.includes(dowOf(x)); i++) x = addDays(x, dir);
    return x;
  };

  // occupancy heat per slot (share of open rooms that are taken)
  const heat = useMemo(
    () =>
      Array.from({ length: nSlots }, (_, slot) => {
        let open = 0;
        let taken = 0;
        for (const r of rooms) {
          const c = r.cells[slot];
          if (c.type === "closed") continue;
          open++;
          if (c.type === "occupied") taken++;
        }
        return open === 0 ? 0 : taken / open;
      }),
    [rooms, nSlots]
  );

  const nowSlot = isToday ? Math.floor((nowMinutesIL() - bounds.dayStartMin) / SLOT_MIN) : -1;

  // horizontal-scroll cue: floating arrows when more rooms overflow the viewport.
  // RTL: scrollLeft runs 0 → negative as you scroll toward the extra rooms.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ more: false, back: false });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const overflow = el.scrollWidth - el.clientWidth;
      const pos = Math.abs(el.scrollLeft);
      setCanScroll({ more: overflow > 4 && pos < overflow - 4, back: pos > 4 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [rooms.length]);
  const scrollRooms = (dir: 1 | -1) => {
    // dir 1 = reveal the next rooms (leftwards in RTL)
    scrollRef.current?.scrollBy({ left: dir * -276, behavior: "smooth" });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" onClick={() => router.push(`${basePath}?date=${nextActive(date, -1)}`)} aria-label="יום קודם">
          <ChevronRight size={18} />
        </Button>
        <div className="flex min-w-0 flex-col items-center gap-1">
          <h1 className="truncate text-center text-base font-bold sm:text-lg">{fmtDateHe(date, { year: "numeric" })}</h1>
          <DateField
            value={date}
            onChange={(v) => router.push(`${basePath}?date=${v}`)}
            className="h-7 w-auto rounded-lg px-2 text-xs"
            aria-label="בחירת תאריך"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => router.push(`${basePath}?date=${nextActive(date, 1)}`)} aria-label="יום הבא">
          <ChevronLeft size={18} />
        </Button>
      </div>

      {/* weekly print: admin grid + staff board (not the public share link) */}
      {(!readOnly || bookable) && (
        <div className="flex justify-end">
          <Link href="/print">
            <Button size="sm" variant="ghost">
              <Printer size={14} />
              הדפסת שבוע / PDF
            </Button>
          </Link>
        </div>
      )}

      <BoardSearch rooms={rooms} users={users} isToday={isToday} bounds={bounds} />

      {closure && (
        <div
          className={cn(
            "rounded-xl border p-3 text-sm font-medium",
            closure.type === "closed"
              ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"
              : "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-100"
          )}
        >
          {closure.type === "closed"
            ? `המרפאה סגורה היום — ${closure.label}`
            : `${closure.label}: המרפאה עובדת עד ${fmtMin(closure.endMin)}`}
        </div>
      )}

      {onLeave.length > 0 && closure?.type !== "closed" && (
        <div className="rounded-xl border border-border bg-muted/40 p-2.5">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">בחופש / נעדרים היום:</p>
          <div className="flex flex-wrap gap-2">
            {onLeave.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-1 text-xs">
                <Avatar name={p.name} color={p.color} pattern={p.pattern} size={18} />
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">· {p.detail}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {hasGhosts && (
        <div className="flex justify-end">
          <Button size="sm" variant={showGhosts ? "secondary" : "ghost"} onClick={() => setShowGhosts(!showGhosts)}>
            {showGhosts ? <EyeOff size={14} /> : <Eye size={14} />}
            {showGhosts ? "הסתרת חופשות ארוכות" : "הצגת חופשות ארוכות ברקע"}
          </Button>
        </div>
      )}

      {/* heat strip */}
      <div className="flex h-1.5 overflow-hidden rounded-full">
        {heat.map((h, i) => (
          <div
            key={i}
            className="flex-1"
            style={{ backgroundColor: h === 0 ? "var(--muted)" : `color-mix(in srgb, var(--primary) ${Math.round(h * 100)}%, var(--muted))` }}
            title={`${fmtMin(slotToMin(bounds, i))} — ${Math.round(h * 100)}% תפוסה`}
          />
        ))}
      </div>

      <div className="relative">
        {/* floating arrows — obvious cue that more rooms overflow sideways */}
        {canScroll.more && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-10 rounded-l-2xl bg-gradient-to-r from-background/90 to-transparent" />
            <button
              onClick={() => scrollRooms(1)}
              aria-label="חדרים נוספים"
              className="absolute left-1 top-1/2 z-30 -translate-y-1/2 rounded-full border border-border bg-card p-1.5 text-primary shadow-md transition hover:bg-accent"
            >
              <ChevronLeft size={18} />
            </button>
          </>
        )}
        {canScroll.back && (
          <button
            onClick={() => scrollRooms(-1)}
            aria-label="חזרה לחדרים הראשונים"
            className="absolute right-14 top-1/2 z-30 -translate-y-1/2 rounded-full border border-border bg-card p-1.5 text-primary shadow-md transition hover:bg-accent"
          >
            <ChevronRight size={18} />
          </button>
        )}
      <div ref={scrollRef} className="grid-scroll overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full table-fixed border-collapse text-xs" style={{ minWidth: rooms.length * 92 + 56 }}>
          <colgroup>
            <col style={{ width: 56 }} />
            {rooms.map((r) => (
              <col key={r.id} style={{ width: 92 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky right-0 z-20 border-b border-l border-border bg-card p-1 font-medium text-muted-foreground">
                שעה
              </th>
              {rooms.map((r) => (
                <th
                  key={r.id}
                  className={cn(
                    "border-b border-l border-border bg-card p-1.5 font-semibold",
                    roomWeek && "cursor-pointer hover:bg-accent/40"
                  )}
                  title={roomWeek ? `${r.name} — תצוגה שבועית` : r.name}
                  onClick={roomWeek ? () => router.push(`/room/${r.id}?from=${date}&back=${encodeURIComponent(basePath)}`) : undefined}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className={cn("truncate", roomWeek && "underline decoration-dotted underline-offset-2")}>{r.name}</span>
                    {r.hasWindow && <AppWindow size={11} className="shrink-0 text-sky-500" aria-label="חלון" />}
                    {r.hasSink && <Droplets size={11} className="shrink-0 text-cyan-500" aria-label="כיור" />}
                    {r.isLarge && <Maximize2 size={11} className="shrink-0 text-violet-500" aria-label="חדר גדול" />}
                    {r.isGroupRoom && <UsersIcon size={11} className="shrink-0 text-amber-500" aria-label="חדר קבוצות" />}
                    {r.isPool && <Layers size={11} className="shrink-0 text-muted-foreground" aria-label="חדר חיצוני" />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: nSlots }, (_, slot) => (
              <tr key={slot} className={cn(slot === nowSlot && "outline outline-2 -outline-offset-1 outline-primary/60")}>
                <td className="sticky right-0 z-10 border-b border-l border-border bg-card px-1 text-center font-medium text-muted-foreground" dir="ltr">
                  {fmtMin(slotToMin(bounds, slot))}
                </td>
                {rooms.map((r) => {
                  const cell = effectiveCell(r.cells[slot]);
                  const prev = slot > 0 ? effectiveCell(r.cells[slot - 1]) : null;
                  const segStart =
                    cell.type === "occupied" &&
                    (!prev ||
                      prev.type !== "occupied" ||
                      prev.userId !== cell.userId ||
                      prev.second?.userId !== cell.second?.userId);
                  const ghostSegStart =
                    cell.type === "freed" &&
                    cell.inactive &&
                    (!prev || prev.type !== "freed" || prev.userId !== cell.userId);
                  const bookableCell = bookable && (cell.type === "free" || cell.type === "freed");
                  const clickable = (!readOnly && cell.type !== "closed") || bookableCell;
                  return (
                    <td
                      key={r.id}
                      onClick={() => {
                        if (bookableCell) setBookSlot({ room: r, slot });
                        else if (!readOnly && cell.type !== "closed") setSelected({ room: r, slot });
                      }}
                      className={cn(
                        "h-7 border-b border-l border-border/60 p-0 text-center align-middle",
                        cell.type === "closed" && "bg-muted/60",
                        cell.type === "free" && "bg-card",
                        cell.type === "freed" && "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,var(--border)_4px,var(--border)_6px)]",
                        clickable && "cursor-pointer hover:bg-accent/40"
                      )}
                      style={
                        cell.type === "occupied"
                          ? cell.second
                            ? {
                                background: `linear-gradient(135deg, color-mix(in srgb, ${cell.color} 82%, white) 50%, color-mix(in srgb, ${cell.second.color} 82%, white) 50%)`,
                              }
                            : cell.source === "booking"
                              ? {
                                  // one-time booking: fine diagonal overlay so it reads as temporary
                                  ...cellStyle(cell.color, "solid"),
                                  backgroundImage:
                                    "repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 1.5px, transparent 1.5px 5px)",
                                }
                              : cellStyle(cell.color, cell.pattern)
                          : undefined
                      }
                    >
                      {cell.type === "occupied" && segStart && (
                        <span className="block truncate px-1 text-[10px] font-semibold text-white drop-shadow-sm" style={{ color: "white" }}>
                          {cell.name}
                          {cell.second ? ` + ${cell.second.name}` : ""}
                          {cell.kind === "group" ? " · קבוצה" : ""}
                          {!cell.second && cell.source === "booking" ? " ·חד״פ" : ""}
                        </span>
                      )}
                      {ghostSegStart && (
                        <span className="block truncate px-1 text-[10px] text-muted-foreground/70">
                          {cell.name}
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
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><AppWindow size={11} className="text-sky-500" /> חלון</span>
        <span className="flex items-center gap-1"><Droplets size={11} className="text-cyan-500" /> כיור</span>
        <span className="flex items-center gap-1"><Maximize2 size={11} className="text-violet-500" /> גדול</span>
        <span className="flex items-center gap-1"><UsersIcon size={11} className="text-amber-500" /> קבוצות</span>
        <span className="flex items-center gap-1"><Layers size={11} /> חדר חיצוני</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,var(--border)_3px,var(--border)_5px)]" />
          פונה זמנית (היעדרות)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-primary/60 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.5)_0_1px,transparent_1px_4px)]" />
          חד־פעמי
        </span>
      </div>

      {selected && !readOnly && (
        <GridCellSheet
          date={date}
          room={selected.room}
          slot={selected.slot}
          users={users}
          rooms={rooms}
          bounds={bounds}
          onClose={() => setSelected(null)}
        />
      )}

      {bookSlot && bookable && (
        <StaffBookSheet
          date={date}
          roomId={bookSlot.room.id}
          roomName={bookSlot.room.name}
          slot={bookSlot.slot}
          bounds={bounds}
          onClose={() => setBookSlot(null)}
        />
      )}
    </div>
  );
}
