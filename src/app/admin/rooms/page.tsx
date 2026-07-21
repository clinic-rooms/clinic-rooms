import { requireAdmin } from "@/lib/auth/session";
import { listRoomsWithWindows } from "@/actions/admin-rooms";
import { getClinicSettings } from "@/lib/schedule/config";
import { RoomsScreen } from "@/components/rooms-screen";
import { todayIL } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  await requireAdmin();
  const rooms = await listRoomsWithWindows();
  const settings = await getClinicSettings();
  return (
    <RoomsScreen
      rooms={rooms}
      today={todayIL()}
      bounds={{ dayStartMin: settings.dayStartMin, dayEndMin: settings.dayEndMin }}
      activeDays={settings.activeDays}
    />
  );
}
