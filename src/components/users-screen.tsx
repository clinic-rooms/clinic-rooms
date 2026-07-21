"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, KeyRound, Power, Plane, Pencil, Trash2, DoorOpen } from "lucide-react";
import { Button, Card, Input, Label, Select, Badge, Avatar } from "@/components/ui";
import { DateField } from "@/components/date-field";
import { cn } from "@/lib/utils";
import { createStaffUser, updateStaffUser, resetUserPassword, deleteStaffUser } from "@/actions/admin-users";
import { createAbsence } from "@/actions/absences";
import { PALETTE_COLORS as COLORS, PATTERNS } from "@/lib/palette";

const TIER_LABEL: Record<string, string> = {
  staff: "צוות קבוע",
  intern: "מתמחה",
  student: "סטודנט/ית",
};

const PATTERN_LABEL: Record<string, string> = { solid: "מלא", stripes: "פסים", dots: "נקודות" };

type Staff = {
  id: string;
  name: string;
  username: string | null;
  role: string;
  tier: string;
  color: string;
  pattern: string;
  isActive: boolean;
  mustSetPassword: boolean;
};

export function UsersScreen({
  staff,
  today,
  currentUserId,
  inactiveSchedules = {},
}: {
  staff: Staff[];
  today: string;
  currentUserId: string;
  inactiveSchedules?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<Staff | null>(null);
  const [vacationFor, setVacationFor] = useState<Staff | null>(null);
  const [resetFor, setResetFor] = useState<Staff | null>(null);

  function toggleActive(u: Staff) {
    if (u.isActive) {
      const ok = confirm(
        `להשבית את ${u.name}?\n\n` +
          `• לא יוכל/תוכל להתחבר יותר (גם מהנייד)\n` +
          `• השיבוצים שלו/ה יוסתרו מהלוחות\n` +
          `• שום נתון לא נמחק — אפשר להפעיל מחדש בכל רגע`
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await updateStaffUser({ userId: u.id, isActive: !u.isActive });
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success(u.isActive ? `${u.name} הושבת/ה` : `${u.name} הופעל/ה`);
        router.refresh();
      }
    });
  }

  function removeForever(u: Staff) {
    const ok = confirm(
      `למחוק את ${u.name} לצמיתות?\n\n` +
        `פעולה בלתי הפיכה! יימחקו לתמיד:\n` +
        `• כל השיבוצים וההיסטוריה שלו/ה\n` +
        `• היעדרויות, החלפות והתראות\n\n` +
        `מיועד לאנשי צוות שעזבו את המרפאה סופית.\n` +
        `(לחופשה ארוכה — השאירו מושבת/ת במקום למחוק)`
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteStaffUser(u.id);
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success(`${u.name} נמחק/ה לצמיתות`);
        router.refresh();
      }
    });
  }

  const active = staff.filter((s) => s.isActive);
  const inactive = staff.filter((s) => !s.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ניהול צוות</h1>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={15} />
          משתמש חדש
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        הדרגה (צוות קבוע / מתמחה / סטודנט) גלויה רק כאן ומשמשת את מנוע השיבוץ בשקט — המשתמשים לא רואים אותה.
      </p>

      {showCreate && <CreateForm onClose={() => setShowCreate(false)} />}
      {editUser && <EditForm user={editUser} onClose={() => setEditUser(null)} />}
      {vacationFor && <VacationForm user={vacationFor} today={today} onClose={() => setVacationFor(null)} />}
      {resetFor && <ResetForm user={resetFor} onClose={() => setResetFor(null)} />}

      <div className="grid gap-2 md:grid-cols-2">
        {active.map((u) => (
          <Card key={u.id} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={u.name} color={u.color} pattern={u.pattern} size={34} />
              <div>
                <p className="text-sm font-medium">
                  {u.name}
                  {u.role === "admin" && <Badge className="ms-1.5">ניהול</Badge>}
                </p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {u.username}
                </p>
                <div className="mt-0.5 flex gap-1">
                  <Badge variant="outline">{TIER_LABEL[u.tier] ?? u.tier}</Badge>
                  {u.mustSetPassword && <Badge variant="warn">טרם נכנס/ה</Badge>}
                </div>
              </div>
            </div>
            <div className="flex gap-0.5">
              <Button size="icon" variant="ghost" onClick={() => setEditUser(u)} aria-label="עריכה" title="עריכה">
                <Pencil size={15} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setVacationFor(u)} aria-label="הזנת חופשה" title="הזנת חופשה">
                <Plane size={15} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setResetFor(u)} aria-label="איפוס סיסמה" title="איפוס סיסמה">
                <KeyRound size={15} />
              </Button>
              {u.id !== currentUserId && (
                <Button size="icon" variant="ghost" onClick={() => toggleActive(u)} disabled={pending} aria-label="השבתה" title="השבתה">
                  <Power size={15} className="text-destructive" />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {inactive.length > 0 && (
        <details className="text-sm text-muted-foreground" open>
          <summary className="cursor-pointer py-1">משתמשים מושבתים ({inactive.length})</summary>
          <p className="mb-2 text-xs">
            השבתה מתאימה גם לחופשה ארוכה (למשל חופשת לידה): השיבוצים הקבועים נשמרים, מופיעים ברקע בלוח,
            והחדר פנוי לאחרים עד ההפעלה מחדש.
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {inactive.map((u) => {
              const schedule = inactiveSchedules[u.id] ?? [];
              return (
                <Card key={u.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} color={u.color} pattern={u.pattern} size={30} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{u.name}</p>
                        <Badge variant="outline">{TIER_LABEL[u.tier] ?? u.tier}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => toggleActive(u)} disabled={pending}>
                        הפעלה מחדש
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={pending}
                        aria-label="מחיקה לצמיתות"
                        title="מחיקה לצמיתות"
                        onClick={() => removeForever(u)}
                      >
                        <Trash2 size={15} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {schedule.length > 0 && (
                    <div className="mt-2 rounded-xl bg-muted p-2">
                      <p className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground">
                        <DoorOpen size={12} />
                        השיבוצים הקבועים (שמורים לחזרה):
                      </p>
                      <ul className="space-y-0.5 text-xs">
                        {schedule.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function CreateForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [tier, setTier] = useState<"staff" | "intern" | "student">("staff");
  const [role, setRole] = useState<"admin" | "user">("user");

  function submit() {
    startTransition(async () => {
      const res = await createStaffUser({ name, username: username.toLowerCase().trim(), tempPassword, tier, role });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${name} נוצר/ה — שם משתמש: ${username}, סיסמה זמנית: ${tempPassword}`);
      onClose();
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3 border-primary/40">
      <h3 className="font-bold">משתמש חדש</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>שם מלא</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="דנה לוי" maxLength={60} />
        </div>
        <div>
          <Label>שם משתמש (באנגלית)</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" placeholder="dana" maxLength={30} />
        </div>
        <div>
          <Label>סיסמה זמנית (לפחות 8 תווים)</Label>
          <Input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} dir="ltr" maxLength={72} />
        </div>
        <div>
          <Label>תפקיד / דרגה</Label>
          <Select
            value={role === "admin" ? "admin" : tier}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "admin") {
                setRole("admin");
                setTier("staff");
              } else {
                setRole("user");
                setTier(v as typeof tier);
              }
            }}
          >
            <option value="staff">צוות קבוע</option>
            <option value="intern">מתמחה</option>
            <option value="student">סטודנט/ית</option>
            <option value="admin">ניהול</option>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || !name.trim() || !username.trim() || tempPassword.length < 8} className="flex-1">
          יצירת משתמש
        </Button>
        <Button variant="outline" onClick={onClose}>ביטול</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        צבע ייחודי יוקצה אוטומטית. מסרו למשתמש את שם המשתמש והסיסמה הזמנית — בכניסה הראשונה יתבקש לקבוע סיסמה אישית.
      </p>
    </Card>
  );
}

function EditForm({ user, onClose }: { user: Staff; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username ?? "");
  const [tier, setTier] = useState(user.tier as "staff" | "intern" | "student");
  const [role, setRole] = useState(user.role as "admin" | "user");
  const [color, setColor] = useState(user.color);
  const [pattern, setPattern] = useState<string>(user.pattern);

  function submit() {
    startTransition(async () => {
      const res = await updateStaffUser({
        userId: user.id,
        name,
        username: username.toLowerCase().trim(),
        tier,
        role,
        color,
        pattern: pattern as "solid" | "stripes" | "dots",
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("עודכן");
      onClose();
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3 border-primary/40">
      <h3 className="font-bold">עריכת {user.name}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>שם מלא</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </div>
        <div>
          <Label>שם משתמש (באנגלית)</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" maxLength={30} />
        </div>
        <div>
          <Label>תפקיד / דרגה</Label>
          <Select
            value={role === "admin" ? "admin" : tier}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "admin") {
                setRole("admin");
              } else {
                setRole("user");
                setTier(v as typeof tier);
              }
            }}
          >
            <option value="staff">צוות קבוע</option>
            <option value="intern">מתמחה</option>
            <option value="student">סטודנט/ית</option>
            <option value="admin">ניהול</option>
          </Select>
        </div>
        <div>
          <Label>דוגמה (דפוס)</Label>
          <Select value={pattern} onChange={(e) => setPattern(e.target.value)}>
            {PATTERNS.map((p) => (
              <option key={p} value={p}>
                {PATTERN_LABEL[p]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label>צבע בלוח</Label>
        <div className="mb-2 flex items-center gap-2">
          <Avatar name={name || "?"} color={color} pattern={pattern} size={34} />
          <span className="text-xs text-muted-foreground">תצוגה מקדימה</span>
        </div>
        <ColorPicker color={color} setColor={setColor} />
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || !name.trim() || !username.trim()} className="flex-1">שמירה</Button>
        <Button variant="outline" onClick={onClose}>ביטול</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        שינוי שם המשתמש ישפיע על הכניסה — עדכנו את המשתמש בהתאם.
      </p>
    </Card>
  );
}

function VacationForm({ user, today, onClose }: { user: Staff; today: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [note, setNote] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await createAbsence({
        userId: user.id,
        dateFrom,
        dateTo: dateTo < dateFrom ? dateFrom : dateTo,
        startMin: null,
        endMin: null,
        note: note || undefined,
      });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`חופשה נרשמה ל${user.name} — נשלחה התראה`);
      onClose();
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3 border-primary/40">
      <h3 className="font-bold">הזנת חופשה — {user.name}</h3>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label>מתאריך</Label>
          <DateField value={dateFrom} onChange={setDateFrom} aria-label="מתאריך" />
        </div>
        <div className="flex-1">
          <Label>עד תאריך</Label>
          <DateField value={dateTo} min={dateFrom} onChange={setDateTo} aria-label="עד תאריך" />
        </div>
      </div>
      <div>
        <Label>הערה (לא חובה)</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending} className="flex-1">שמירת חופשה</Button>
        <Button variant="outline" onClick={onClose}>ביטול</Button>
      </div>
    </Card>
  );
}

function ResetForm({ user, onClose }: { user: Staff; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tempPassword, setTempPassword] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await resetUserPassword(user.id, tempPassword);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`הסיסמה אופסה. מסרו ל${user.name}: ${tempPassword}`);
      onClose();
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3 border-primary/40">
      <h3 className="font-bold">איפוס סיסמה — {user.name}</h3>
      <div>
        <Label>סיסמה זמנית חדשה (לפחות 8 תווים)</Label>
        <Input value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} dir="ltr" maxLength={72} />
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || tempPassword.length < 8} className="flex-1">
          איפוס
        </Button>
        <Button variant="outline" onClick={onClose}>ביטול</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        בכניסה הבאה המשתמש יתבקש לקבוע סיסמה אישית חדשה.
      </p>
    </Card>
  );
}

function ColorPicker({ color, setColor }: { color: string; setColor: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => setColor(c)}
          className={cn(
            "h-7 w-7 rounded-full border-2 transition-transform",
            color === c ? "scale-110 border-foreground" : "border-transparent"
          )}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}
