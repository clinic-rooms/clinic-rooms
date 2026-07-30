import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { listRoomsWithWindows } from "@/actions/admin-rooms";
import { getClinicSettings } from "@/lib/schedule/config";
import { RoomsScreen } from "@/components/rooms-screen";
import { todayIL } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  await requireAdmin();
  const rooms = await listRoomsWithWindows();
  const settings = await getClinicSettings();
  const centers = settings.multiCenter
    ? await db.select().from(t.centers).orderBy(t.centers.sortOrder)
    : [];
  return (
    <RoomsScreen
      rooms={rooms}
      today={todayIL()}
      bounds={{ dayStartMin: settings.dayStartMin, dayEndMin: settings.dayEndMin }}
      activeDays={settings.activeDays}
      multiCenter={settings.multiCenter}
      centers={centers.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
