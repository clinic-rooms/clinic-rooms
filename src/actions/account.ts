"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { auth } from "@/lib/auth/auth";
import { requireUser } from "@/lib/auth/session";

/** Called after a successful first-login password change. */
export async function clearMustSetPassword() {
  const session = await requireUser();
  await db.update(user).set({ mustSetPassword: false }).where(eq(user.id, session.user.id));
  // refresh the session cookie cache so the (app) layout stops redirecting
  await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  return { ok: true };
}

/** Records that the user saw the "what's new" dialog for the current version. */
export async function markVersionSeen(version: string): Promise<{ ok: boolean }> {
  const session = await requireUser();
  if (typeof version !== "string" || version.length > 20) return { ok: false };
  await db.update(user).set({ lastSeenVersion: version }).where(eq(user.id, session.user.id));
  return { ok: true };
}

/** Dismiss the first-login welcome/instructions screen and go home. */
export async function markWelcomeSeen() {
  const session = await requireUser();
  await db.update(user).set({ seenWelcome: true }).where(eq(user.id, session.user.id));
  // redirect from the action navigates the router in one roundtrip —
  // client-side push+refresh in the same transition gets dropped
  redirect("/");
}
