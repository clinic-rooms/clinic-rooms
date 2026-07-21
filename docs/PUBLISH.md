# הוראות פרסום — לבעלי הפרויקט בלבד

מדריך חד-פעמי: איך להעלות את הקוד לריפו GitHub **ציבורי** בצורה בטוחה,
עם חשיפת זהות מינימלית. (מרפאות לא צריכות את הקובץ הזה.)

## שלב 1: הגנת זהות בחשבון GitHub (לפני הכול)

1. GitHub → Settings → **Emails**:
   - סמנו **Keep my email addresses private** — GitHub נותן לכם כתובת
     noreply ייעודית בסגנון `12345678+username@users.noreply.github.com`.
   - סמנו **Block command line pushes that expose my email**.
2. הגדירו את הזהות בגיט המקומי לכתובת ה-noreply (העתיקו אותה מהמסך הקודם):

   ```
   git config --global user.name  "השם-משתמש-שלכם"
   git config --global user.email "12345678+username@users.noreply.github.com"
   ```

3. GitHub → Settings → **Profile**: ודאו שאין שם פרטים שאינכם רוצים לחשוף
   (שם מלא, מקום עבודה, מיקום). שם המשתמש עצמו יופיע בכתובת הריפו —
   אם תרצו אנונימיות מלאה, פתחו חשבון GitHub ייעודי לפרויקט.

## שלב 2: החלפת ה-placeholder

בוצע ✔ — הקוד מפנה לחשבון `clinic-rooms` (כפתור ה-Deploy ב-`README.md`
והמשתנה `UPSTREAM_REPO` ב-`.github/workflows/update.yml`). אם אי-פעם
מעבירים את הפרויקט לחשבון אחר — לחפש ולהחליף `clinic-rooms/clinic-rooms`
בשני הקבצים האלה.

## שלב 3: בדיקת סודות אחרונה

```
node scripts/check-secrets.mjs
```

חייב להסתיים ב-`Clean`. בנוסף ודאו שאין בתיקייה `.env.local` עם ערכים
אמיתיים (הוא ממילא ב-gitignore, אבל ליתר ביטחון).

## שלב 4: יצירת הריפו והדחיפה

1. GitHub → **New repository**: שם `clinic-rooms`, נראות **Public**,
   בלי שום Initialize.
2. מהתיקייה של הפרויקט:

   ```
   git init -b main
   git add -A
   git commit -m "Clinic Rooms - initial public release"
   git remote add origin https://github.com/שם-המשתמש/clinic-rooms.git
   git push -u origin main
   ```

   (ההיסטוריה מתחילה נקייה — אין קומיטים ישנים שעלולים להכיל משהו.)

## שלב 5: הגנות בריפו (אחרי הדחיפה)

בעמוד הריפו → Settings:

1. **Advanced Security / Code security** → הפעילו **Secret scanning**
   ו-**Push protection** — GitHub יחסום דחיפה של סודות בטעות.
2. (רשות) **General → Features**: אפשר לכבות Issues/Discussions אם אינכם
   רוצים לנהל פניות ציבוריות.
3. ודאו שה-Action "Secret scan" עבר ירוק בלשונית Actions.

## שלב 6: בדיקת קצה-לקצה אחת

עברו בעצמכם את מסלול א ב-[INSTALL.md](INSTALL.md) עם חשבון Vercel נסיוני:
כפתור → Neon → פריסה → יצירת אדמין → אשף. אחרי שעבר — אפשר להפיץ: מעכשיו
ההפצה היא פשוט **קישור לריפו**.

## פרסום עדכונים בעתיד — תהליך גרסה

לפני כל push של שינוי שמגיע למרפאות:

1. פתחו את `src/lib/version.ts`:
   - העלו את `APP_VERSION` (למשל `1.0.0` → `1.1.0`).
   - הוסיפו רשומה **בראש** `CHANGELOG` עם 1–4 נקודות קצרות בעברית, מנוסחות
     למשתמש הסופי (לא פרטים טכניים). זה מה שכולם יראו במסך "מה חדש".
2. ואז:

   ```
   git add -A
   git commit -m "v1.1.0 - תיאור קצר"
   git push
   ```

המרפאות מקבלות את העדכון אוטומטית בלילה שאחרי (או מיידית ב-Run workflow),
וכל המשתמשים אצלן יראו את מסך "מה חדש" פעם אחת. אם שכחתם לעדכן את
version.ts — העדכון עדיין יגיע, פשוט בלי מסך ההודעה.
