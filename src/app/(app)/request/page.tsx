import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { getActiveDays } from "@/lib/schedule/data";
import { getClinicSettings, getScheduleConfig } from "@/lib/schedule/config";
import { todayIL } from "@/lib/dates";
import { RequestWizard } from "@/components/request-wizard";
import { MyWaitlist } from "@/components/my-waitlist";
import { listMyWaitlist } from "@/actions/waitlist";

export const dynamic = "force-dynamic";

export default async function RequestPage() {
  await requireUser();
  const activeDays = await getActiveDays();
  const cfg = await getScheduleConfig();
  const waitlist = await listMyWaitlist();

  const settings = await getClinicSettings();
  const centers = settings.multiCenter
    ? (await db.select().from(t.centers).orderBy(t.centers.sortOrder))
        .filter((c) => c.isActive)
        .map((c) => ({ id: c.id, name: c.name }))
    : [];

  return (
    <div className="space-y-4">
      <MyWaitlist entries={waitlist} />
      <RequestWizard
        today={todayIL()}
        activeDays={activeDays}
        bounds={{ dayStartMin: cfg.dayStartMin, dayEndMin: cfg.dayEndMin }}
        centers={centers}
      />
    </div>
  );
}
