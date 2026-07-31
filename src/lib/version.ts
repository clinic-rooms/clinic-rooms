/**
 * Version + Hebrew changelog, shown to every user after an update lands.
 *
 * RELEASE PROCESS (for the maintainer): before pushing a new version —
 *   1. Bump APP_VERSION.
 *   2. Add an entry at the TOP of CHANGELOG (newest first) with 1–4 short,
 *      user-facing Hebrew bullets. Skip internal-only changes.
 * Clinics pull the release automatically overnight; users see the new entry
 * once, in a dismissible "מה חדש" dialog.
 */

export const APP_VERSION = "1.1.1";

export type ChangelogEntry = {
  version: string;
  /** DD/MM/YYYY, displayed as-is */
  date: string;
  /** short user-facing Hebrew bullets */
  notes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.1.1",
    date: "31/07/2026",
    notes: [
      "תוקן: הודעת \"מה חדש\" חזרה והופיעה שוב אחרי סגירה — כעת היא מוצגת פעם אחת בלבד",
    ],
  },
  {
    version: "1.1.0",
    date: "31/07/2026",
    notes: [
      "לוח חופשות חדש בתפריט הניהול: כל החופשות הקרובות של הצוות במבט אחד, כולל התאים שמתפנים",
      "מצב רב־מרכזי (רשות, בהגדרות): למרפאה עם כמה סניפים — שיוך חדרים למרכזים, מעבר נוח בין מרכזים בלוחות וסינון לפי מרכז בהזמנת חדר",
      "הזנת חופשה שחופפת לחופשה קיימת מציעה כעת איחוד לרשומה אחת במקום כפילות",
      "עדכון ימי חג: חול המועד ניתן לסימון פתוח/סגור, יום העצמאות ויום הזיכרון לפי מדיניות, וצמצום ערב חג רק כשלמחרת חג מלא",
      "אפשרות ביטול (Undo) לפעולות עריכה בלוח הניהול, וסימון מי שהתפנה מתא בעקבות חופשה",
    ],
  },
  {
    version: "1.0.7",
    date: "29/07/2026",
    notes: [
      "תוויות טקסט צמודות בלוח מוצגות כעת כמקטעים נפרדים עם קו הפרדה עדין",
      "העוזר החכם מזין חופשה ארוכה כרשומה אחת במקום לפרק לימים בודדים",
    ],
  },
  {
    version: "1.0.6",
    date: "22/07/2026",
    notes: [
      "תוקנה חסימת פריסה של עדכונים אוטומטיים ב-Vercel (זהות מחבר העדכון)",
    ],
  },
  {
    version: "1.0.5",
    date: "22/07/2026",
    notes: [
      "מסך הסיום של אשף ההגדרה מציע כעת להפעיל עדכונים אוטומטיים בלחיצה",
    ],
  },
  {
    version: "1.0.4",
    date: "22/07/2026",
    notes: [
      "תוקן הצורך בלחיצה כפולה ביצירת חשבון הניהול הראשון ובסיום אשף ההגדרה",
    ],
  },
  {
    version: "1.0.3",
    date: "21/07/2026",
    notes: [
      "מנגנון העדכון האוטומטי שוכתב לאמינות מלאה בהתקנות מהדפדפן",
    ],
  },
  {
    version: "1.0.2",
    date: "21/07/2026",
    notes: [
      "כרטיס חדש בהגדרות: הפעלת עדכונים אוטומטיים בשתי לחיצות (נדרש חד-פעמית בהתקנות מהדפדפן)",
    ],
  },
  {
    version: "1.0.1",
    date: "21/07/2026",
    notes: [
      "אשף ההגדרה הראשונית כולל עכשיו שלב להפעלת העוזר החכם (רשות), עם הסבר עלויות",
    ],
  },
  {
    version: "1.0.0",
    date: "21/07/2026",
    notes: [
      "גרסה ראשונה: לוח שיבוצים, הזמנת חדרים, היעדרויות, החלפות והתראות",
      "תצוגה שבועית לכל חדר, הדפסת שבוע, ותאריכים בפורמט ישראלי",
      "עוזר חכם לניהול (רשות) וגיבוי יומי אוטומטי",
    ],
  },
];

/** Entries newer than `lastSeen` (newest first). Unknown lastSeen → just the latest. */
export function entriesSince(lastSeen: string | null): ChangelogEntry[] {
  if (lastSeen === APP_VERSION) return [];
  const idx = CHANGELOG.findIndex((e) => e.version === lastSeen);
  if (idx === -1) return CHANGELOG.slice(0, 1);
  return CHANGELOG.slice(0, idx);
}
