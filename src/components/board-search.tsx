"use client";

import { useMemo, useState } from "react";
import { Search, DoorOpen, User, X } from "lucide-react";
import { Input, Avatar } from "@/components/ui";
import { fmtMin, slotToMin, maskToRanges, maskFor, makeSlotConfig, SLOT_MIN, type SlotBounds } from "@/lib/schedule/slots";
import { nowMinutesIL } from "@/lib/dates";
import type { GridRoom, GridUser } from "@/components/admin-grid";

/** Live "who's where" search over the day's grid. */
export function BoardSearch({
  rooms,
  users,
  isToday,
  bounds,
}: {
  rooms: GridRoom[];
  users: GridUser[];
  isToday: boolean;
  bounds: SlotBounds;
}) {
  const [q, setQ] = useState("");
  const query = q.trim();
  const cfg = useMemo(() => makeSlotConfig(bounds.dayStartMin, bounds.dayEndMin), [bounds]);

  const nowSlot = useMemo(() => {
    const s = Math.floor((nowMinutesIL() - cfg.dayStartMin) / SLOT_MIN);
    return Math.min(Math.max(s, 0), cfg.nSlots - 1);
  }, [cfg]);
  const timeLabel = isToday ? "עכשיו" : `בשעה ${fmtMin(slotToMin(cfg, nowSlot))}`;

  const results = useMemo(() => {
    if (query.length < 1) return null;

    // rooms whose name matches → current occupant
    const roomHits = rooms
      .filter((r) => r.name.includes(query))
      .map((r) => {
        const c = r.cells[nowSlot];
        const occupant =
          c.type === "occupied" ? c.name + (c.second ? ` + ${c.second.name}` : "") : null;
        return { room: r.name, occupant, open: c.type !== "closed" };
      });

    // people whose name matches → current room + today's segments
    const nameHits = users
      .filter((u) => u.name.includes(query))
      .map((u) => {
        let currentRoom: string | null = null;
        let mask = 0;
        for (const r of rooms) {
          for (let slot = 0; slot < cfg.nSlots; slot++) {
            const c = r.cells[slot];
            if (c.type === "occupied" && (c.name === u.name || c.second?.name === u.name)) {
              mask |= maskFor(cfg, slotToMin(cfg, slot), slotToMin(cfg, slot + 1));
              if (slot === nowSlot) currentRoom = r.name;
            }
          }
        }
        const segments = maskToRanges(cfg, mask).map((s) => `${fmtMin(s.startMin)}–${fmtMin(s.endMin)}`);
        return { user: u, currentRoom, segments };
      })
      .filter((h) => h.segments.length > 0 || h.currentRoom || users.length < 40);

    return { roomHits, nameHits };
  }, [query, rooms, users, nowSlot, cfg]);

  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="relative">
        <Search size={15} className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש: שם מטפל/ת או מספר חדר"
          className="ps-3 pe-9"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="absolute top-1/2 left-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="ניקוי"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {results && (
        <div className="mt-2 space-y-1.5">
          {results.roomHits.length === 0 && results.nameHits.length === 0 && (
            <p className="py-1 text-center text-sm text-muted-foreground">לא נמצאו תוצאות</p>
          )}
          {results.roomHits.map((r, i) => (
            <div key={`r${i}`} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm">
              <DoorOpen size={15} className="text-primary" />
              <span className="font-medium">{r.room}</span>
              <span className="text-muted-foreground">
                {!r.open ? "· סגור כעת" : r.occupant ? `· ${r.occupant} (${timeLabel})` : `· פנוי ${timeLabel}`}
              </span>
            </div>
          ))}
          {results.nameHits.map((h, i) => (
            <div key={`n${i}`} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm">
              <Avatar name={h.user.name} color={h.user.color} pattern={h.user.pattern} size={20} />
              <span className="font-medium">{h.user.name}</span>
              <span className="text-muted-foreground">
                {h.currentRoom ? `· בחדר ${h.currentRoom} ${timeLabel}` : `· לא בחדר ${timeLabel}`}
                {h.segments.length > 0 && ` · היום: ${h.segments.join(", ")}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
