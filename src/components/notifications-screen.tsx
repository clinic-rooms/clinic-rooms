"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  BellOff,
  Check,
  CheckCheck,
  X,
  CalendarCheck,
  ShieldAlert,
  Plane,
  DoorOpen,
} from "lucide-react";
import { Button, Card, Badge, EmptyState } from "@/components/ui";
import { PushSetup } from "@/components/push-setup";
import { fmtRange } from "@/lib/schedule/slots";
import { fmtDateHe, fmtDateShort, fmtTimestampIL } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { respondToSwap } from "@/actions/swaps";
import { respondAssignmentRequest } from "@/actions/assignment-requests";
import { markAllRead, markRead } from "@/actions/notifications";
import { DAY_NAMES } from "@/lib/schedule/slots";

type Item = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
};

type PendingSwap = {
  id: string;
  requesterName: string;
  date: string;
  startMin: number;
  endMin: number;
  roomName: string;
  altRoomName: string | null;
  message: string | null;
  kind: string;
};

type PendingAssignment = {
  id: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  effectiveFrom: string;
  userName: string;
  roomName: string;
};

export function NotificationsScreen({
  items,
  pendingSwaps,
  pendingAssignments = [],
}: {
  items: Item[];
  pendingSwaps: PendingSwap[];
  pendingAssignments?: PendingAssignment[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function respond(swapId: string, accept: boolean) {
    startTransition(async () => {
      const res = await respondToSwap(swapId, accept);
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success(accept ? "ההחלפה אושרה ובוצעה! 🎉" : "הבקשה נדחתה");
        router.refresh();
      }
    });
  }

  function respondAssign(id: string, approve: boolean) {
    startTransition(async () => {
      const res = await respondAssignmentRequest(id, approve);
      if (res.error) toast.error(res.error);
      else {
        toast.success(approve ? "השעה הקבועה אושרה ונוספה ללו״ז" : "הבקשה נדחתה");
        router.refresh();
      }
    });
  }

  const hasUnread = items.some((i) => !i.isRead);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">התראות</h1>
        {hasUnread && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await markAllRead();
                router.refresh();
              })
            }
          >
            <CheckCheck size={15} />
            סימון הכל כנקרא
          </Button>
        )}
      </div>

      <PushSetup />

      {pendingAssignments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground">בקשות לשעה קבועה — ממתינות לאישורך</h2>
          {pendingAssignments.map((a) => (
            <Card key={a.id} className="border-primary/40 ring-1 ring-primary/20">
              <div className="mb-2 flex items-start gap-2">
                <span className="mt-0.5 rounded-full bg-accent p-1.5 text-accent-foreground">
                  <CalendarCheck size={15} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {a.userName} מבקש/ת שעה קבועה ב{a.roomName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    כל יום {DAY_NAMES[a.dayOfWeek]} · <span dir="ltr">{fmtRange(a.startMin, a.endMin)}</span> · החל מ־{fmtDateShort(a.effectiveFrom)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" size="sm" disabled={pending} onClick={() => respondAssign(a.id, true)}>
                  <Check size={15} />
                  אישור
                </Button>
                <Button variant="outline" className="flex-1" size="sm" disabled={pending} onClick={() => respondAssign(a.id, false)}>
                  <X size={15} />
                  דחייה
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {pendingSwaps.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground">בקשות החלפה ממתינות לך</h2>
          {pendingSwaps.map((s) => (
            <Card key={s.id} className="border-primary/40 ring-1 ring-primary/20">
              <div className="mb-2 flex items-start gap-2">
                <span className="mt-0.5 rounded-full bg-accent p-1.5 text-accent-foreground">
                  <ArrowLeftRight size={15} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {s.requesterName} מבקש/ת את {s.roomName}
                    {s.kind === "group" && <Badge className="ms-1">לקבוצה</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDateHe(s.date)} · <span dir="ltr">{fmtRange(s.startMin, s.endMin)}</span>
                  </p>
                  {s.altRoomName && (
                    <p className="mt-1 text-xs">
                      בתמורה תקבל/י את <b>{s.altRoomName}</b> באותן שעות
                    </p>
                  )}
                  {s.message && <p className="mt-1 rounded-lg bg-muted p-2 text-xs">{s.message}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" size="sm" disabled={pending} onClick={() => respond(s.id, true)}>
                  <Check size={15} />
                  אישור ההחלפה
                </Button>
                <Button variant="outline" className="flex-1" size="sm" disabled={pending} onClick={() => respond(s.id, false)}>
                  <X size={15} />
                  דחייה
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && pendingSwaps.length === 0 && (
          <EmptyState icon={<BellOff size={28} />} title="אין התראות" subtitle="כשמשהו יקרה — זה יופיע כאן" />
        )}
        {items.map((n) => (
          <NotificationRow
            key={n.id}
            n={n}
            onRead={() =>
              startTransition(async () => {
                await markRead(n.id);
                router.refresh();
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function NotificationRow({ n, onRead }: { n: Item; onRead: () => void }) {
  const p = n.payload as Record<string, string | boolean | number | undefined>;
  let icon = <CalendarCheck size={15} />;
  let text = "";

  switch (n.type) {
    case "swap_request":
      icon = <ArrowLeftRight size={15} />;
      text = `${p.from ?? ""} שלח/ה בקשת החלפה ל${p.roomName ?? "חדר"} (${p.range ?? ""})`;
      break;
    case "swap_accepted":
      icon = <Check size={15} />;
      text = p.self
        ? `ההחלפה בוצעה — ${p.roomName ?? ""}`
        : `${p.by ?? ""} אישר/ה את ההחלפה! קיבלת את ${p.roomName ?? "החדר"} (${p.range ?? ""})`;
      break;
    case "swap_declined":
      icon = <X size={15} />;
      text = `${p.by ?? ""} דחה/תה את בקשת ההחלפה (${p.range ?? ""})`;
      break;
    case "booking_confirmed":
      icon = <CalendarCheck size={15} />;
      text = p.recurring
        ? `נקבע שיבוץ קבוע: ${p.roomName ?? ""} בכל יום ${p.dayName ?? ""} ${p.range ?? ""}`
        : `הוזמן חדר: ${p.roomName ?? ""}`;
      break;
    case "admin_change":
      icon = <ShieldAlert size={15} />;
      text = String(p.change ?? "עדכון מהניהול");
      if (p.roomName) text += ` · ${p.roomName}`;
      if (p.dayName) text += ` · יום ${p.dayName}`;
      if (p.range) text += ` · ${p.range}`;
      if (p.date) text += ` · ${fmtDateShort(String(p.date))}`;
      break;
    case "vacation_added":
      icon = <Plane size={15} />;
      text = `הניהול הזין עבורך חופשה: ${p.dateFrom ? fmtDateShort(String(p.dateFrom)) : ""}${p.dateTo && p.dateTo !== p.dateFrom ? ` עד ${fmtDateShort(String(p.dateTo))}` : ""}`;
      break;
    case "room_available":
      icon = <DoorOpen size={15} />;
      text = `התפנה חדר שהמתנת לו: ${p.roomName ?? ""} · ${p.range ?? ""} — זמין להזמנה`;
      break;
    default:
      text = "עדכון";
  }

  return (
    <button
      onClick={!n.isRead ? onRead : undefined}
      className={cn(
        "flex w-full items-start gap-2 rounded-2xl border border-border p-3 text-start text-sm",
        n.isRead ? "bg-card opacity-70" : "bg-accent/20"
      )}
    >
      <span className={cn("mt-0.5 rounded-full p-1.5", n.isRead ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground")}>
        {icon}
      </span>
      <span className="flex-1">
        <span className="block">{text}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {fmtTimestampIL(n.createdAt)}
        </span>
      </span>
      {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
    </button>
  );
}
