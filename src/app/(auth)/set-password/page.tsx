"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, KeyRound } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { clearMustSetPassword } from "@/actions/account";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { toast } from "sonner";

export default function SetPasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("הסיסמה החדשה חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (next !== confirm) {
      toast.error("הסיסמאות אינן זהות");
      return;
    }
    setLoading(true);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    if (error) {
      setLoading(false);
      toast.error("הסיסמה הזמנית שגויה");
      return;
    }
    await clearMustSetPassword();
    setLoading(false);
    toast.success("הסיסמה נקבעה בהצלחה!");
    // first login → show the how-to-use instructions
    router.push("/welcome");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <KeyRound size={22} />
        </div>
        <h1 className="mb-1 text-xl font-bold">קביעת סיסמה אישית</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          זו הכניסה הראשונה שלך — יש לבחור סיסמה חדשה שרק את/ה מכיר/ה.
        </p>
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <span>
            <b>חשוב לשמור ולזכור את הסיסמה!</b> תזדקק/י לה בכל כניסה למערכת. שמרו אותה במקום בטוח —
            אם תישכח, יש לפנות למנהל/ת המרפאה לאיפוס.
          </span>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="current">הסיסמה הזמנית שקיבלת</Label>
            <Input id="current" type="password" dir="ltr" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="next">סיסמה חדשה (לפחות 8 תווים)</Label>
            <Input id="next" type="password" dir="ltr" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="confirm">אימות סיסמה חדשה</Label>
            <Input id="confirm" type="password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Spinner /> : "שמירת סיסמה"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
