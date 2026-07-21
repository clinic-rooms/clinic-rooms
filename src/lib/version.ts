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

export const APP_VERSION = "1.0.4";

export type ChangelogEntry = {
  version: string;
  /** DD/MM/YYYY, displayed as-is */
  date: string;
  /** short user-facing Hebrew bullets */
  notes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
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
