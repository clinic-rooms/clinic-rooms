"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/action-result";

/** Marks the first-run onboarding as finished — the app opens normally from now on. */
export async function completeSetup(): Promise<ActionResult> {
  await requireAdmin();
  const existing = await db.select().from(t.clinicSettings).limit(1);
  if (existing.length > 0) {
    await db
      .update(t.clinicSettings)
      .set({ setupComplete: true })
      .where(eq(t.clinicSettings.id, existing[0].id));
  } else {
    await db.insert(t.clinicSettings).values({ id: "main", setupComplete: true });
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}
