"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AppWindow,
  Droplets,
  Maximize2,
  Users,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Power,
} from "lucide-react";
import { Button, Card, Input, Label, Select, Badge } from "@/components/ui";
import { fmtMin, DAY_NAMES, SLOT_MIN, type SlotBounds } from "@/lib/schedule/slots";
import { cn } from "@/lib/utils";
import { upsertRoom, setAvailabilityWindows, setRoomActive } from "@/actions/admin-rooms";

function hoursOf(bounds: SlotBounds): number[] {
  const out: number[] = [];
  for (let m = bounds.dayStartMin; m <= bounds.dayEndMin; m += SLOT_MIN) out.push(m);
  return out;
}

type Window = {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

type RoomRow = {
  id: string;
  name: string;
  isPool: boolean;
  isGroupRoom: boolean;
  hasWindow: boolean;
  hasSink: boolean;
  isLarge: boolean;
  notes: string | null;
  isActive: boolean;
  windows: Window[];
};

export function RoomsScreen({
  rooms,
  today,
  bounds,
  activeDays,
}: {
  rooms: RoomRow[];
  today: string;
  bounds: SlotBounds;
  activeDays: number[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<RoomRow | "new" | null>(null);

  function toggleActive(room: RoomRow) {
    startTransition(async () => {
      const res = await setRoomActive(room.id, !room.isActive);
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success(room.isActive ? "החדר הושבת" : "החדר הופעל");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ניהול חדרים</h1>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus size={15} />
          חדר חדש
        </Button>
      </div>

      {editing && (
        <RoomForm
          room={editing === "new" ? null : editing}
          today={today}
          bounds={bounds}
          activeDays={activeDays}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {rooms.map((room) => (
          <Card key={room.id} className={cn(!room.isActive && "opacity-50")}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold">{room.name}</h3>
                  {room.hasWindow && <AppWindow size={14} className="text-sky-500" />}
                  {room.hasSink && <Droplets size={14} className="text-cyan-500" />}
                  {room.isLarge && <Maximize2 size={14} className="text-violet-500" />}
                  {room.isGroupRoom && <Users size={14} className="text-amber-500" />}
                  {room.isPool && <Layers size={14} className="text-muted-foreground" />}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {room.isGroupRoom && <Badge>חדר קבוצות</Badge>}
                  {room.isPool && <Badge variant="outline">חדר חיצוני</Badge>}
                  {!room.isActive && <Badge variant="warn">מושבת</Badge>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(room)} aria-label="עריכה">
                  <Pencil size={15} />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => toggleActive(room)} disabled={pending} aria-label="הפעלה/השבתה">
                  <Power size={15} className={room.isActive ? "text-destructive" : "text-primary"} />
                </Button>
              </div>
            </div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {room.windows.length === 0 && <li>אין חלונות זמינות — החדר לא יופיע בלוח</li>}
              {room.windows.map((w, i) => (
                <li key={i}>
                  יום {DAY_NAMES[w.dayOfWeek]} · <span dir="ltr">{fmtMin(w.startMin)}–{fmtMin(w.endMin)}</span>
                  {w.effectiveTo ? ` (עד ${w.effectiveTo})` : ""}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

function RoomForm({
  room,
  today,
  bounds,
  activeDays,
  onClose,
}: {
  room: RoomRow | null;
  today: string;
  bounds: SlotBounds;
  activeDays: number[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const HOURS = hoursOf(bounds);

  const [name, setName] = useState(room?.name ?? "");
  const [hasWindow, setHasWindow] = useState(room?.hasWindow ?? false);
  const [hasSink, setHasSink] = useState(room?.hasSink ?? false);
  const [isLarge, setIsLarge] = useState(room?.isLarge ?? false);
  const [isGroupRoom, setIsGroupRoom] = useState(room?.isGroupRoom ?? false);
  const [isPool, setIsPool] = useState(room?.isPool ?? false);
  const [notes, setNotes] = useState(room?.notes ?? "");
  const [windows, setWindows] = useState<Window[]>(
    room?.windows ??
      activeDays.map((d) => ({
        dayOfWeek: d,
        startMin: bounds.dayStartMin,
        endMin: bounds.dayEndMin,
        effectiveFrom: null,
        effectiveTo: null,
      }))
  );

  function addWindow() {
    setWindows([
      ...windows,
      {
        dayOfWeek: activeDays[0] ?? 0,
        startMin: bounds.dayStartMin,
        endMin: bounds.dayEndMin,
        effectiveFrom: null,
        effectiveTo: null,
      },
    ]);
  }

  function save() {
    startTransition(async () => {
      const res = await upsertRoom({
        id: room?.id,
        name,
        hasWindow,
        hasSink,
        isLarge,
        isGroupRoom,
        isPool,
        notes: notes || undefined,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      const roomId = "roomId" in res ? res.roomId! : room!.id;
      const res2 = await setAvailabilityWindows({ roomId, windows });
      if ("error" in res2 && res2.error) {
        toast.error(res2.error);
        return;
      }
      toast.success("החדר נשמר");
      onClose();
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3 border-primary/40">
      <h3 className="font-bold">{room ? `עריכת ${room.name}` : "חדר חדש"}</h3>
      <div>
        <Label>שם החדר</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="למשל: חדר 8, חדר חיצוני…" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CheckRow label="חדר עם חלון" checked={hasWindow} onChange={setHasWindow} />
        <CheckRow label="חדר עם כיור" checked={hasSink} onChange={setHasSink} />
        <CheckRow label="חדר גדול (זוגי/משפחתי)" checked={isLarge} onChange={setIsLarge} />
        <CheckRow label="חדר קבוצות" checked={isGroupRoom} onChange={setIsGroupRoom} />
        <CheckRow label="חדר חיצוני" checked={isPool} onChange={setIsPool} />
      </div>
      <div>
        <Label>הערות</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label className="mb-0">חלונות זמינות (מתי החדר קיים)</Label>
          <Button size="sm" variant="ghost" onClick={addWindow}>
            <Plus size={14} />
            הוספה
          </Button>
        </div>
        <div className="space-y-2">
          {windows.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border p-2">
              <Select
                className="h-8 w-24 text-xs"
                value={w.dayOfWeek}
                onChange={(e) => {
                  const next = [...windows];
                  next[i] = { ...w, dayOfWeek: Number(e.target.value) };
                  setWindows(next);
                }}
              >
                {DAY_NAMES.map((n, d) => (
                  <option key={d} value={d}>{n}</option>
                ))}
              </Select>
              <Select
                className="h-8 w-20 text-xs"
                value={w.startMin}
                onChange={(e) => {
                  const next = [...windows];
                  next[i] = { ...w, startMin: Number(e.target.value) };
                  setWindows(next);
                }}
              >
                {HOURS.slice(0, -1).map((m) => (
                  <option key={m} value={m}>{fmtMin(m)}</option>
                ))}
              </Select>
              <span className="text-xs text-muted-foreground">עד</span>
              <Select
                className="h-8 w-20 text-xs"
                value={w.endMin}
                onChange={(e) => {
                  const next = [...windows];
                  next[i] = { ...w, endMin: Number(e.target.value) };
                  setWindows(next);
                }}
              >
                {HOURS.filter((m) => m > w.startMin).map((m) => (
                  <option key={m} value={m}>{fmtMin(m)}</option>
                ))}
              </Select>
              <Input
                type="date"
                className="h-8 w-32 text-xs"
                title="בתוקף עד (לא חובה)"
                value={w.effectiveTo ?? ""}
                min={today}
                onChange={(e) => {
                  const next = [...windows];
                  next[i] = { ...w, effectiveTo: e.target.value || null };
                  setWindows(next);
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setWindows(windows.filter((_, j) => j !== i))}
                aria-label="מחיקת חלון"
              >
                <Trash2 size={13} className="text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          לחדר שקיים רק בחלק מהזמנים (למשל חדר חיצוני בבוקרי רביעי) — השאירו רק את החלונות הרלוונטיים. שדה התאריך מגביל תוקף.
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={save} disabled={pending || !name.trim()} className="flex-1">
          שמירה
        </Button>
        <Button variant="outline" onClick={onClose}>ביטול</Button>
      </div>
    </Card>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-border p-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}
