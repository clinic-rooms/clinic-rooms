import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getClinicSettings } from "@/lib/schedule/config";
import { updateSetupUrl } from "@/lib/update-workflow";
import { SetupWizard } from "@/components/setup-wizard";

export const dynamic = "force-dynamic";

/** First-run onboarding — lives outside the app/admin layouts so their
 *  setup redirects can safely point here. */
export default async function SetupPage() {
  const session = await requireAdmin();
  const settings = await getClinicSettings();
  if (settings.setupComplete) redirect("/admin");

  const u = session.user as typeof session.user & { username?: string | null };
  return (
    <SetupWizard
      initial={{
        clinicName: settings.clinicName,
        activeDays: settings.activeDays,
        dayStartMin: settings.dayStartMin,
        dayEndMin: settings.dayEndMin,
      }}
      admin={{ id: u.id, name: u.name, username: u.username ?? "" }}
      updateSetupUrl={updateSetupUrl()}
    />
  );
}
