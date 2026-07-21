"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarOff, Clock3, Pencil, Trash2, Plus, Sparkles, Check, X } from "lucide-react";
import { Button, Card, Input, Label, Select, Badge, EmptyState, Spinner } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { parseAbsenceText, type ParsedEntry } from "@/actions/parse-absence";
import { fmtMin, fmtRange, DAY_NAMES, SLOT_MIN, type SlotBounds } from "@/lib/schedule/slots";
import { fmtDateShort } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  createAbsence,
  updateAbsence,
  deleteAbsence,
} from "@/actions/absences";
import {
  createReduction,
  updateReduction,
  deleteReduction,
} from "@/actions/reductions";

function hoursOf(bounds: SlotBounds): number[] {
  const out: number[] = [];
  for (let m = bounds.dayStartMin; m <= bounds.dayEndMin; m += SLOT_MIN) out.push(m);
  return out;
}

type Absence = {
  id: string;
  dateFrom: string;
  dateTo: string;
  startMin: number | null;
  endMin: number | null;
  note: string | null;
  createdBy: string;
};

type Reduction = {
  id: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  effectiveFrom: string;
  note: string | null;
};

export function AbsencesScreen({
  absences,
  reductions,
  today,
  bounds,
  aiEnabled = true,
}: {
  absences: Absence[];
  reductions: Reduction[];
  today: string;
  bounds: SlotBounds;
  aiEnabled?: boolean;
}) {
  const [tab, setTab] = useState<"oneTime" | "recurring">("oneTime");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">היעדרויות וחופשות</h1>
      <div className="flex gap-2">
        <Button variant={tab === "oneTime" ? "primary" : "outline"} size="sm" onClick={() => setTab("oneTime")}>
          <CalendarOff size={15} />
          חד־פעמי / חופשות
        </Button>
        <Button variant={tab === "recurring" ? "primary" : "outline"} size="sm" onClick={() => setTab("recurring")}>
          <Clock3 size={15} />
          צמצום קבוע
        </Button>
      </div>
      {tab === "oneTime" ? (
        <OneTimeTab absences={absences} today={today} bounds={bounds} />
      ) : (
        <RecurringTab reductions={reductions} today={today} bounds={bounds} />
      )}
      {aiEnabled && (
        <div className="border-t border-border pt-3">
          <QuickTextAdd today={today} />
        </div>
      )}
    </div>
  );
}

// ---------------- free-text quick add ----------------

function QuickTextAdd({ today }: { today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<{ entry: ParsedEntry; summary: string } | null>(null);

  function parse() {
    startTransition(async () => {
      const res = await parseAbsenceText(text);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setParsed(res);
    });
  }

  function confirmParsed() {
    if (!parsed) return;
    const { entry } = parsed;
    startTransition(async () => {
      if (entry.kind === "absence") {
        const res = await createAbsence({
          dateFrom: entry.dateFrom,
          dateTo: entry.dateTo,
          startMin: entry.startMin,
          endMin: entry.endMin,
          note: entry.note,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        const newId = res.id;
        toast.success("ההיעדרות נשמרה", {
          action: newId
            ? {
                label: "ביטול",
                onClick: async () => {
                  const undo = await deleteAbsence(newId);
                  if (undo.error) toast.error(undo.error);
                  else {
                    toast.success("בוטל");
                    router.refresh();
                  }
                },
              }
            : undefined,
        });
      } else {
        const res = await createReduction({
          dayOfWeek: entry.dayOfWeek,
          startMin: entry.startMin,
          endMin: entry.endMin,
          effectiveFrom: entry.effectiveFrom < today ? today : entry.effectiveFrom,
          note: entry.note,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        const newId = res.id;
        toast.success("הצמצום הקבוע נשמר", {
          action: newId
            ? {
                label: "ביטול",
                onClick: async () => {
                  const undo = await deleteReduction(newId);
                  if (undo.error) toast.error(undo.error);
                  else {
                    toast.success("בוטל");
                    router.refresh();
                  }
                },
              }
            : undefined,
        });
      }
      setText("");
      setParsed(null);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 py-2 text-sm text-primary hover:bg-accent/20"
      >
        <Sparkles size={15} />
        או תארו בשפה חופשית ואנחנו נבין
      </button>
    );
  }

  return (
    <Card className="space-y-2 border-primary/30 bg-accent/10">
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-1.5">
          <Sparkles size={15} className="text-primary" />
          כתבו חופשי — ואנחנו נבין
        </span>
        <button onClick={() => { setOpen(false); setParsed(null); }} className="rounded p-0.5 hover:bg-muted" aria-label="סגירה">
          <X size={15} />
        </button>
      </div>
      {!parsed ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            parse();
          }}
          className="flex gap-2"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='למשל: "בחופש מ-3 עד 10 באוגוסט" או "בהדרכה כל יום שני 10:00–11:00"'
            maxLength={400}
          />
          <Button type="submit" disabled={pending || text.trim().length < 3}>
            {pending ? <Spinner /> : "הבנה"}
          </Button>
        </form>
      ) : (
        <div className="space-y-2">
          <p className="rounded-xl bg-card p-2.5 text-sm">
            זיהיתי: <b>{parsed.summary}</b>
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmParsed} disabled={pending}>
              <Check size={15} />
              נכון, לשמור
            </Button>
            <Button size="sm" variant="outline" onClick={() => setParsed(null)} disabled={pending}>
              <X size={15} />
              לא, לנסח מחדש
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------- one-time / vacations ----------------

function OneTimeTab({ absences, today, bounds }: { absences: Absence[]; today: string; bounds: SlotBounds }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Absence | null>(null);
  const [showForm, setShowForm] = useState(false);
  const HOURS = hoursOf(bounds);
  const defaultStart = Math.max(480, bounds.dayStartMin);
  const defaultEnd = Math.min(900, bounds.dayEndMin);

  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [wholeDay, setWholeDay] = useState(true);
  const [startMin, setStartMin] = useState(defaultStart);
  const [endMin, setEndMin] = useState(defaultEnd);
  const [note, setNote] = useState("");

  function openForm(a?: Absence) {
    if (a) {
      setEditing(a);
      setDateFrom(a.dateFrom);
      setDateTo(a.dateTo);
      setWholeDay(a.startMin == null);
      setStartMin(a.startMin ?? defaultStart);
      setEndMin(a.endMin ?? defaultEnd);
      setNote(a.note ?? "");
    } else {
      setEditing(null);
      setDateFrom(today);
      setDateTo(today);
      setWholeDay(true);
      setNote("");
    }
    setShowForm(true);
  }

  function submit() {
    const input = {
      dateFrom,
      dateTo: dateTo < dateFrom ? dateFrom : dateTo,
      startMin: wholeDay ? null : startMin,
      endMin: wholeDay ? null : endMin,
      note: note || undefined,
    };
    startTransition(async () => {
      if (editing) {
        const res = await updateAbsence(editing.id, input);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        setShowForm(false);
        router.refresh();
        toast.success("עודכן");
        return;
      }
      const res = await createAbsence(input);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setShowForm(false);
      router.refresh();
      const newId = res.id;
      toast.success("ההיעדרות נשמרה", {
        action: newId
          ? {
              label: "ביטול",
              onClick: async () => {
                const undo = await deleteAbsence(newId);
                if (undo.error) toast.error(undo.error);
                else {
                  toast.success("בוטל");
                  router.refresh();
                }
              },
            }
          : undefined,
      });
    });
  }

  function remove(a: Absence) {
    startTransition(async () => {
      const res = await deleteAbsence(a.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      toast.success("ההיעדרות נמחקה", {
        action: {
          label: "ביטול",
          onClick: async () => {
            const undo = await createAbsence({
              dateFrom: a.dateFrom,
              dateTo: a.dateTo,
              startMin: a.startMin,
              endMin: a.endMin,
              note: a.note ?? undefined,
            });
            if ("error" in undo && undo.error) toast.error(undo.error);
            else {
              toast.success("שוחזר");
              router.refresh();
            }
          },
        },
      });
    });
  }

  const upcoming = absences.filter((a) => a.dateTo >= today);
  const past = absences.filter((a) => a.dateTo < today);

  return (
    <div className="space-y-3">
      {!showForm && (
        <Button onClick={() => openForm()} className="w-full" variant="secondary">
          <Plus size={16} />
          הוספת היעדרות או חופשה
        </Button>
      )}

      {showForm && (
        <Card className="space-y-3">
          <h3 className="font-bold">{editing ? "עריכת היעדרות" : "היעדרות חדשה"}</h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>מתאריך</Label>
              <DateField value={dateFrom} min={editing ? undefined : today} onChange={setDateFrom} aria-label="מתאריך" />
            </div>
            <div className="flex-1">
              <Label>עד תאריך</Label>
              <DateField value={dateTo} min={dateFrom} onChange={setDateTo} aria-label="עד תאריך" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wholeDay} onChange={(e) => setWholeDay(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            יום שלם (או כל הטווח)
          </label>
          {!wholeDay && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>משעה</Label>
                <Select value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>
                  {HOURS.slice(0, -1).map((m) => (
                    <option key={m} value={m}>{fmtMin(m)}</option>
                  ))}
                </Select>
              </div>
              <div className="flex-1">
                <Label>עד שעה</Label>
                <Select value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>
                  {HOURS.filter((m) => m > startMin).map((m) => (
                    <option key={m} value={m}>{fmtMin(m)}</option>
                  ))}
                </Select>
              </div>
            </div>
          )}
          <div>
            <Label>הערה (לא חובה)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="חופשה, הדרכה, ישיבה, השתלמות…" maxLength={200} />
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending} className="flex-1">
              {editing ? "שמירת שינויים" : "שמירה"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
          </div>
        </Card>
      )}

      {upcoming.length === 0 && !showForm && (
        <EmptyState title="אין היעדרויות מתוכננות" subtitle="החדר שלך ממתין לך 🙂" />
      )}

      {upcoming.map((a) => (
        <AbsenceRow key={a.id} a={a} onEdit={() => openForm(a)} onDelete={() => remove(a)} pending={pending} />
      ))}

      {past.length > 0 && (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer py-1">היעדרויות שעברו ({past.length})</summary>
          <div className="mt-2 space-y-2 opacity-70">
            {past.map((a) => (
              <AbsenceRow key={a.id} a={a} pending readOnly />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function AbsenceRow({
  a,
  onEdit,
  onDelete,
  pending,
  readOnly,
}: {
  a: Absence;
  onEdit?: () => void;
  onDelete?: () => void;
  pending: boolean;
  readOnly?: boolean;
}) {
  const range =
    a.dateFrom === a.dateTo ? fmtDateShort(a.dateFrom) : `${fmtDateShort(a.dateFrom)} – ${fmtDateShort(a.dateTo)}`;
  return (
    <Card className={cn("flex items-center justify-between py-3")}>
      <div>
        <p className="text-sm font-medium">
          {range}
          {a.startMin != null && (
            <span className="text-muted-foreground" dir="ltr"> · {fmtRange(a.startMin, a.endMin!)}</span>
          )}
          {a.startMin == null && <span className="text-muted-foreground"> · יום שלם</span>}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {a.note && <span className="text-xs text-muted-foreground">{a.note}</span>}
          {a.createdBy === "admin" && <Badge variant="outline">הוזן ע״י הניהול</Badge>}
        </div>
      </div>
      {!readOnly && (
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onEdit} disabled={pending} aria-label="עריכה">
            <Pencil size={15} />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} disabled={pending} aria-label="מחיקה">
            <Trash2 size={15} className="text-destructive" />
          </Button>
        </div>
      )}
    </Card>
  );
}

// ---------------- recurring reductions ----------------

function RecurringTab({ reductions, today, bounds }: { reductions: Reduction[]; today: string; bounds: SlotBounds }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Reduction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const HOURS = hoursOf(bounds);
  const defaultStart = Math.max(bounds.dayStartMin, Math.min(840, bounds.dayEndMin - SLOT_MIN));

  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [startMin, setStartMin] = useState(defaultStart);
  const [endMin, setEndMin] = useState(bounds.dayEndMin);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [note, setNote] = useState("");

  function openForm(r?: Reduction) {
    if (r) {
      setEditing(r);
      setDayOfWeek(r.dayOfWeek);
      setStartMin(r.startMin);
      setEndMin(r.endMin);
      setEffectiveFrom(r.effectiveFrom);
      setNote(r.note ?? "");
    } else {
      setEditing(null);
      setDayOfWeek(0);
      setStartMin(defaultStart);
      setEndMin(bounds.dayEndMin);
      setEffectiveFrom(today);
      setNote("");
    }
    setShowForm(true);
  }

  function submit() {
    const input = { dayOfWeek, startMin, endMin, effectiveFrom, note: note || undefined };
    startTransition(async () => {
      if (editing) {
        const res = await updateReduction(editing.id, input);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        setShowForm(false);
        router.refresh();
        toast.success("עודכן");
        return;
      }
      const res = await createReduction(input);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setShowForm(false);
      router.refresh();
      const newId = res.id;
      toast.success("הצמצום הקבוע נשמר", {
        action: newId
          ? {
              label: "ביטול",
              onClick: async () => {
                const undo = await deleteReduction(newId);
                if (undo.error) toast.error(undo.error);
                else {
                  toast.success("בוטל");
                  router.refresh();
                }
              },
            }
          : undefined,
      });
    });
  }

  function remove(r: Reduction) {
    startTransition(async () => {
      const res = await deleteReduction(r.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      toast.success("הצמצום הוסר — החלון חזר ללו״ז שלך", {
        action: {
          label: "ביטול",
          onClick: async () => {
            const undo = await createReduction({
              dayOfWeek: r.dayOfWeek,
              startMin: r.startMin,
              endMin: r.endMin,
              effectiveFrom: r.effectiveFrom,
              note: r.note ?? undefined,
            });
            if ("error" in undo && undo.error) toast.error(undo.error);
            else {
              toast.success("שוחזר");
              router.refresh();
            }
          },
        },
      });
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        למשל: ״אני מסיים ב־14:00 כל יום שני״ — החלון שיתפנה יוצע למטפלים אחרים.
      </p>
      {!showForm && (
        <Button onClick={() => openForm()} className="w-full" variant="secondary">
          <Plus size={16} />
          הוספת צמצום קבוע
        </Button>
      )}

      {showForm && (
        <Card className="space-y-3">
          <h3 className="font-bold">{editing ? "עריכת צמצום" : "צמצום קבוע חדש"}</h3>
          <div>
            <Label>יום בשבוע</Label>
            <Select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {DAY_NAMES.map((name, i) => (
                <option key={i} value={i}>יום {name}</option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>משעה</Label>
              <Select value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>
                {HOURS.slice(0, -1).map((m) => (
                  <option key={m} value={m}>{fmtMin(m)}</option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <Label>עד שעה</Label>
              <Select value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>
                {HOURS.filter((m) => m > startMin).map((m) => (
                  <option key={m} value={m}>{fmtMin(m)}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>החל מתאריך</Label>
            <DateField value={effectiveFrom} onChange={setEffectiveFrom} aria-label="החל מתאריך" />
          </div>
          <div>
            <Label>הערה (לא חובה)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="הדרכה קבועה, ישיבת צוות, יוצא/ת מוקדם…" maxLength={200} />
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending} className="flex-1">
              {editing ? "שמירת שינויים" : "שמירה"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
          </div>
        </Card>
      )}

      {reductions.length === 0 && !showForm && (
        <EmptyState title="אין צמצומים קבועים" subtitle="הלו״ז הקבוע שלך פעיל במלואו" />
      )}

      {reductions.map((r) => (
        <Card key={r.id} className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium">
              יום {DAY_NAMES[r.dayOfWeek]}
              <span className="text-muted-foreground" dir="ltr"> · {fmtRange(r.startMin, r.endMin)}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              החל מ־{fmtDateShort(r.effectiveFrom)}
              {r.note ? ` · ${r.note}` : ""}
            </p>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => openForm(r)} disabled={pending} aria-label="עריכה">
              <Pencil size={15} />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => remove(r)} disabled={pending} aria-label="מחיקה">
              <Trash2 size={15} className="text-destructive" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
