import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getClinicSettings } from "@/lib/schedule/config";
import { AppNav } from "@/components/app-nav";
import { WhatsNewGate } from "@/components/whats-new-gate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const u = session.user as typeof session.user & { mustSetPassword?: boolean; color?: string };
  if (u.mustSetPassword) redirect("/set-password");
  const settings = await getClinicSettings();
  // first run: the clinic isn't configured yet — send the admin to the onboarding wizard
  if (!settings.setupComplete && u.role === "admin") redirect("/setup");

  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav
        clinicName={settings.clinicName}
        userName={u.name}
        userColor={u.color ?? "#0d9488"}
        isAdmin={u.role === "admin"}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 p-4 pb-24 md:pb-8">{children}</main>
      <WhatsNewGate userId={u.id} />
    </div>
  );
}
