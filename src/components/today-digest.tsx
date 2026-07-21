import Link from "next/link";
import { ArrowLeftRight, DoorOpen, CalendarX2, Coffee } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { fmtDateHe } from "@/lib/dates";

export function TodayDigest({
  firstName,
  today,
  pendingSwaps,
  rooms,
  closure,
  clinicClosedToday,
}: {
  firstName: string;
  today: string;
  pendingSwaps: number;
  rooms: { roomName: string; range: string }[];
  closure: { type: "closed" | "early"; label: string; endLabel: string } | null;
  clinicClosedToday: boolean;
}) {
  return (
    <Card className="space-y-3 border-primary/30 bg-accent/10">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">שלום {firstName}</h2>
        <span className="text-xs text-muted-foreground">{fmtDateHe(today)}</span>
      </div>

      {pendingSwaps > 0 && (
        <Link
          href="/notifications"
          className="flex items-center gap-2 rounded-xl bg-primary/10 p-2.5 text-sm font-medium text-primary hover:bg-primary/15"
        >
          <ArrowLeftRight size={16} />
          {pendingSwaps === 1 ? "בקשת החלפה אחת ממתינה לך" : `${pendingSwaps} בקשות החלפה ממתינות לך`}
          <Badge className="ms-auto">לצפייה</Badge>
        </Link>
      )}

      {closure?.type === "closed" || clinicClosedToday ? (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          <CalendarX2 size={16} />
          {closure?.type === "closed" ? `המרפאה סגורה היום — ${closure.label}` : "המרפאה סגורה היום"}
        </p>
      ) : (
        <>
          {closure?.type === "early" && (
            <p className="flex items-center gap-2 rounded-xl bg-sky-50 p-2.5 text-sm text-sky-900 dark:bg-sky-900/30 dark:text-sky-100">
              <CalendarX2 size={16} />
              {closure.label}: המרפאה עובדת עד {closure.endLabel}
            </p>
          )}
          {rooms.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">החדרים שלך היום:</p>
              <ul className="space-y-1">
                {rooms.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <DoorOpen size={15} className="text-primary" />
                    <span className="font-medium">{r.roomName}</span>
                    <span className="text-muted-foreground" dir="ltr">
                      {r.range}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coffee size={15} />
              אין לך שיבוצים היום.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
