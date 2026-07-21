"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, X, Check } from "lucide-react";
import { Card, Button, Badge } from "@/components/ui";
import { fmtRange } from "@/lib/schedule/slots";
import { fmtDateHe } from "@/lib/dates";
import { cancelWaitlist } from "@/actions/waitlist";

type Entry = {
  id: string;
  date: string;
  startMin: number;
  endMin: number;
  kind: string;
  status: string;
};

export function MyWaitlist({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (entries.length === 0) return null;

  function cancel(id: string) {
    startTransition(async () => {
      const res = await cancelWaitlist(id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("הוסר מרשימת ההמתנה");
        router.refresh();
      }
    });
  }

  return (
    <Card className="space-y-2 border-primary/20 bg-accent/5">
      <div className="flex items-center gap-1.5 text-sm font-bold">
        <BellRing size={15} className="text-primary" />
        רשימות ההמתנה שלי
      </div>
      {entries.map((e) => (
        <div key={e.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
          <div>
            <p className="text-sm font-medium">
              {fmtDateHe(e.date)}
              <span className="text-muted-foreground" dir="ltr"> · {fmtRange(e.startMin, e.endMin)}</span>
              {e.kind === "group" && <span className="text-muted-foreground"> · קבוצה</span>}
            </p>
            {e.status === "notified" ? (
              <Badge variant="default" className="mt-0.5">
                <Check size={11} />
                התפנה חדר — מהרו לשריין
              </Badge>
            ) : (
              <p className="text-xs text-muted-foreground">ממתין/ה — נודיע לך כשיתפנה חדר</p>
            )}
          </div>
          <Button size="icon" variant="ghost" onClick={() => cancel(e.id)} disabled={pending} aria-label="הסרה">
            <X size={15} />
          </Button>
        </div>
      ))}
    </Card>
  );
}
