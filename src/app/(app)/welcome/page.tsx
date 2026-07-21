import { requireUser } from "@/lib/auth/session";
import { getClinicSettings } from "@/lib/schedule/config";
import { WelcomeScreen } from "@/components/welcome-screen";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const session = await requireUser();
  const settings = await getClinicSettings();
  return <WelcomeScreen firstName={session.user.name.split(" ")[0]} clinicName={settings.clinicName} />;
}
