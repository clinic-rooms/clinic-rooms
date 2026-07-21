import "server-only";

/**
 * The auto-update workflow, as a string. Needed because Vercel's Deploy-Button
 * clone silently STRIPS .github/workflows (its token lacks the workflow scope),
 * so clones start without the updater. The settings screen offers the admin a
 * one-click GitHub "create this file" link prefilled with this content.
 * Keep in sync with .github/workflows/update.yml (used by wizard/git installs).
 */
export const UPDATE_WORKFLOW_PATH = ".github/workflows/update.yml";

export const UPDATE_WORKFLOW_CONTENT = `# עדכון מערכת — מושך את הגרסה החדשה ממאגר המקור ופורס אוטומטית.
#
# ברירת המחדל: בדיקה אוטומטית כל לילה (03:30 שעון ישראל, כשהמרפאה סגורה).
# אם יש גרסה חדשה — היא נפרסת, וכל המשתמשים יראו מסך "מה חדש" בכניסה הבאה.
# אם עדכון גרם לבעיה — בדשבורד של Vercel אפשר לחזור לגרסה הקודמת (Rollback).
#
# מעדיפים לעדכן רק ידנית? הוסיפו # בתחילת שתי שורות ה-schedule למטה.
# עדכון ידני בכל רגע: Actions → "עדכון מערכת" → Run workflow.
name: עדכון מערכת (System Update)

on:
  workflow_dispatch: {}
  schedule:
    - cron: "30 0 * * *" # 00:30 UTC = 02:30/03:30 בישראל

permissions:
  contents: write

env:
  # מאגר המקור של המערכת — ממנו נמשכים עדכונים
  UPSTREAM_REPO: https://github.com/clinic-rooms/clinic-rooms.git

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Pull the latest version from upstream
        run: |
          git config user.name "Clinic Rooms Updater"
          git config user.email "updater@clinic.local"
          git remote add upstream "$UPSTREAM_REPO"
          git fetch upstream main
          BEFORE=$(git rev-parse HEAD)
          # clinics never edit code, so a fast-forward always succeeds;
          # if it doesn't — stop rather than guess (data is never at risk, it's code only)
          if git merge --ff-only upstream/main; then
            AFTER=$(git rev-parse HEAD)
            if [ "$BEFORE" = "$AFTER" ]; then
              echo "::notice::Already up to date — אתם בגרסה העדכנית."
            else
              git push origin main
              echo "::notice::Updated! Vercel will deploy the new version in a few minutes."
            fi
          else
            echo "::error::Local changes prevent a clean update. Contact the project maintainer."
            exit 1
          fi
`;

/**
 * GitHub "create new file" URL prefilled with the updater — for the repo this
 * deployment is connected to. Returns null when not on a Vercel git deployment.
 */
export function updateSetupUrl(): string | null {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const repo = process.env.VERCEL_GIT_REPO_SLUG;
  if (!owner || !repo) return null;
  const params = new URLSearchParams({
    filename: UPDATE_WORKFLOW_PATH,
    value: UPDATE_WORKFLOW_CONTENT,
  });
  return `https://github.com/${owner}/${repo}/new/main?${params.toString()}`;
}
