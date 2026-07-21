"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  User,
  Users,
  HeartHandshake,
  ChevronLeft,
  AppWindow,
  Droplets,
  Maximize2,
  Repeat,
  CalendarCheck,
  ArrowLeftRight,
  Sparkles,
  BellPlus,
} from "lucide-react";
import { Button, Card, Input, Label, Badge, Spinner } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { cn } from "@/lib/utils";
import { fmtMin, fmtRange, slotToMin, dowOf, DAY_NAMES, SLOT_MIN, type SlotBounds } from "@/lib/schedule/slots";
import { fmtDateHe } from "@/lib/dates";
import {
  searchBooking,
  confirmBooking,
  confirmRecurring,
  cancelBooking,
  type SearchResult,
  type BookingOption,
} from "@/actions/bookings";
import { createSwapRequest } from "@/actions/swaps";
import { joinWaitlist } from "@/actions/waitlist";

type SessionType = "regular" | "couples" | "group";

export function RequestWizard({
  today,
  activeDays,
  bounds,
}: {
  today: string;
  activeDays: number[];
  bounds: SlotBounds;
}) {
  const nSlots = (bounds.dayEndMin - bounds.dayStartMin) / SLOT_MIN;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);

  const [sessionType, setSessionType] = useState<SessionType>("regular");
  const [recurring, setRecurring] = useState(false);
  const [date, setDate] = useState(today);
  const [wantWindow, setWantWindow] = useState(false);
  const [wantSink, setWantSink] = useState(false);
  const [wantLarge, setWantLarge] = useState(false);

  const [joinedWaitlist, setJoinedWaitlist] = useState(false);
  const [startSlot, setStartSlot] = useState<number | null>(null);
  const [endSlot, setEndSlot] = useState<number | null>(null);

  const [result, setResult] = useState<Exclude<SearchResult, { error: string }> | null>(null);

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && activeDays.includes(dowOf(date));
  const startMin = startSlot != null ? slotToMin(bounds, startSlot) : null;
  const endMin = endSlot != null ? slotToMin(bounds, endSlot + 1) : null;

  function tapSlot(i: number) {
    if (startSlot == null || (startSlot != null && endSlot != null)) {
      setStartSlot(i);
      setEndSlot(null);
    } else if (i < startSlot) {
      setStartSlot(i);
    } else {
      setEndSlot(i);
    }
  }

  function search() {
    if (startMin == null || endMin == null) return;
    startTransition(async () => {
      const res = await searchBooking({
        date,
        startMin,
        endMin,
        sessionType,
        recurring,
        wantWindow: wantWindow || undefined,
        wantSink: wantSink || undefined,
        wantLarge: wantLarge || undefined,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setResult(res);
      setStep(3);
    });
  }

  function book(option: BookingOption) {
    if (startMin == null || endMin == null) return;
    const kind = sessionType === "group" ? ("group" as const) : ("regular" as const);
    startTransition(async () => {
      if (recurring) {
        const res = await confirmRecurring({
          roomId: option.roomId,
          dayOfWeek: dowOf(date),
          startMin,
          endMin,
          effectiveFrom: date,
          kind,
        });
        if ("error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        if ("pending" in res && res.pending) {
          toast.success("הבקשה לשעה קבועה נשלחה לאישור המנהל/ת — תקבל/י התראה כשתאושר");
        } else {
          toast.success(`נקבע שיבוץ קבוע ב${option.roomName} בכל יום ${DAY_NAMES[dowOf(date)]}`);
        }
        router.push("/");
        router.refresh();
      } else {
        const res = await confirmBooking({ date, startMin, endMin, roomId: option.roomId, kind });
        if ("error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        const bookingId = "bookingId" in res ? res.bookingId : null;
        toast.success(`החדר ${option.roomName} נקבע לך!`, {
          action: bookingId
            ? {
                label: "ביטול",
                onClick: async () => {
                  const undo = await cancelBooking(bookingId);
                  if ("error" in undo && undo.error) toast.error(undo.error);
                  else {
                    toast.success("ההזמנה בוטלה");
                    router.refresh();
                  }
                },
              }
            : undefined,
        });
        router.push("/");
        router.refresh();
      }
    });
  }

  function bookAlternative(date_: string, s: number, e: number, roomId: string, roomName: string) {
    const kind = sessionType === "group" ? ("group" as const) : ("regular" as const);
    startTransition(async () => {
      const res = await confirmBooking({ date: date_, startMin: s, endMin: e, roomId, kind });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`נקבע: ${roomName}, ${fmtDateHe(date_)} ${fmtRange(s, e)}`);
      router.push("/");
      router.refresh();
    });
  }

  function requestSwap(c: NonNullable<typeof result>["swapCandidates"][number]) {
    if (startMin == null || endMin == null) return;
    startTransition(async () => {
      const res = await createSwapRequest({
        targetUserId: c.targetUserId,
        date,
        startMin,
        endMin,
        roomId: c.roomId,
        altRoomId: c.altRoomId,
        kind: sessionType === "group" ? "group" : "regular",
        message:
          sessionType === "group"
            ? "אני מתכנן/ת קבוצה בחדר הקבוצות ואשמח להתחלף — החדר שלי יעמוד לרשותך."
            : undefined,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`בקשת החלפה נשלחה ל${c.targetName} — תקבל/י התראה כשתיענה`);
      router.push("/");
      router.refresh();
    });
  }

  function joinWaitlistNow() {
    if (startMin == null || endMin == null) return;
    startTransition(async () => {
      const res = await joinWaitlist({
        date,
        startMin,
        endMin,
        kind: sessionType === "group" ? "group" : "regular",
        wantWindow: wantWindow || undefined,
        wantLarge: sessionType === "couples" || wantLarge || undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setJoinedWaitlist(true);
      toast.success("נוספת לרשימת ההמתנה — נודיע לך ברגע שיתפנה חדר");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">הזמנת חדר</h1>
        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <span key={s} className={cn("h-1.5 w-6 rounded-full", s <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <Card className="space-y-4">
          <div>
            <Label>סוג הטיפול</Label>
            <div className="grid grid-cols-3 gap-2">
              <TypeButton active={sessionType === "regular"} onClick={() => setSessionType("regular")} icon={<User size={18} />} label="רגיל" />
              <TypeButton active={sessionType === "couples"} onClick={() => setSessionType("couples")} icon={<HeartHandshake size={18} />} label="זוגי / משפחתי" />
              <TypeButton active={sessionType === "group"} onClick={() => setSessionType("group")} icon={<Users size={18} />} label="קבוצה" />
            </div>
            {sessionType === "group" && (
              <p className="mt-2 text-xs text-muted-foreground">קבוצות מתקיימות בחדר הקבוצות. אם הוא תפוס — נציע החלפה הוגנת.</p>
            )}
          </div>

          <div>
            <Label>חד־פעמי או קבוע?</Label>
            <div className="grid grid-cols-2 gap-2">
              <TypeButton active={!recurring} onClick={() => setRecurring(false)} icon={<CalendarCheck size={18} />} label="חד־פעמי" />
              <TypeButton active={recurring} onClick={() => setRecurring(true)} icon={<Repeat size={18} />} label="קבוע (שבועי)" />
            </div>
          </div>

          <div>
            <Label>{recurring ? "החל מתאריך (קובע את היום בשבוע)" : "תאריך"}</Label>
            <DateField value={date} min={today} onChange={setDate} aria-label="תאריך" />
            {date && /^\d{4}-\d{2}-\d{2}$/.test(date) && (
              <p className={cn("mt-1 text-xs", dateOk ? "text-muted-foreground" : "text-destructive")}>
                {activeDays.includes(dowOf(date))
                  ? `יום ${DAY_NAMES[dowOf(date)]}`
                  : "המרפאה אינה פעילה ביום זה"}
              </p>
            )}
          </div>

          {sessionType !== "group" && (
            <div>
              <Label>העדפות (לא חובה)</Label>
              <div className="flex flex-wrap gap-2">
                <PrefChip active={wantWindow} onClick={() => setWantWindow(!wantWindow)} icon={<AppWindow size={14} />} label="חדר עם חלון" />
                <PrefChip active={wantSink} onClick={() => setWantSink(!wantSink)} icon={<Droplets size={14} />} label="חדר עם כיור" />
                {sessionType === "regular" && (
                  <PrefChip active={wantLarge} onClick={() => setWantLarge(!wantLarge)} icon={<Maximize2 size={14} />} label="חדר גדול" />
                )}
              </div>
            </div>
          )}

          <Button className="w-full" size="lg" disabled={!dateOk} onClick={() => setStep(2)}>
            המשך לבחירת שעות
            <ChevronLeft size={18} />
          </Button>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <div>
            <h3 className="font-bold">באילו שעות?</h3>
            <p className="text-sm text-muted-foreground">
              {fmtDateHe(date)} · לחצו על שעת התחלה ואז על שעת סיום
            </p>
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {Array.from({ length: nSlots }, (_, i) => {
              const inRange =
                startSlot != null &&
                ((endSlot != null && i >= startSlot && i <= endSlot) || (endSlot == null && i === startSlot));
              return (
                <button
                  key={i}
                  onClick={() => tapSlot(i)}
                  className={cn(
                    "rounded-lg border py-1.5 text-xs font-medium transition-colors",
                    inRange
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-accent/50"
                  )}
                  dir="ltr"
                >
                  {fmtMin(slotToMin(bounds, i))}
                </button>
              );
            })}
          </div>
          {startMin != null && endMin != null && (
            <p className="text-center text-sm font-medium" dir="ltr">
              {fmtRange(startMin, endMin)}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>חזרה</Button>
            <Button className="flex-1" disabled={startSlot == null || endSlot == null || pending} onClick={search}>
              {pending ? <Spinner /> : "חיפוש חדר פנוי"}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {fmtDateHe(date)} · <span dir="ltr">{startMin != null && endMin != null ? fmtRange(startMin, endMin) : ""}</span>
              {recurring ? " · קבוע" : ""}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>שינוי</Button>
          </div>

          {result.recurringNote && (
            <p className="rounded-xl bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
              {result.recurringNote}
            </p>
          )}

          {result.options.length > 0 ? (
            <>
              {result.options.map((o, i) => (
                <Card key={o.roomId} className={cn(i === 0 && "border-primary ring-1 ring-primary/40")}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold">{o.roomName}</p>
                        {i === 0 && (
                          <Badge>
                            <Sparkles size={11} />
                            מומלץ
                          </Badge>
                        )}
                        {o.hasWindow && <AppWindow size={13} className="text-sky-500" />}
                        {o.hasSink && <Droplets size={13} className="text-cyan-500" />}
                        {o.isLarge && <Maximize2 size={13} className="text-violet-500" />}
                      </div>
                      {o.reasons.length > 0 && (
                        <p className="text-xs text-muted-foreground">{o.reasons.join(" · ")}</p>
                      )}
                    </div>
                    <Button onClick={() => book(o)} disabled={pending}>
                      {recurring ? "קביעה קבועה" : "הזמנה"}
                    </Button>
                  </div>
                </Card>
              ))}
            </>
          ) : (
            <>
              <Card className="border-dashed text-center">
                <p className="font-medium">אין חדר פנוי בשעה שביקשת 😕</p>
                <p className="text-sm text-muted-foreground">אבל יש אפשרויות אחרות:</p>
              </Card>

              {result.alternatives.length > 0 && (
                <>
                  <h3 className="mt-2 text-sm font-bold text-muted-foreground">זמנים חלופיים קרובים</h3>
                  {result.alternatives.map((alt, i) => (
                    <Card key={i} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {alt.room.room.name}
                          {alt.room.room.hasWindow && <AppWindow size={12} className="mb-0.5 ms-1 inline text-sky-500" />}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDateHe(alt.date)} · <span dir="ltr">{fmtRange(alt.startMin, alt.endMin)}</span>
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending || recurring}
                        onClick={() => bookAlternative(alt.date, alt.startMin, alt.endMin, alt.room.room.id, alt.room.room.name)}
                      >
                        הזמנה
                      </Button>
                    </Card>
                  ))}
                </>
              )}

              {result.swapCandidates.length > 0 && !recurring && (
                <>
                  <h3 className="mt-2 text-sm font-bold text-muted-foreground">בקשת החלפה</h3>
                  {result.swapCandidates.map((c, i) => (
                    <Card key={i} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {c.roomName} — אצל {c.targetName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {c.altRoomName
                            ? `${c.targetName} יוכל/תוכל לעבור ל${c.altRoomName}`
                            : "ההחלפה תפנה את החדר — בכפוף לאישור"}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => requestSwap(c)}>
                        <ArrowLeftRight size={14} />
                        בקשה
                      </Button>
                    </Card>
                  ))}
                </>
              )}

              {result.alternatives.length === 0 && result.swapCandidates.length === 0 && (
                <Card className="text-center text-sm text-muted-foreground">
                  לא נמצאו גם חלופות קרובות — נסו יום או שעה אחרים, או פנו למנהל/ת.
                </Card>
              )}

              {!recurring && (
                <>
                  <h3 className="mt-2 text-sm font-bold text-muted-foreground">רשימת המתנה</h3>
                  <Card className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">להודיע לי כשמתפנה חדר</p>
                      <p className="text-xs text-muted-foreground">
                        נעדכן אותך אוטומטית (גם בהתראה לטלפון) ברגע שמישהו יפנה חדר מתאים לזמן הזה.
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" disabled={pending || joinedWaitlist} onClick={joinWaitlistNow}>
                      <BellPlus size={14} />
                      {joinedWaitlist ? "ברשימה" : "הוספה"}
                    </Button>
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TypeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-medium transition-colors",
        active ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card hover:bg-muted"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PrefChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card hover:bg-muted"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
