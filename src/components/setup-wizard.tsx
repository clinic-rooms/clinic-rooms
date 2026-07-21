"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  HeartHandshake,
  Building2,
  CalendarDays,
  Clock,
  DoorOpen,
  Users,
  UserCog,
  PartyPopper,
  Plus,
  ChevronLeft,
  AppWindow,
  Maximize2,
  Droplets,
  Layers,
} from "lucide-react";
import { Button, Card, Input, Label, Select, Badge, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { DAY_NAMES, SLOT_MIN, fmtMin, validateDayBounds } from "@/lib/schedule/slots";
import { updateSettings } from "@/actions/admin-settings";
import { upsertRoom, setAvailabilityWindows } from "@/actions/admin-rooms";
import { createStaffUser, updateStaffUser } from "@/actions/admin-users";
import { completeSetup } from "@/actions/setup";
import { authClient } from "@/lib/auth/client";

const ALL_TIMES: number[] = [];
for (let m = 0; m <= 24 * 60; m += SLOT_MIN) ALL_TIMES.push(m);

const STEPS = [
  { icon: HeartHandshake, title: "לפני שמתחילים" },
  { icon: Building2, title: "שם המרפאה" },
  { icon: CalendarDays, title: "ימי פעילות" },
  { icon: Clock, title: "שעות פעילות" },
  { icon: DoorOpen, title: "חדרים" },
  { icon: Users, title: "אנשי צוות" },
  { icon: UserCog, title: "החשבון שלך" },
  { icon: PartyPopper, title: "סיום" },
] as const;

type AddedRoom = { name: string; hasWindow: boolean; hasSink: boolean; isLarge: boolean; isGroupRoom: boolean; isPool: boolean };
type AddedStaff = { name: string; username: string; tempPassword: string };

export function SetupWizard({
  initial,
  admin,
}: {
  initial: { clinicName: string; activeDays: number[]; dayStartMin: number; dayEndMin: number };
  admin: { id: string; name: string; username: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [agreed, setAgreed] = useState(false);

  // basics
  const [clinicName, setClinicName] = useState(initial.clinicName === "המרפאה" ? "" : initial.clinicName);
  const [activeDays, setActiveDays] = useState<number[]>(initial.activeDays);
  const [dayStartMin, setDayStartMin] = useState(initial.dayStartMin);
  const [dayEndMin, setDayEndMin] = useState(initial.dayEndMin);
  const boundsErr = validateDayBounds(dayStartMin, dayEndMin);

  // rooms
  const [rooms, setRooms] = useState<AddedRoom[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomWindow, setRoomWindow] = useState(false);
  const [roomSink, setRoomSink] = useState(false);
  const [roomLarge, setRoomLarge] = useState(false);
  const [roomGroup, setRoomGroup] = useState(false);
  const [roomExternal, setRoomExternal] = useState(false);

  // staff
  const [staff, setStaff] = useState<AddedStaff[]>([]);
  const [staffName, setStaffName] = useState("");
  const [staffUsername, setStaffUsername] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffTier, setStaffTier] = useState<"staff" | "intern" | "student">("staff");

  // admin account
  const [adminName, setAdminName] = useState(admin.name);
  const [adminUsername, setAdminUsername] = useState(admin.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  function toggleDay(d: number) {
    setActiveDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  /** Steps 0–2 all persist through the same settings action. */
  function saveBasicsAnd(next: number) {
    startTransition(async () => {
      const res = await updateSettings({
        clinicName: clinicName.trim(),
        activeDays,
        dayStartMin,
        dayEndMin,
        confirmNarrowing: true, // fresh install — nothing to clip yet
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setStep(next);
    });
  }

  function addRoom() {
    const name = roomName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await upsertRoom({
        name,
        hasWindow: roomWindow,
        hasSink: roomSink,
        isLarge: roomLarge,
        isGroupRoom: roomGroup,
        isPool: roomExternal,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      // open the new room on every active day, across the full clinic day
      if ("roomId" in res && res.roomId) {
        await setAvailabilityWindows({
          roomId: res.roomId,
          windows: activeDays.map((d) => ({
            dayOfWeek: d,
            startMin: dayStartMin,
            endMin: dayEndMin,
            effectiveFrom: null,
            effectiveTo: null,
          })),
        });
      }
      setRooms((prev) => [...prev, { name, hasWindow: roomWindow, hasSink: roomSink, isLarge: roomLarge, isGroupRoom: roomGroup, isPool: roomExternal }]);
      setRoomName("");
      setRoomWindow(false);
      setRoomSink(false);
      setRoomLarge(false);
      setRoomGroup(false);
      setRoomExternal(false);
      toast.success(`${name} נוסף`);
    });
  }

  function addStaff() {
    const name = staffName.trim();
    const username = staffUsername.trim().toLowerCase();
    if (!name || !username || staffPassword.length < 8) {
      toast.error("יש למלא שם, שם משתמש וסיסמה זמנית (לפחות 8 תווים)");
      return;
    }
    startTransition(async () => {
      const res = await createStaffUser({
        name,
        username,
        tempPassword: staffPassword,
        role: "user",
        tier: staffTier,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setStaff((prev) => [...prev, { name, username, tempPassword: staffPassword }]);
      setStaffName("");
      setStaffUsername("");
      setStaffPassword("");
      toast.success(`${name} נוסף/ה לצוות`);
    });
  }

  function saveAdminAnd(next: number) {
    startTransition(async () => {
      const name = adminName.trim();
      const username = adminUsername.trim().toLowerCase();
      if (name !== admin.name || username !== admin.username) {
        const res = await updateStaffUser({ userId: admin.id, name, username });
        if (res.error) {
          toast.error(res.error);
          return;
        }
      }
      if (newPassword) {
        if (newPassword.length < 8) {
          toast.error("סיסמה חדשה — לפחות 8 תווים");
          return;
        }
        const { error } = await authClient.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        });
        if (error) {
          toast.error("הסיסמה הנוכחית שגויה");
          return;
        }
      }
      setStep(next);
    });
  }

  function finish() {
    startTransition(async () => {
      const res = await completeSetup();
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("המערכת מוכנה לעבודה! 🎉");
      router.push("/admin");
      router.refresh();
    });
  }

  const StepIcon = STEPS[step].icon;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col p-4">
      {/* progress */}
      <div className="mb-4 mt-2 flex items-center justify-center gap-1.5">
        {STEPS.map((s, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === step ? "w-6 bg-primary" : i < step ? "w-3 bg-primary/50" : "w-3 bg-muted"
            )}
          />
        ))}
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <StepIcon size={20} />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">
              שלב {step + 1} מתוך {STEPS.length}
            </p>
            <h1 className="font-bold">{STEPS[step].title}</h1>
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm">
              ברוכים הבאים! לפני שנגדיר יחד את המערכת, כמה מילים חשובות:
            </p>
            <div className="space-y-2.5 rounded-xl bg-muted/50 p-3.5 text-sm leading-relaxed">
              <p>
                💙 המערכת הזו נבנתה <b>בהתנדבות, כשירות לציבור</b> — ללא כל מטרה מסחרית.
              </p>
              <p>
                🤖 היא לא נכתבה על ידי מתכנתים מקצועיים, אלא בעזרת <b>כלי בינה
                מלאכותית</b>, תוך שימת דגש רב על אבטחת מידע ופרטיות.
              </p>
              <p>
                ⚖️ עם זאת, היא מסופקת <b>כמות-שהיא (As-Is), ללא אחריות מכל סוג</b> —
                לא לתקלות, לא לאובדן מידע ולא לכל נזק או סוגיה שתעלה מהשימוש.
              </p>
              <p>
                🛡️ האחריות המלאה על ההפעלה, הנתונים והשימוש היא על <b>המתקין
                והמפעיל בלבד</b>. מומלץ מאוד להפעיל את הגיבוי היומי המובנה.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-primary/40 bg-accent/10 p-3 text-sm">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
              />
              <span>
                קראתי והבנתי — אני מקבל/ת את התנאים ואת <b>האחריות המלאה</b> על השימוש
                במערכת.
              </span>
            </label>
            <Button className="w-full" disabled={!agreed} onClick={() => setStep(1)}>
              מסכים/ה — בואו נתחיל
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              בכמה צעדים קצרים נגדיר את המערכת למרפאה שלכם. אפשר לשנות הכול
              אחר כך במסך ההגדרות.
            </p>
            <div>
              <Label>שם המרפאה</Label>
              <Input
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                maxLength={40}
                placeholder="למשל: מרפאת השלום"
                autoFocus
              />
              <p className="mt-1 text-xs text-muted-foreground">
                השם יופיע בכותרת האפליקציה, במסך ההתחברות ובאייקון בטלפון.
              </p>
            </div>
            <Button className="w-full" disabled={pending || clinicName.trim().length < 1} onClick={() => setStep(2)}>
              {pending ? <Spinner /> : "המשך"}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">באילו ימים המרפאה פעילה? (שבת אינה קיימת במערכת)</p>
            <div className="grid grid-cols-3 gap-2">
              {DAY_NAMES.map((name, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={cn(
                    "rounded-xl border py-2.5 text-sm font-medium transition-colors",
                    activeDays.includes(i)
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                חזרה
              </Button>
              <Button className="flex-1" disabled={pending || activeDays.length === 0} onClick={() => setStep(3)}>
                המשך
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              באילו שעות המרפאה פתוחה? הלוח יוצג במשבצות של חצי שעה בטווח הזה.
            </p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>פתיחה</Label>
                <Select value={dayStartMin} onChange={(e) => setDayStartMin(Number(e.target.value))}>
                  {ALL_TIMES.slice(0, -1).map((m) => (
                    <option key={m} value={m}>{fmtMin(m)}</option>
                  ))}
                </Select>
              </div>
              <div className="flex-1">
                <Label>סגירה</Label>
                <Select value={dayEndMin} onChange={(e) => setDayEndMin(Number(e.target.value))}>
                  {ALL_TIMES.filter((m) => m > 0).map((m) => (
                    <option key={m} value={m}>{fmtMin(m)}</option>
                  ))}
                </Select>
              </div>
            </div>
            {boundsErr ? (
              <p className="text-xs text-destructive">{boundsErr}</p>
            ) : (
              <p className="text-xs text-muted-foreground">עד 15.5 שעות ביום פעילות.</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                חזרה
              </Button>
              <Button className="flex-1" disabled={pending || !!boundsErr} onClick={() => saveBasicsAnd(4)}>
                {pending ? <Spinner /> : "שמירה והמשך"}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              הוסיפו את חדרי הטיפול. כל חדר ייפתח אוטומטית בכל ימי הפעילות ובכל שעות הפעילות —
              אפשר לדייק חלונות זמינות אחר כך במסך ניהול החדרים.
            </p>
            <div className="rounded-xl border border-border p-3">
              <Label>שם החדר</Label>
              <Input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                maxLength={40}
                placeholder="למשל: חדר 1"
                onKeyDown={(e) => e.key === "Enter" && addRoom()}
              />
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={roomWindow} onChange={(e) => setRoomWindow(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                  <AppWindow size={13} className="text-sky-500" /> חלון
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={roomSink} onChange={(e) => setRoomSink(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                  <Droplets size={13} className="text-cyan-500" /> כיור
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={roomLarge} onChange={(e) => setRoomLarge(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                  <Maximize2 size={13} className="text-violet-500" /> גדול
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={roomGroup} onChange={(e) => setRoomGroup(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                  <Users size={13} className="text-amber-500" /> קבוצות
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={roomExternal} onChange={(e) => setRoomExternal(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                  <Layers size={13} className="text-muted-foreground" /> חדר חיצוני
                </label>
              </div>
              <Button size="sm" className="mt-3 w-full" variant="secondary" disabled={pending || !roomName.trim()} onClick={addRoom}>
                <Plus size={14} />
                הוספת החדר
              </Button>
            </div>
            {rooms.length > 0 && (
              <ul className="space-y-1">
                {rooms.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm">
                    <DoorOpen size={14} className="text-primary" />
                    <span className="font-medium">{r.name}</span>
                    {r.isGroupRoom && <Badge>קבוצות</Badge>}
                    {r.isPool && <Badge variant="outline">חיצוני</Badge>}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>
                חזרה
              </Button>
              <Button className="flex-1" disabled={pending} onClick={() => setStep(5)}>
                {rooms.length > 0 ? "המשך" : "דילוג — אוסיף אחר כך"}
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              הוסיפו את אנשי הצוות. לכל אחד/ת נקבעים שם משתמש וסיסמה זמנית — מסרו להם את
              הפרטים, ובכניסה הראשונה הם יחליפו לסיסמה אישית.
            </p>
            <div className="rounded-xl border border-border p-3 space-y-2">
              <div>
                <Label>שם מלא</Label>
                <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} maxLength={60} placeholder="למשל: דנה כהן" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>שם משתמש (אנגלית)</Label>
                  <Input dir="ltr" value={staffUsername} onChange={(e) => setStaffUsername(e.target.value)} maxLength={30} placeholder="dana" />
                </div>
                <div className="flex-1">
                  <Label>סיסמה זמנית</Label>
                  <Input dir="ltr" value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} maxLength={72} placeholder="8+ תווים" />
                </div>
              </div>
              <div>
                <Label>דרגה (פנימי — לא מוצג לצוות)</Label>
                <Select value={staffTier} onChange={(e) => setStaffTier(e.target.value as typeof staffTier)}>
                  <option value="staff">צוות קבוע</option>
                  <option value="intern">מתמחה</option>
                  <option value="student">סטודנט/ית</option>
                </Select>
              </div>
              <Button size="sm" className="w-full" variant="secondary" disabled={pending} onClick={addStaff}>
                <Plus size={14} />
                הוספה לצוות
              </Button>
            </div>
            {staff.length > 0 && (
              <div className="rounded-xl bg-muted/50 p-2.5">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">נוספו — שמרו את הפרטים למסירה:</p>
                <ul className="space-y-0.5 text-sm">
                  {staff.map((s, i) => (
                    <li key={i}>
                      <span className="font-medium">{s.name}</span>
                      {" · "}
                      <span dir="ltr">{s.username} / {s.tempPassword}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(4)}>
                חזרה
              </Button>
              <Button className="flex-1" disabled={pending} onClick={() => setStep(6)}>
                {staff.length > 0 ? "המשך" : "דילוג — אוסיף אחר כך"}
              </Button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              עדכנו את חשבון הניהול שלכם — השם שיוצג בלוחות ושם המשתמש להתחברות.
            </p>
            <div>
              <Label>השם שלך</Label>
              <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} maxLength={60} />
            </div>
            <div>
              <Label>שם משתמש</Label>
              <Input dir="ltr" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} maxLength={30} />
            </div>
            <div className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-xs text-muted-foreground">החלפת סיסמה (לא חובה — השאירו ריק כדי לדלג)</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>סיסמה נוכחית</Label>
                  <Input dir="ltr" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <div className="flex-1">
                  <Label>סיסמה חדשה</Label>
                  <Input dir="ltr" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(5)}>
                חזרה
              </Button>
              <Button className="flex-1" disabled={pending || adminName.trim().length < 2 || adminUsername.trim().length < 2} onClick={() => saveAdminAnd(7)}>
                {pending ? <Spinner /> : "שמירה והמשך"}
              </Button>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-3">
            <p className="text-sm">
              הכול מוכן! סיכום ההגדרה:
            </p>
            <ul className="space-y-1 rounded-xl bg-muted/50 p-3 text-sm">
              <li>🏥 <b>{clinicName}</b></li>
              <li>📅 ימי פעילות: {activeDays.map((d) => DAY_NAMES[d]).join(", ")}</li>
              <li>🕐 שעות: {fmtMin(dayStartMin)}–{fmtMin(dayEndMin)}</li>
              <li>🚪 חדרים: {rooms.length > 0 ? rooms.map((r) => r.name).join(", ") : "יתווספו אחר כך"}</li>
              <li>👥 צוות: {staff.length > 0 ? `${staff.length} נוספו` : "יתווספו אחר כך"}</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              את כל ההגדרות אפשר לשנות בכל רגע במסכי הניהול. בהצלחה!
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(6)}>
                חזרה
              </Button>
              <Button className="flex-1" disabled={pending} onClick={finish}>
                {pending ? <Spinner /> : (
                  <>
                    כניסה למערכת
                    <ChevronLeft size={16} />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}
