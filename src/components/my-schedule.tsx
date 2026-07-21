"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Users, DoorOpen, HelpCircle, LogOut } from "lucide-react";
import { Card, Badge, EmptyState, Button } from "@/components/ui";
import { fmtRange } from "@/lib/schedule/slots";
import { fmtDateHe, fmtDateShort } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { createAbsence, deleteAbsence } from "@/actions/absences";

export type MyDayItem = {
  roomId: string;
  roomName: string;
  startMin: number;
  endMin: number;
  kind: "regular" | "group";
  source: "fixed" | "booking";
  refId: string;
  freed: boolean;
};

export type MyDay = { date: string; items: MyDayItem[] };

export function MySchedule({ days, today }: { days: MyDay[]; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const todayDay = days.find((d) => d.date === today);
  const hasActiveToday = todayDay?.items.some((i) => !i.freed) ?? false;

  function markOutToday() {
    startTransition(async () => {
      const res = await createAbsence({
        dateFrom: today,
        dateTo: today,
        startMin: null,
        endMin: null,
        note: "לא בחדר היום",
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      const id = res.id;
      toast.success("סומנת כלא בחדר היום — החדר שלך פנוי לאחרים", {
        action: id
          ? {
              label: "ביטול",
              onClick: async () => {
                const undo = await deleteAbsence(id);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">הלו״ז שלי</h1>
        <div className="flex items-center gap-1">
          {hasActiveToday && (
            <Button size="sm" variant="outline" onClick={markOutToday} disabled={pending}>
              <LogOut size={15} />
              אני בחוץ היום
            </Button>
          )}
          <Link href="/welcome" title="איך זה עובד?">
            <Button size="icon" variant="ghost" aria-label="הסבר על המערכת">
              <HelpCircle size={18} />
            </Button>
          </Link>
          <Link href="/request">
            <Button size="sm" variant="secondary">
              <CalendarPlus size={15} />
              הזמנת חדר
            </Button>
          </Link>
        </div>
      </div>

      {/* mobile: horizontal snap cards / desktop: grid */}
      <div className="grid-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3">
        {days.map((day) => (
          <Card
            key={day.date}
            className={cn(
              "w-[85vw] max-w-xs shrink-0 snap-center md:w-auto md:max-w-none",
              day.date === today && "border-primary/50 ring-1 ring-primary/30"
            )}
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-bold">{fmtDateHe(day.date)}</h2>
              <span className="text-xs text-muted-foreground">{fmtDateShort(day.date)}</span>
            </div>
            {day.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">אין שיבוצים ביום זה</p>
            ) : (
              <ul className="space-y-2">
                {day.items.map((item, i) => (
                  <li
                    key={`${item.refId}_${item.startMin}_${item.freed}_${i}`}
                    className={cn(
                      "flex items-center justify-between rounded-xl border border-border px-3 py-2",
                      item.freed
                        ? "border-dashed bg-muted text-muted-foreground line-through"
                        : "bg-card"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <DoorOpen size={16} className={item.freed ? "opacity-50" : "text-primary"} />
                      <div>
                        <p className="text-sm font-medium">{item.roomName}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {fmtRange(item.startMin, item.endMin)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {item.kind === "group" && (
                        <Badge>
                          <Users size={11} />
                          קבוצה
                        </Badge>
                      )}
                      {item.source === "booking" && !item.freed && <Badge variant="outline">חד־פעמי</Badge>}
                      {item.freed && <Badge variant="warn">פינית</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      {days.every((d) => d.items.length === 0) && (
        <EmptyState
          title="אין לך שיבוצים השבוע"
          subtitle="אפשר לבקש חדר דרך «הזמנת חדר»"
        />
      )}
    </div>
  );
}
