import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { getClinicSettings } from "@/lib/schedule/config";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // fresh Deploy-Button install: no tables / no users yet → browser first-run
  try {
    const anyUser = await db.select({ id: t.user.id }).from(t.user).limit(1);
    if (anyUser.length === 0) redirect("/init");
  } catch (e) {
    // redirect() throws internally — let it through; real DB errors mean no tables yet
    if (e && typeof e === "object" && "digest" in e) throw e;
    redirect("/init");
  }
  const settings = await getClinicSettings();
  return <LoginForm clinicName={settings.clinicName} />;
}
