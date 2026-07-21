"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, BellOff } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { savePushSubscription, removePushSubscription } from "@/actions/push";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "unsupported" | "denied" | "on" | "off" | "loading";

export function PushSetup() {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setState("loading");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        toast.error("ההרשאה נדחתה");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await savePushSubscription({ endpoint: json.endpoint, keys: json.keys });
      if (res.error) {
        toast.error(res.error);
        setState("off");
        return;
      }
      setState("on");
      toast.success("התראות הופעלו במכשיר הזה");
    } catch {
      setState("off");
      toast.error("הפעלת ההתראות נכשלה");
    }
  }

  async function disable() {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("ההתראות כובו במכשיר הזה");
    } catch {
      setState("off");
    }
  }

  if (state === "unsupported" || state === "loading") return null;

  if (state === "denied") {
    return (
      <Card className="flex items-start gap-2 border-amber-300 bg-amber-50 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
        <BellOff size={18} className="mt-0.5 shrink-0" />
        <span>ההתראות חסומות בדפדפן. כדי להפעיל, אשרו התראות עבור האתר בהגדרות הדפדפן.</span>
      </Card>
    );
  }

  return (
    <Card className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="rounded-xl bg-accent p-2 text-accent-foreground">
          <BellRing size={17} />
        </span>
        <div>
          <p className="text-sm font-medium">התראות לטלפון</p>
          <p className="text-xs text-muted-foreground">
            {state === "on" ? "פעיל במכשיר הזה" : "קבלו התראה על בקשות החלפה ועדכונים גם כשהאפליקציה סגורה"}
          </p>
        </div>
      </div>
      {state === "on" ? (
        <Button size="sm" variant="outline" onClick={disable}>
          כיבוי
        </Button>
      ) : (
        <Button size="sm" onClick={enable}>
          הפעלה
        </Button>
      )}
    </Card>
  );
}
