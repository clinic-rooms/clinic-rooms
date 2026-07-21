"use client";

import { useState } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { createFirstAdmin } from "@/actions/init";

/** First screen of a fresh Deploy-Button install: create the admin account. */
export function InitForm() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("הסיסמה חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (password !== confirm) {
      toast.error("הסיסמאות אינן זהות");
      return;
    }
    setLoading(true);
    // on success the action itself redirects to /login — no client navigation
    const res = await createFirstAdmin({ name: name.trim(), username: username.trim(), password });
    if (res && "error" in res && res.error) {
      setLoading(false);
      toast.error(res.error);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles size={26} />
          </div>
          <h1 className="text-xl font-bold">ברוכים הבאים! 🎉</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            המערכת הותקנה בהצלחה. נשאר רק ליצור את חשבון הניהול הראשון —
            ואחריו ייפתח אשף הגדרה קצר (שם המרפאה, ימים, שעות, חדרים וצוות).
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">השם המלא שלך (יוצג בלוחות)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
          </div>
          <div>
            <Label htmlFor="username">שם משתמש להתחברות (אנגלית קטנה)</Label>
            <Input id="username" dir="ltr" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={30} required />
          </div>
          <div>
            <Label htmlFor="password">סיסמה (לפחות 8 תווים)</Label>
            <Input id="password" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="confirm">אימות סיסמה</Label>
            <Input id="confirm" type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <span><b>שמרו את הסיסמה!</b> היא לא נשמרת בשום מקום אחר ואין דרך לשחזר אותה בלי מנהל נוסף.</span>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading || name.trim().length < 2 || username.trim().length < 2}>
            {loading ? <Spinner /> : "יצירת חשבון הניהול"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
