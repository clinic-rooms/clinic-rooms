# מערכת ניהול חדרי טיפול למרפאות

מערכת מלאה לניהול חדרי טיפול: לוח שיבוצים חכם, הזמנת חדרים, היעדרויות,
החלפות בין מטפלים, התראות, גיבויים ועוזר AI לניהול — בעברית, מותאם לנייד.

נבנתה בהתנדבות כשירות לציבור, ומיועדת **לארגונים ללא מטרות רווח בלבד**
(ראו [רישיון](LICENSE.md)).

## התקנה בדפדפן — הדרך המומלצת (כ-10 דקות)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fclinic-rooms%2Fclinic-rooms&project-name=clinic-rooms&repository-name=clinic-rooms&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D&env=BETTER_AUTH_SECRET&envDescription=%D7%9E%D7%A4%D7%AA%D7%97%20%D7%90%D7%91%D7%98%D7%97%D7%94%20%D7%9C%D7%94%D7%AA%D7%97%D7%91%D7%A8%D7%95%D7%AA%3A%20%D7%94%D7%A7%D7%9C%D7%99%D7%93%D7%95%20%D7%9C%D7%A4%D7%97%D7%95%D7%AA%2040%20%D7%AA%D7%95%D7%95%D7%99%D7%9D%20%D7%90%D7%A7%D7%A8%D7%90%D7%99%D7%99%D7%9D%20(%D7%90%D7%95%D7%AA%D7%99%D7%95%D7%AA%20%D7%95%D7%9E%D7%A1%D7%A4%D7%A8%D7%99%D7%9D)%20%D7%95%D7%A9%D7%9E%D7%A8%D7%95%20%D7%A2%D7%95%D7%AA%D7%A7%20%D7%91%D7%9E%D7%A7%D7%95%D7%9D%20%D7%91%D7%98%D7%95%D7%97&envLink=https%3A%2F%2Fgithub.com%2Fclinic-rooms%2Fclinic-rooms%2Fblob%2Fmain%2Fdocs%2FINSTALL.md)

1. פותחים חשבון [GitHub](https://github.com) (חינם) וחשבון
   [Vercel](https://vercel.com/signup) עם **Continue with GitHub**.
2. לוחצים על הכפתור למעלה — Vercel משכפל את הקוד לחשבונכם ומקצה מסד נתונים
   (Neon) אוטומטית. יש למלא שדה אחד בלבד — **מפתח אבטחה**: פשוט מקלידים בו
   ג'יבריש אקראי של 40+ תווים (אותיות ומספרים) ושומרים עותק בצד.
   ([הסבר מלא על השדה הזה במדריך ההתקנה](docs/INSTALL.md))
3. אחרי 2–3 דקות המערכת באוויר: נכנסים לכתובת, יוצרים חשבון ניהול,
   ואשף בעברית מגדיר את המרפאה — שם, ימים, שעות, חדרים וצוות.

הוראות מפורטות צעד-צעד: [docs/INSTALL.md](docs/INSTALL.md)

## עדכוני גרסה

בעמוד ה-GitHub של המרפאה: **Actions → עדכון מערכת → Run workflow** —
הגרסה החדשה נמשכת מהמאגר הזה ונפרסת אוטומטית. חזרה לאחור: Rollback ב-Vercel.

## התקנה מקומית (מסלול חלופי)

מי שמעדיף התקנה מודרכת מהמחשב: הורידו את הקוד, הריצו `install.bat`
(Windows) או `bash install.sh` (Mac) — אשף מלווה + מדריך בדפדפן.

## מדריכים

| קובץ | למי |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | למתקין — שני המסלולים + פתרון תקלות |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | למנהל/ת המרפאה |
| [docs/STAFF_GUIDE.md](docs/STAFF_GUIDE.md) | לצוות המטפלים |

## פקודות למתקדמים

```bash
npm run setup        # אשף ההתקנה המקומי
npm run dev          # הרצה מקומית
npm test             # בדיקות מנוע השיבוץ
node scripts/migrate.mjs        # החלת סכימת המסד (רץ אוטומטית בכל פריסה)
node scripts/check-secrets.mjs  # סריקת סודות (רץ אוטומטית ב-CI)
npm run db:restore -- backup.json   # שחזור מגיבוי
```

טכנולוגיות: Next.js · Neon Postgres · Drizzle ORM · better-auth · Tailwind ·
Claude API (רשות) · Web Push (רשות).

## רישיון ותנאי שימוש

המערכת מסופקת חינם, **לארגונים ללא מטרות רווח בלבד** — מרפאות ציבוריות,
מוסדות בריאות ורווחה ועמותות. **אסור כל שימוש מסחרי**: מכירה, גביית תשלום
על התקנה או שירות, או הפצה מחדש. מסופקת כמות-שהיא (As-Is) **ללא אחריות
מכל סוג** — האחריות המלאה על המתקין והמפעיל. הנוסח המחייב: [LICENSE.md](LICENSE.md).
