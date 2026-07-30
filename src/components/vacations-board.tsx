"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plane, Trash2, CalendarRange } from "lucide-react";
import { Card, Avatar, Button, EmptyState, Badge } from "@/components/ui";
import { fmtDateShort } from "@/lib/dates";
import { createAbsence, deleteAbsence } from "@/actions/absences";

export type VacationRow = {
  id: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
  note: string | null;
  createdBy: string;
  userName: string;
  color: string;
  pattern: string;
};

/** Admin: all current + upcoming full-day absences in one place. */
export function VacationsBoard({ rows, today }: { rows: VacationRow[]; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const current = rows.filter((r) => r.dateFrom <= today);
  const upcoming = rows.filter((r) => r.dateFrom > today);

  function remove(row: VacationRow) {
    startTransition(async () => {
      const res = await deleteAbsence(row.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`החופשה של ${row.userName} נמחקה`, {
        duration: 8000,
        action: {
          label: "ביטול",
          onClick: () => {
            void createAbsence({
              userId: row.userId,
              dateFrom: row.dateFrom,
              dateTo: row.dateTo,
              startMin: null,
              endMin: null,
              note: row.note ?? undefined,
            }).then((r) => {
              if (r?.error) toast.error(r.error);
              else {
                toast.success("החופשה שוחזרה");
                router.refresh();
              }
            });
          },
        },
      });
      router.refresh();
    });
  }

  function days(row: VacationRow) {
    const from = new Date(row.dateFrom + "T12:00:00");
    const to = new Date(row.dateTo + "T12:00:00");
    return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  }

  function Entry({ row }: { row: VacationRow }) {
    const n = days(row);
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5">
        <Avatar name={row.userName} color={row.color} pattern={row.pattern} size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{row.userName}</p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {row.dateFrom === row.dateTo
              ? fmtDateShort(row.dateFrom)
              : `${fmtDateShort(row.dateFrom)} – ${fmtDateShort(row.dateTo)}`}
          </p>
          {row.note && <p className="truncate text-xs text-muted-foreground">{row.note}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {n > 1 && <Badge>{n} ימים</Badge>}
          {row.createdBy === "admin" && <Badge className="bg-muted text-muted-foreground">הוזן ע״י הניהול</Badge>}
          <Button
            size="icon"
            variant="ghost"
            disabled={pending}
            onClick={() => remove(row)}
            aria-label={`מחיקת החופשה של ${row.userName}`}
          >
            <Trash2 size={15} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Plane size={20} className="text-primary" />
        <h1 className="text-xl font-bold">לוח חופשות והיעדרויות</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        כל ההיעדרויות של ימים מלאים — נוכחיות ועתידיות. פינויים של שעות בודדות מופיעים בלוח היומי בלבד.
        הזנת חופשה חדשה: ממסך «צוות» או מהלוח היומי.
      </p>

      {rows.length === 0 && (
        <EmptyState icon={<CalendarRange size={28} />} title="אין חופשות רשומות" subtitle="כשמישהו יזין חופשה — היא תופיע כאן" />
      )}

      {current.length > 0 && (
        <Card className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground">בחופש עכשיו</h2>
          {current.map((r) => (
            <Entry key={r.id} row={r} />
          ))}
        </Card>
      )}

      {upcoming.length > 0 && (
        <Card className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground">חופשות מתוכננות</h2>
          {upcoming.map((r) => (
            <Entry key={r.id} row={r} />
          ))}
        </Card>
      )}
    </div>
  );
}
