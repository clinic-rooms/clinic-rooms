import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { getClinicSettings } from "@/lib/schedule/config";
import { getAnthropicKey } from "@/lib/ai/key";
import { SettingsScreen } from "@/components/settings-screen";
import { ClosuresManager } from "@/components/closures-manager";
import { BackupManager } from "@/components/backup-manager";
import { listClosures } from "@/actions/admin-closures";
import { todayIL } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireAdmin();
  const settings = await getClinicSettings();
  const { key, source } = await getAnthropicKey();
  const hasApiKey = !!key;

  const staff = await db
    .select({ id: t.user.id, name: t.user.name, role: t.user.role, color: t.user.color, pattern: t.user.pattern })
    .from(t.user)
    .where(eq(t.user.isActive, true));
  staff.sort((a, b) => a.name.localeCompare(b.name, "he"));

  const closures = await listClosures();
  const bounds = { dayStartMin: settings.dayStartMin, dayEndMin: settings.dayEndMin };

  return (
    <div className="space-y-4">
      <SettingsScreen
        clinicName={settings.clinicName}
        activeDays={settings.activeDays}
        shareToken={settings.shareToken}
        dayStartMin={settings.dayStartMin}
        dayEndMin={settings.dayEndMin}
        staff={staff}
        currentUserId={session.user.id}
        aiEnabled={settings.aiEnabled}
        hasApiKey={hasApiKey}
        keySource={source}
      />
      <div className="mx-auto max-w-md space-y-4">
        <ClosuresManager closures={closures} today={todayIL()} bounds={bounds} />
        <BackupManager />
      </div>
    </div>
  );
}
