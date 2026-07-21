"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/action-result";
import { exportAll, importAll, type BackupFile } from "@/lib/backup";

/** Returns the full backup as a JSON string for the admin to download. */
export async function downloadBackup(): Promise<{ json: string; filename: string } | { error: string }> {
  await requireAdmin();
  try {
    const backup = await exportAll(new Date().toISOString());
    const date = new Date().toISOString().slice(0, 10);
    return { json: JSON.stringify(backup, null, 1), filename: `clinic-backup-${date}.json` };
  } catch (e) {
    console.error(e);
    return { error: "יצירת הגיבוי נכשלה" };
  }
}

/** Wipes the DB and restores from an uploaded backup. Destructive — admin only. */
export async function restoreBackup(json: string): Promise<ActionResult<{ counts: Record<string, number> }>> {
  await requireAdmin();
  let backup: BackupFile;
  try {
    backup = JSON.parse(json);
  } catch {
    return { error: "הקובץ אינו JSON תקין" };
  }
  if (!backup?.tables || !backup.tables.user) {
    return { error: "הקובץ אינו גיבוי תקין של המערכת" };
  }
  try {
    await importAll(backup);
    const counts = Object.fromEntries(
      Object.entries(backup.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
    );
    revalidatePath("/");
    revalidatePath("/admin");
    return { ok: true, counts };
  } catch (e) {
    console.error(e);
    return { error: "השחזור נכשל — ייתכן שהקובץ אינו תואם לגרסה הנוכחית" };
  }
}
