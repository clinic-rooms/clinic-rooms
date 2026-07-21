"use client";

import { useTransition } from "react";
import {
  CalendarDays,
  LayoutGrid,
  PlusCircle,
  UserX,
  Bell,
  BellRing,
  Clock3,
  Scissors,
  Plane,
  Sparkles,
  Hourglass,
  Smartphone,
} from "lucide-react";
import { Button, Card, Spinner } from "@/components/ui";
import { markWelcomeSeen } from "@/actions/account";

export function WelcomeScreen({ firstName, clinicName }: { firstName: string; clinicName: string }) {
  const [pending, startTransition] = useTransition();

  function start() {
    // the action itself redirects to "/" — no client-side push needed
    startTransition(async () => {
      await markWelcomeSeen();
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
          {clinicName.trim().charAt(0) || "מ"}
        </div>
        <h1 className="text-2xl font-bold">שלום {firstName}, ברוך/ה הבא/ה! 🎉</h1>
        <p className="mt-1 text-muted-foreground">
          כמה דברים קצרים שכדאי לדעת על מערכת ניהול החדרים של {clinicName}.
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="font-bold">מה יש במערכת</h2>
        <ul className="space-y-2.5 text-sm">
          <Item icon={<CalendarDays size={18} />} title="הלו״ז שלי">
            החדרים והשעות הקבועים שלך לאורך השבוע.
          </Item>
          <Item icon={<LayoutGrid size={18} />} title="לוח מלא">
            הלו״ז של כל החדרים והמטפלים. אפשר ללחוץ על חדר פנוי כדי לשריין אותו.
          </Item>
          <Item icon={<PlusCircle size={18} />} title="הזמנת חדר">
            צריך/ה חדר לשעה מסוימת? המערכת תמצא לך חדר פנוי, תציע חלופות או החלפה.
          </Item>
          <Item icon={<Hourglass size={18} />} title="רשימת המתנה">
            אין חדר פנוי בשעה שרצית? אפשר להצטרף לרשימת המתנה, ונודיע לך אוטומטית ברגע שמתפנה חדר מתאים.
          </Item>
          <Item icon={<UserX size={18} />} title="היעדרויות">
            כאן מעדכנים מתי אינך בחדר — וזה החלק הכי חשוב 👇
          </Item>
          <Item icon={<Bell size={18} />} title="התראות">
            בקשות החלפה, אישורים ועדכונים מהניהול.
          </Item>
        </ul>
      </Card>

      <Card className="space-y-2 border-primary/30 bg-accent/10">
        <h2 className="flex items-center gap-1.5 font-bold">
          <Smartphone size={17} className="text-primary" />
          מומלץ: הפעילו התראות לטלפון
        </h2>
        <p className="text-sm">
          כדי לא לפספס בקשות החלפה או חדר שמתפנה, היכנסו לעמוד «התראות» ולחצו על «הפעלה» ליד
          <BellRing size={14} className="mx-1 mb-0.5 inline text-primary" />
          «התראות לטלפון». כך תקבלו התראה גם כשהאפליקציה סגורה.
        </p>
        <p className="text-xs text-muted-foreground">
          טיפ: הוסיפו את האפליקציה למסך הבית של הטלפון — כך היא נפתחת מהר וההתראות עובדות טוב יותר (חובה באייפון).
        </p>
      </Card>

      <Card className="space-y-3 border-primary/40 bg-accent/10">
        <h2 className="flex items-center gap-1.5 font-bold">
          <Sparkles size={17} className="text-primary" />
          הכי חשוב: עדכנו כל היעדרות!
        </h2>
        <p className="text-sm">
          כדי שכולם ייהנו מהחדרים ביעילות, חשוב לעדכן במערכת בכל פעם שאת/ה לא נמצא/ת בחדר —
          כך החדר מתפנה אוטומטית למי שצריך. יש שלושה סוגים:
        </p>
        <ul className="space-y-2.5 text-sm">
          <Item icon={<Plane size={18} />} title="חופשה / היעדרות חד־פעמית">
            יום בודד או טווח תאריכים שבהם לא תהיה/י (חופשה, מחלה, השתלמות).
          </Item>
          <Item icon={<Clock3 size={18} />} title="צמצום קבוע">
            שינוי שחוזר כל שבוע — למשל ״כל יום שני אני מסיים/ת ב־14:00״.
          </Item>
          <Item icon={<Scissors size={18} />} title="שעות ספציפיות באמצע היום">
            יוצא/ת לפגישה, הדרכה או ישיבה בחדר אחר? עדכנו את השעות המדויקות שבהן
            החדר שלך מתפנה — גם אם זו שעה אחת באמצע היום.
          </Item>
        </ul>
        <p className="rounded-xl bg-card p-2.5 text-sm text-muted-foreground">
          💡 טיפ: אפשר פשוט לכתוב בשפה חופשית (״כל יום שלישי אני בהדרכה מ־10 עד 11״)
          והמערכת תבין לבד.
        </p>
      </Card>

      <Button size="lg" className="w-full" onClick={start} disabled={pending}>
        {pending ? <Spinner /> : "הבנתי, בואו נתחיל"}
      </Button>
    </div>
  );
}

function Item({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </span>
      <span>
        <b className="block">{title}</b>
        <span className="text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}
