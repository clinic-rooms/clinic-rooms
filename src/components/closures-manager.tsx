"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarX2, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Label, Select, Badge } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { fmtMin, SLOT_MIN, type SlotBounds } from "@/lib/schedule/slots";
import { fmtDateHe } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { upsertClosure, deleteClosure, type ClosureRow } from "@/actions/admin-closures";

function hoursOf(bounds: SlotBounds): number[] {
  const out: number[] = [];
  for (let m = bounds.dayStartMin; m <= bounds.dayEndMin; m += SLOT_MIN) out.push(m);
  return out;
}

export function ClosuresManager({
  closures,
  today,
  bounds,
}: {
  closures: ClosureRow[];
  today: string;
  bounds: SlotBounds;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const earlyDefault = Math.max(bounds.dayStartMin + SLOT_MIN, Math.min(780, bounds.dayEndMin));

  function setType(row: ClosureRow, type: "closed" | "early" | "open") {
    startTransition(async () => {
      const res = await upsertClosure({ date: row.date, type, endMin: type === "early" ? earlyDefault : undefined, label: row.label });
      if (res.error) toast.error(res.error);
      else {
        toast.success("עודכן");
        router.refresh();
      }
    });
  }

  function revert(row: ClosureRow) {
    startTransition(async () => {
      const res = await deleteClosure(row.date);
      if (res.error) toast.error(res.error);
      else {
        toast.success("חזר לברירת המחדל");
        router.refresh();
      }
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CalendarX2 size={16} className="text-primary" />
          <h2 className="font-bold">ימי חג וסגירה</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={15} />
          הוספה ידנית
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        המערכת מזהה אוטומטית את חגי ישראל: חג שאסור בו בעבודה סוגר את היום, ערב חג עובד עד 13:00.
        אפשר לשנות כל יום או להוסיף סגירה ידנית (יום גשר, אירוע צוות).
      </p>

      {showAdd && <ManualAdd today={today} bounds={bounds} onDone={() => setShowAdd(false)} />}

      <div className="space-y-1.5">
        {closures.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">אין ימי סגירה קרובים</p>
        )}
        {closures.map((row) => (
          <div key={row.date} className="rounded-xl border border-border p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground">{fmtDateHe(row.date, { year: "numeric" })}</p>
              </div>
              {row.source === "override" && (
                <button
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                  title="חזרה לזיהוי האוטומטי"
                  onClick={() => revert(row)}
                  disabled={pending}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              <StatusBtn active={row.type === "closed"} onClick={() => setType(row, "closed")} disabled={pending}>
                סגור כל היום
              </StatusBtn>
              <StatusBtn active={row.type === "early"} onClick={() => setType(row, "early")} disabled={pending}>
                עד 13:00
              </StatusBtn>
              <StatusBtn active={row.type === "open"} onClick={() => setType(row, "open")} disabled={pending}>
                עובדים כרגיל
              </StatusBtn>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatusBtn({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function ManualAdd({ today, bounds, onDone }: { today: string; bounds: SlotBounds; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const HOURS = hoursOf(bounds);
  const [date, setDate] = useState(today);
  const [type, setType] = useState<"closed" | "early">("closed");
  const [endMin, setEndMin] = useState(Math.max(bounds.dayStartMin + SLOT_MIN, Math.min(780, bounds.dayEndMin)));
  const [label, setLabel] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await upsertClosure({ date, type, endMin, label: label || undefined });
      if (res.error) toast.error(res.error);
      else {
        toast.success("נוסף");
        onDone();
        router.refresh();
      }
    });
  }

  return (
    <Card className="space-y-3 border-primary/40 bg-accent/10">
      <div className="flex gap-2">
        <div className="flex-1">
          <Label>תאריך</Label>
          <DateField value={date} min={today} onChange={setDate} aria-label="תאריך" />
        </div>
        <div className="flex-1">
          <Label>סוג</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as "closed" | "early")}>
            <option value="closed">סגור כל היום</option>
            <option value="early">סגירה מוקדמת</option>
          </Select>
        </div>
      </div>
      {type === "early" && (
        <div>
          <Label>סגירה בשעה</Label>
          <Select value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>
            {HOURS.map((m) => (
              <option key={m} value={m}>
                {fmtMin(m)}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div>
        <Label>שם (לא חובה)</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="יום גשר, אירוע צוות…" />
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending} className="flex-1">
          שמירה
        </Button>
        <Button variant="outline" onClick={onDone}>
          ביטול
        </Button>
      </div>
    </Card>
  );
}
