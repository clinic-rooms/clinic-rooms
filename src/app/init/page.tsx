import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { runMigrations } from "@/lib/db/migrate";
import { InitForm } from "@/components/init-form";

export const dynamic = "force-dynamic";

/**
 * Browser first-run for Deploy-Button installs: shown only while the database
 * has no users at all. Applies migrations if the build-time step was skipped,
 * then lets the installer create the first admin account — all in the browser.
 */
export default async function InitPage() {
  let hasUsers: boolean;
  try {
    hasUsers = (await db.select({ id: t.user.id }).from(t.user).limit(1)).length > 0;
  } catch {
    // tables don't exist yet — create them and continue to the form
    await runMigrations();
    hasUsers = false;
  }
  if (hasUsers) redirect("/login");

  return <InitForm />;
}
