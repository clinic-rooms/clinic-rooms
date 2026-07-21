"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Copy, Check, Shield, ShieldCheck, Sparkles, RefreshCw } from "lucide-react";
import { Button, Card, Input, Label, Avatar, Badge, Select } from "@/components/ui";
import { DAY_NAMES, SLOT_MIN, fmtMin, validateDayBounds } from "@/lib/schedule/slots";
import { cn } from "@/lib/utils";
import { updateSettings, setShareLink, setAiEnabled, setAnthropicKey } from "@/actions/admin-settings";
import { updateStaffUser } from "@/actions/admin-users";

type StaffLite = { id: string; name: string; role: string; color: string; pattern: string };

const ALL_TIMES: number[] = [];
for (let m = 0; m <= 24 * 60; m += SLOT_MIN) ALL_TIMES.push(m);

export function SettingsScreen({
  clinicName: initialName,
  activeDays: initialDays,
  shareToken: initialToken,
  dayStartMin: initialStart,
  dayEndMin: initialEnd,
  staff,
  currentUserId,
  aiEnabled: initialAi = true,
  hasApiKey = true,
  keySource = null,
  updateSetupUrl = null,
}: {
  clinicName: string;
  activeDays: number[];
  shareToken: string | null;
  dayStartMin: number;
  dayEndMin: number;
  staff: StaffLite[];
  currentUserId: string;
  aiEnabled?: boolean;
  hasApiKey?: boolean;
  keySource?: "env" | "app" | null;
  updateSetupUrl?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clinicName, setClinicName] = useState(initialName);
  const [activeDays, setActiveDays] = useState<number[]>(initialDays);
  const [dayStartMin, setDayStartMin] = useState(initialStart);
  const [dayEndMin, setDayEndMin] = useState(initialEnd);
  const [shareToken, setShareToken] = useState<string | null>(initialToken);
  const [aiEnabled, setAi] = useState(initialAi);
  const [copied, setCopied] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const boundsErr = validateDayBounds(dayStartMin, dayEndMin);

  function saveApiKey() {
    startTransition(async () => {
      const res = await setAnthropicKey(apiKeyInput);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setApiKeyInput("");
      toast.success("המפתח נשמר — העוזר החכם זמין");
      router.refresh();
    });
  }

  function removeApiKey() {
    if (!confirm("להסיר את מפתח ה-API? פונקציות הבינה יפסיקו לעבוד עד שיוזן מפתח חדש.")) return;
    startTransition(async () => {
      const res = await setAnthropicKey(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("המפתח הוסר");
      router.refresh();
    });
  }

  function toggleAi(next: boolean) {
    setAi(next);
    startTransition(async () => {
      const res = await setAiEnabled(next);
      if (res.error) {
        toast.error(res.error);
        setAi(!next);
        return;
      }
      toast.success(next ? "פונקציות הבינה הופעלו" : "פונקציות הבינה כובו");
      router.refresh();
    });
  }

  const shareUrl = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${shareToken}`
    : null;

  function toggleShare(enabled: boolean) {
    startTransition(async () => {
      const res = await setShareLink(enabled);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setShareToken(res.token ?? null);
      toast.success(enabled ? "קישור השיתוף נוצר" : "השיתוף בוטל");
    });
  }

  function copyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("הקישור הועתק");
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleDay(d: number) {
    setActiveDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  function toggleAdmin(u: StaffLite) {
    const makeAdmin = u.role !== "admin";
    if (
      !confirm(
        makeAdmin
          ? `למנות את ${u.name} כמנהל/ת מערכת?\n\nיקבל/תקבל גישה מלאה: עריכת כל הלוחות, ניהול משתמשים, חדרים והגדרות.`
          : `להסיר הרשאות ניהול מ${u.name}?`
      )
    )
      return;
    startTransition(async () => {
      const res = await updateStaffUser({ userId: u.id, role: makeAdmin ? "admin" : "user" });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(makeAdmin ? `${u.name} מונה/תה לניהול` : `הרשאות הניהול הוסרו מ${u.name}`);
      router.refresh();
    });
  }

  function save() {
    startTransition(async () => {
      let res = await updateSettings({ clinicName, activeDays, dayStartMin, dayEndMin });
      if ("ok" in res && res.ok && res.needsConfirm) {
        const approved = confirm(
          `צמצום שעות הפעילות: ${res.affected} שיבוצים קבועים או חלונות זמינות חורגים מהשעות החדשות ויוצגו חתוכים (הנתונים נשמרים ויחזרו אם תרחיבו שוב).\n\nלהמשיך?`
        );
        if (!approved) return;
        res = await updateSettings({ clinicName, activeDays, dayStartMin, dayEndMin, confirmNarrowing: true });
      }
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("ההגדרות נשמרו");
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">הגדרות המרפאה</h1>
      <Card className="space-y-4">
        <div>
          <Label>שם המרפאה</Label>
          <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} maxLength={40} />
        </div>
        <div>
          <Label>ימי פעילות</Label>
          <div className="grid grid-cols-3 gap-2">
            {DAY_NAMES.map((name, i) => (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                className={cn(
                  "rounded-xl border py-2 text-sm font-medium transition-colors",
                  activeDays.includes(i)
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            הפעלת יום שישי תוסיף אותו לכל הלוחות ולאפשרויות השיבוץ. שבת אינה קיימת במערכת.
          </p>
        </div>
        <div>
          <Label>שעות הפעילות</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={dayStartMin} onChange={(e) => setDayStartMin(Number(e.target.value))}>
                {ALL_TIMES.slice(0, -1).map((m) => (
                  <option key={m} value={m}>{fmtMin(m)}</option>
                ))}
              </Select>
            </div>
            <span className="self-center text-sm text-muted-foreground">עד</span>
            <div className="flex-1">
              <Select value={dayEndMin} onChange={(e) => setDayEndMin(Number(e.target.value))}>
                {ALL_TIMES.filter((m) => m > 0).map((m) => (
                  <option key={m} value={m}>{fmtMin(m)}</option>
                ))}
              </Select>
            </div>
          </div>
          {boundsErr ? (
            <p className="mt-1 text-xs text-destructive">{boundsErr}</p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              עד 15.5 שעות ביום. צמצום השעות מציג שיבוצים חורגים כחתוכים — הנתונים לא נמחקים.
            </p>
          )}
        </div>
        <Button className="w-full" onClick={save} disabled={pending || activeDays.length === 0 || !!boundsErr}>
          שמירת הגדרות
        </Button>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Link2 size={16} className="text-primary" />
          <h2 className="font-bold">קישור לצפייה בלוח</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          קישור ציבורי לצפייה בלוח החדרים במצב קריאה בלבד — בלי צורך בהתחברות ובלי אפשרות עריכה.
          מתעדכן אוטומטית. שתפו רק עם מי שאתם רוצים שיראה את הלוח.
        </p>
        {shareUrl ? (
          <>
            <div className="flex gap-2">
              <Input readOnly value={shareUrl} dir="ltr" className="text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" size="icon" onClick={copyLink} aria-label="העתקה">
                {copied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
              </Button>
            </div>
            <Button variant="outline" onClick={() => toggleShare(false)} disabled={pending}>
              ביטול הקישור
            </Button>
            <p className="text-xs text-muted-foreground">
              ביטול הקישור וייצור קישור חדש יבטל מיד את הגישה לקישור הישן.
            </p>
          </>
        ) : (
          <Button onClick={() => toggleShare(true)} disabled={pending}>
            יצירת קישור שיתוף
          </Button>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Shield size={16} className="text-primary" />
          <h2 className="font-bold">מנהלי מערכת</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          למנהלים יש גישה מלאה: עריכת הלוחות, ניהול צוות, חדרים והגדרות. אפשר למנות כמה מנהלים.
        </p>
        <div className="space-y-1.5">
          {staff.map((u) => {
            const isAdmin = u.role === "admin";
            const isSelf = u.id === currentUserId;
            return (
              <div key={u.id} className="flex items-center justify-between rounded-xl border border-border p-2">
                <div className="flex items-center gap-2">
                  <Avatar name={u.name} color={u.color} pattern={u.pattern} size={28} />
                  <span className="text-sm font-medium">{u.name}</span>
                  {isAdmin && (
                    <Badge>
                      <ShieldCheck size={11} />
                      ניהול
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={isAdmin ? "outline" : "secondary"}
                  disabled={pending || (isSelf && isAdmin)}
                  onClick={() => toggleAdmin(u)}
                  title={isSelf && isAdmin ? "אי אפשר להסיר ניהול מעצמך" : undefined}
                >
                  {isAdmin ? "הסרת ניהול" : "מינוי כמנהל"}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-1.5">
          <Sparkles size={16} className="text-primary" />
          <h2 className="font-bold">בינה מלאכותית (קלוד)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          מפעיל/מכבה את כל פונקציות הבינה: העוזר החכם של הניהול והבנת היעדרות בשפה חופשית.
          בכיבוי, כל שאר המערכת ממשיכה לעבוד כרגיל — פשוט בלי הפונקציות שמערבות את קלוד.
        </p>
        <p className="text-xs text-muted-foreground">
          💰 השימוש בתשלום לפי צריכה, אך מזערי: ‎~0.2–0.5 ₪ לשאלה לעוזר, שקלים
          בודדים בחודש טיפוסי. מומלץ להגדיר תקרת הוצאה ב-Billing של Anthropic.
        </p>
        {!hasApiKey ? (
          <div className="space-y-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-900/30">
            <p className="text-xs text-amber-900 dark:text-amber-100">
              כדי להפעיל את העוזר החכם צריך מפתח API של Anthropic: פתחו חשבון ב-
              <span dir="ltr">console.anthropic.com</span>, הוסיפו אמצעי תשלום (Billing),
              צרו מפתח ב-API Keys והדביקו אותו כאן. המפתח נשמר מוצפן.
            </p>
            <div className="flex gap-2">
              <Input
                dir="ltr"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                className="text-xs"
              />
              <Button size="sm" disabled={pending || !apiKeyInput.trim().startsWith("sk-ant-")} onClick={saveApiKey}>
                שמירה
              </Button>
            </div>
          </div>
        ) : keySource === "app" ? (
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-2.5 text-xs">
            <span>מפתח API מוגדר ושמור מוצפן ✔</span>
            <Button size="sm" variant="ghost" disabled={pending} onClick={removeApiKey}>
              הסרת המפתח
            </Button>
          </div>
        ) : (
          <p className="rounded-xl bg-muted/50 p-2.5 text-xs text-muted-foreground">
            מפתח API מוגדר בהגדרות הסביבה של השרת (Vercel) ✔
          </p>
        )}
        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <span className="text-sm font-medium">{aiEnabled ? "מופעל" : "כבוי"}</span>
          <button
            role="switch"
            aria-checked={aiEnabled}
            disabled={pending}
            onClick={() => toggleAi(!aiEnabled)}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors disabled:opacity-50",
              aiEnabled ? "bg-primary" : "bg-muted-foreground/40"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                aiEnabled ? "left-0.5" : "left-[22px]"
              )}
            />
          </button>
        </div>
      </Card>

      {updateSetupUrl && (
        <Card className="space-y-3">
          <div className="flex items-center gap-1.5">
            <RefreshCw size={16} className="text-primary" />
            <h2 className="font-bold">עדכונים אוטומטיים</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            כדי שהמערכת תקבל שיפורים ותיקונים אוטומטית (כל לילה, כשהמרפאה
            סגורה) — נדרשת הפעלה חד-פעמית של שתי לחיצות:
          </p>
          <ol className="list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
            <li>לחצו על הכפתור — ייפתח GitHub עם קובץ העדכון מוכן מראש.</li>
            <li>גללו למטה ולחצו על הכפתור הירוק <b>Commit changes</b> (פעמיים אם נשאלתם).</li>
          </ol>
          <a href={updateSetupUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" className="w-full">
              <RefreshCw size={15} />
              הפעלת עדכונים אוטומטיים ב-GitHub
            </Button>
          </a>
          <p className="text-xs text-muted-foreground">
            אם כבר הפעלתם בעבר (הקובץ קיים) — GitHub פשוט יציג את הקובץ הקיים ואין מה לעשות.
            אחרי עדכון, כל משתמש יראה פעם אחת מסך "מה חדש". הנתונים שלכם לעולם אינם חלק מהעדכון.
          </p>
        </Card>
      )}
    </div>
  );
}
