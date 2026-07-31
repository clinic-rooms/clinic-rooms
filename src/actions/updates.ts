"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { APP_VERSION } from "@/lib/version";
import type { ActionResult } from "@/lib/action-result";

/** The public source repo every clinic updates from (same as UPSTREAM_REPO in update.yml). */
const UPSTREAM_RAW_VERSION_URL =
  "https://raw.githubusercontent.com/clinic-rooms/clinic-rooms/main/src/lib/version.ts";

function parseVersion(v: string): number[] {
  return v.split(".").map((n) => parseInt(n, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export type UpdateCheck =
  | { error: string }
  | {
      current: string;
      latest: string;
      updateAvailable: boolean;
      /** user-facing notes of every version newer than the installed one */
      notes: string[];
    };

/**
 * Compares the installed APP_VERSION against the source repo's version.ts.
 * The source repo is public — no credentials involved.
 */
export async function checkForUpdates(): Promise<UpdateCheck> {
  await requireAdmin();
  let text: string;
  try {
    const res = await fetch(UPSTREAM_RAW_VERSION_URL, { cache: "no-store" });
    if (!res.ok) return { error: "בדיקת העדכונים נכשלה — נסו שוב מאוחר יותר" };
    text = await res.text();
  } catch {
    return { error: "אין גישה למאגר העדכונים — בדקו את החיבור לאינטרנט" };
  }

  const versionMatch = text.match(/APP_VERSION\s*=\s*"([^"]+)"/);
  if (!versionMatch) return { error: "בדיקת העדכונים נכשלה — נסו שוב מאוחר יותר" };
  const latest = versionMatch[1];

  // collect the Hebrew notes of every entry newer than the installed version
  // (the changelog format is fixed: version: "..." ... notes: [ "...", ... ])
  const notes: string[] = [];
  const entryRe = /version:\s*"([^"]+)"[\s\S]*?notes:\s*\[([\s\S]*?)\]/g;
  for (const m of text.matchAll(entryRe)) {
    if (!isNewer(m[1], APP_VERSION)) continue;
    for (const noteMatch of m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      notes.push(noteMatch[1].replace(/\\"/g, '"'));
    }
  }

  return {
    current: APP_VERSION,
    latest,
    updateAvailable: isNewer(latest, APP_VERSION),
    notes,
  };
}

/**
 * Saves (or clears, with null) a GitHub fine-grained token that lets the app
 * start the update workflow itself. Stored encrypted — never returned to the client.
 * Required scope: the clinic's repo only, permission "Actions: Read and write".
 */
export async function setGithubToken(token: string | null): Promise<ActionResult> {
  await requireAdmin();
  const [row] = await db.select().from(t.clinicSettings).limit(1);
  if (!row) return { error: "הגדרות המרפאה לא נמצאו" };
  if (token !== null) {
    const trimmed = token.trim();
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(trimmed) || trimmed.length > 300) {
      return { error: "טוקן GitHub מתחיל ב-github_pat_ או ghp_" };
    }
    const { sealSecret } = await import("@/lib/secretbox");
    await db
      .update(t.clinicSettings)
      .set({ githubToken: sealSecret(trimmed) })
      .where(eq(t.clinicSettings.id, row.id));
  } else {
    await db.update(t.clinicSettings).set({ githubToken: null }).where(eq(t.clinicSettings.id, row.id));
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Starts the clinic's own update workflow (the same one the nightly schedule
 * runs) via the GitHub API. Needs the saved token + a Vercel git deployment.
 */
export async function triggerUpdate(): Promise<ActionResult> {
  await requireAdmin();
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const repo = process.env.VERCEL_GIT_REPO_SLUG;
  if (!owner || !repo) {
    return { error: "עדכון מתוך המערכת זמין רק בהתקנות Vercel (בהתקנה מקומית: git pull)" };
  }

  const [row] = await db.select().from(t.clinicSettings).limit(1);
  const sealed = row?.githubToken ?? null;
  if (!sealed) return { error: "לא הוגדר טוקן GitHub — הדביקו טוקן בכרטיס העדכונים" };
  const { openSecret } = await import("@/lib/secretbox");
  const token = openSecret(sealed);
  if (!token) return { error: "הטוקן השמור אינו קריא — הדביקו אותו מחדש" };

  let res: Response;
  try {
    res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/update.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main" }),
        cache: "no-store",
      }
    );
  } catch {
    return { error: "אין גישה ל-GitHub — בדקו את החיבור ונסו שוב" };
  }

  if (res.status === 204) return { ok: true };
  if (res.status === 401 || res.status === 403) {
    return { error: "GitHub דחה את הטוקן — ודאו שהוא בתוקף ושיש לו הרשאת Actions: Read and write על מאגר המרפאה" };
  }
  if (res.status === 404) {
    return {
      error:
        "קובץ העדכון לא נמצא במאגר — הפעילו קודם עדכונים אוטומטיים (הכפתור בכרטיס למעלה), או שהטוקן לא ניתן למאגר הנכון",
    };
  }
  return { error: `GitHub החזיר שגיאה (${res.status}) — נסו שוב מאוחר יותר` };
}
