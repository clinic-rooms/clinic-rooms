import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { getClinicSettings } from "@/lib/schedule/config";
import { getAnthropicKey } from "@/lib/ai/key";
import { updateSetupUrl } from "@/lib/update-workflow";
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

  const [rawSettings] = await db.select({ githubToken: t.clinicSettings.githubToken }).from(t.clinicSettings).limit(1);
  const ghOwner = process.env.VERCEL_GIT_REPO_OWNER;
  const ghRepo = process.env.VERCEL_GIT_REPO_SLUG;
  const actionsUrl =
    ghOwner && ghRepo ? `https://github.com/${ghOwner}/${ghRepo}/actions/workflows/update.yml` : null;

  const centerRows = await db.select().from(t.centers).orderBy(t.centers.sortOrder);
  const allRooms = await db.select({ centerId: t.rooms.centerId }).from(t.rooms).where(eq(t.rooms.isActive, true));
  const centers = centerRows.map((c) => ({
    id: c.id,
    name: c.name,
    roomCount: allRooms.filter((r) => r.centerId === c.id).length,
  }));

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
        updateSetupUrl={updateSetupUrl()}
        multiCenter={settings.multiCenter}
        centers={centers}
        hasGithubToken={!!rawSettings?.githubToken}
        actionsUrl={actionsUrl}
      />
      <div className="mx-auto max-w-md space-y-4">
        <ClosuresManager closures={closures} today={todayIL()} bounds={bounds} />
        <BackupManager />
      </div>
    </div>
  );
}
