import "server-only";

/**
 * The auto-update workflow, as a string. Needed because Vercel's Deploy-Button
 * clone silently STRIPS .github/workflows (its token lacks the workflow scope),
 * so clones start without the updater. The settings screen offers the admin a
 * one-click GitHub "create this file" link prefilled with this content.
 * Keep in sync with .github/workflows/update.yml (used by wizard/git installs).
 */
export const UPDATE_WORKFLOW_PATH = ".github/workflows/update.yml";

export const UPDATE_WORKFLOW_CONTENT = `# עדכון מערכת — מיישר את הקוד לגרסה העדכנית במאגר המקור ופורס אוטומטית.
#
# ברירת המחדל: בדיקה אוטומטית כל לילה (03:30 שעון ישראל, כשהמרפאה סגורה).
# אם יש גרסה חדשה — היא נפרסת, וכל המשתמשים יראו מסך "מה חדש" בכניסה הבאה.
# אם עדכון גרם לבעיה — בדשבורד של Vercel אפשר לחזור לגרסה הקודמת (Rollback).
#
# מעדיפים לעדכן רק ידנית? הוסיפו # בתחילת שתי שורות ה-schedule למטה.
# עדכון ידני בכל רגע: Actions → "עדכון מערכת" → Run workflow.
#
# שימו לב: העדכון מחליף את כל קוד המערכת בגרסת המקור (הנתונים אינם חלק
# מהקוד ולעולם אינם נגעים). אם שיניתם קוד בעצמכם — בטלו את העדכון האוטומטי.
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

      - name: Sync content from upstream
        run: |
          # the official Actions-bot identity — Vercel blocks deployments whose
          # commit author is not a recognized GitHub account
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git remote add upstream "$UPSTREAM_REPO"
          git fetch upstream main

          # Mirror the upstream TREE (works even though Vercel clones share no
          # git history with upstream), but keep OUR workflow files — the
          # Actions token may not create/modify workflow files anyway.
          git read-tree upstream/main
          git rm -r --cached --quiet .github/workflows 2>/dev/null || true
          git restore --source=HEAD --staged .github/workflows 2>/dev/null || true

          NEW_TREE=$(git write-tree)
          if [ "$NEW_TREE" = "$(git rev-parse HEAD^{tree})" ]; then
            echo "::notice::Already up to date — אתם בגרסה העדכנית."
            exit 0
          fi

          UPSTREAM_SHORT=$(git rev-parse --short upstream/main)
          NEW_COMMIT=$(git commit-tree "$NEW_TREE" -p HEAD -m "System update: sync to upstream $UPSTREAM_SHORT")
          git push origin "$NEW_COMMIT":refs/heads/main
          echo "::notice::Updated! Vercel will deploy the new version in a few minutes."
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
