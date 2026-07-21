"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";

/** Marks the first-run onboarding as finished and enters the admin board. */
export async function completeSetup(): Promise<void> {
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
  // redirect from the action — a client-side push after the await gets dropped
  redirect("/admin");
}
