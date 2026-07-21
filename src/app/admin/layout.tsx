import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getClinicSettings } from "@/lib/schedule/config";
import { AdminNav } from "@/components/admin-nav";
import { AppNav } from "@/components/app-nav";
import { WhatsNewGate } from "@/components/whats-new-gate";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const u = session.user as typeof session.user & { color?: string };
  const settings = await getClinicSettings();
  // first run: the clinic isn't configured yet — send the admin to the onboarding wizard
  if (!settings.setupComplete) redirect("/setup");

  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav clinicName={settings.clinicName} userName={u.name} userColor={u.color ?? "#0d9488"} isAdmin />
      <AdminNav />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 md:pb-8">{children}</main>
      <WhatsNewGate userId={u.id} />
    </div>
  );
}
