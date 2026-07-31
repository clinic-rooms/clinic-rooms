"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Copy, Check, Shield, ShieldCheck, Sparkles, RefreshCw, Building2, Plus, Trash2, Download, KeyRound } from "lucide-react";
import { Button, Card, Input, Label, Avatar, Badge, Select } from "@/components/ui";
import { DAY_NAMES, SLOT_MIN, fmtMin, validateDayBounds } from "@/lib/schedule/slots";
import { cn } from "@/lib/utils";
import {
  updateSettings,
  setShareLink,
  setAiEnabled,
  setAnthropicKey,
  setMultiCenter,
  createCenter,
  renameCenter,
  deleteCenter,
} from "@/actions/admin-settings";
import { updateStaffUser } from "@/actions/admin-users";
import { checkForUpdates, triggerUpdate, setGithubToken } from "@/actions/updates";
import { APP_VERSION } from "@/lib/version";

type StaffLite = { id: string; name: string; role: string; color: string; pattern: string };
export type CenterLite = { id: string; name: string; roomCount: number };

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
  multiCenter: initialMultiCenter = false,
  centers = [],
  hasGithubToken = false,
  actionsUrl = null,
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
  multiCenter?: boolean;
  centers?: CenterLite[];
  hasGithubToken?: boolean;
  /** the clinic repo's Actions page for the update workflow (null off-Vercel) */
  actionsUrl?: string | null;
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

      <MultiCenterCard initialEnabled={initialMultiCenter} centers={centers} />

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

      <UpdateCheckCard hasToken={hasGithubToken} actionsUrl={actionsUrl} />
    </div>
  );
}

/** Installed-version display + on-demand update check + one-click update trigger. */
function UpdateCheckCard({ hasToken, actionsUrl }: { hasToken: boolean; actionsUrl: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [check, setCheck] = useState<{ latest: string; updateAvailable: boolean; notes: string[] } | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [triggered, setTriggered] = useState(false);

  function runCheck() {
    startTransition(async () => {
      const res = await checkForUpdates();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setCheck(res);
      if (!res.updateAvailable) toast.success(`אתם בגרסה העדכנית (v${res.latest})`);
    });
  }

  function update() {
    startTransition(async () => {
      const res = await triggerUpdate();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setTriggered(true);
      toast.success("העדכון הופעל");
    });
  }

  function saveToken() {
    startTransition(async () => {
      const res = await setGithubToken(tokenInput);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setTokenInput("");
      toast.success("הטוקן נשמר — מעכשיו אפשר לעדכן בלחיצה אחת");
      router.refresh();
    });
  }

  function removeToken() {
    if (!confirm("להסיר את טוקן ה-GitHub? כפתור \"עדכון עכשיו\" יפסיק לעבוד עד שיוזן טוקן חדש.")) return;
    startTransition(async () => {
      const res = await setGithubToken(null);
      if (res.error) toast.error(res.error);
      else {
        toast.success("הטוקן הוסר");
        router.refresh();
      }
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Download size={16} className="text-primary" />
        <h2 className="font-bold">גרסה ועדכונים</h2>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-muted/50 p-2.5 text-sm">
        <span>
          גרסה מותקנת: <b dir="ltr">v{APP_VERSION}</b>
        </span>
        <Button size="sm" variant="secondary" disabled={pending} onClick={runCheck}>
          <RefreshCw size={14} />
          בדיקת עדכונים
        </Button>
      </div>

      {check && !check.updateAvailable && (
        <p className="rounded-xl bg-accent/20 p-2.5 text-sm">אתם בגרסה העדכנית ✔</p>
      )}

      {check?.updateAvailable && (
        <div className="space-y-2 rounded-xl border-2 border-primary/40 bg-accent/10 p-3">
          <p className="text-sm font-bold" >
            יש גרסה חדשה: <span dir="ltr">v{check.latest}</span>
          </p>
          {check.notes.length > 0 && (
            <ul className="space-y-1 text-sm">
              {check.notes.map((n, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}

          {triggered ? (
            <p className="rounded-xl bg-accent/20 p-2.5 text-sm">
              העדכון הופעל ✔ הגרסה החדשה תעלה תוך כ-2–3 דקות — אין צורך לעשות
              דבר. בכניסה הבאה יופיע מסך "מה חדש".
            </p>
          ) : hasToken ? (
            <Button className="w-full" disabled={pending} onClick={update}>
              <Download size={15} />
              עדכון עכשיו
            </Button>
          ) : actionsUrl ? (
            <div className="space-y-2">
              <a href={actionsUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" className="w-full">
                  הפעלת העדכון ב-GitHub (Run workflow)
                </Button>
              </a>
              <p className="text-xs text-muted-foreground">
                בעמוד שנפתח: <b>Run workflow</b> ← <b>Run workflow</b> (הכפתור הירוק).
                העדכון ממילא יגיע אוטומטית בלילה — הכפתור רק מקדים אותו.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              בהתקנה מקומית מעדכנים עם <span dir="ltr">git pull</span> ופריסה מחדש.
            </p>
          )}
        </div>
      )}

      {actionsUrl && !hasToken && (
        <details className="rounded-xl border border-border p-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
            <KeyRound size={14} className="text-primary" />
            רוצים כפתור "עדכון עכשיו" מתוך המערכת? (הגדרה חד-פעמית, רשות)
          </summary>
          <div className="mt-2 space-y-2 text-xs text-muted-foreground">
            <p>
              כדי שהמערכת תוכל להפעיל את העדכון בעצמה, נדרש "מפתח" (טוקן) מ-GitHub
              עם הרשאה אחת בלבד, על מאגר המרפאה בלבד:
            </p>
            <ol className="list-decimal space-y-1 ps-5">
              <li>
                היכנסו ל-GitHub (חשבון המרפאה) ←{" "}
                <a
                  className="underline"
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  יצירת Fine-grained token
                </a>
              </li>
              <li>Repository access ← Only select repositories ← בחרו את מאגר המרפאה</li>
              <li>Permissions ← Actions ← <b>Read and write</b> (ותו לא)</li>
              <li>Generate token, העתיקו והדביקו כאן:</li>
            </ol>
            <div className="flex gap-2">
              <Input
                dir="ltr"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="github_pat_..."
                className="text-xs"
              />
              <Button size="sm" disabled={pending || !tokenInput.trim()} onClick={saveToken}>
                שמירה
              </Button>
            </div>
            <p>הטוקן נשמר מוצפן ולעולם אינו מוצג. בלעדיו הכול עובד — פשוט דרך GitHub.</p>
          </div>
        </details>
      )}

      {hasToken && (
        <div className="flex items-center justify-between rounded-xl bg-muted/50 p-2.5 text-xs">
          <span>טוקן GitHub לעדכון בלחיצה מוגדר ושמור מוצפן ✔</span>
          <Button size="sm" variant="ghost" disabled={pending} onClick={removeToken}>
            הסרת הטוקן
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Multi-site mode: toggle + centers management. Off = single clinic, no UI changes anywhere. */
function MultiCenterCard({ initialEnabled, centers }: { initialEnabled: boolean; centers: CenterLite[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [newName, setNewName] = useState("");
  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(centers.map((c) => [c.id, c.name]))
  );

  function toggle(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      const res = await setMultiCenter(next);
      if (res.error) {
        toast.error(res.error);
        setEnabled(!next);
        return;
      }
      toast.success(next ? "מצב רב־מרכזי הופעל" : "מצב רב־מרכזי כובה — הלוחות חזרו לתצוגה אחת");
      router.refresh();
    });
  }

  function add() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const res = await createCenter(newName.trim());
      if (res.error) toast.error(res.error);
      else {
        toast.success("המרכז נוסף");
        setNewName("");
        router.refresh();
      }
    });
  }

  function rename(id: string) {
    const name = (names[id] ?? "").trim();
    const original = centers.find((c) => c.id === id)?.name;
    if (!name || name === original) return;
    startTransition(async () => {
      const res = await renameCenter(id, name);
      if (res.error) toast.error(res.error);
      else {
        toast.success("שם המרכז עודכן");
        router.refresh();
      }
    });
  }

  function remove(c: CenterLite) {
    if (!confirm(`למחוק את המרכז «${c.name}»?`)) return;
    startTransition(async () => {
      const res = await deleteCenter(c.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("המרכז נמחק");
        router.refresh();
      }
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Building2 size={16} className="text-primary" />
        <h2 className="font-bold">מרפאה רב־מרכזית</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        למרפאה עם כמה סניפים/מרכזים: כל חדר משויך למרכז, ובלוחות מופיע מעבר נוח בין המרכזים.
        המערכת זוכרת לכל איש צוות את המרכז העיקרי שלו. כשהמצב כבוי — הכל מתנהג כמרפאה אחת רגילה.
      </p>
      <div className="flex items-center justify-between rounded-xl border border-border p-3">
        <span className="text-sm font-medium">{enabled ? "מופעל" : "כבוי"}</span>
        <button
          role="switch"
          aria-checked={enabled}
          disabled={pending}
          onClick={() => toggle(!enabled)}
          className={cn(
            "relative h-6 w-11 rounded-full transition-colors disabled:opacity-50",
            enabled ? "bg-primary" : "bg-muted-foreground/40"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
              enabled ? "left-0.5" : "left-[22px]"
            )}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-2">
          <Label>המרכזים</Label>
          {centers.length === 0 && (
            <p className="text-xs text-muted-foreground">אין מרכזים עדיין — הוסיפו את הראשון למטה.</p>
          )}
          {centers.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <Input
                value={names[c.id] ?? c.name}
                onChange={(e) => setNames({ ...names, [c.id]: e.target.value })}
                onBlur={() => rename(c.id)}
                maxLength={40}
              />
              <Badge className="shrink-0">{c.roomCount} חדרים</Badge>
              <Button
                size="icon"
                variant="ghost"
                disabled={pending}
                onClick={() => remove(c)}
                aria-label={`מחיקת ${c.name}`}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="שם מרכז חדש (למשל: סניף מרכז)"
              maxLength={40}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <Button onClick={add} disabled={pending || !newName.trim()}>
              <Plus size={15} />
              הוספה
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            שיוך חדרים למרכזים נעשה במסך «חדרים». חדר ללא שיוך יופיע בכל המרכזים.
          </p>
        </div>
      )}
    </Card>
  );
}
