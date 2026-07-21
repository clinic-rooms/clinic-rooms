import { requireAdmin } from "@/lib/auth/session";
import { listStaff } from "@/actions/admin-users";
import { UsersScreen } from "@/components/users-screen";
import { todayIL } from "@/lib/dates";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { DAY_NAMES, fmtRange } from "@/lib/schedule/slots";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireAdmin();
  const staff = await listStaff();

  // where deactivated staff were assigned — shown on their card (long-leave view)
  const inactiveIds = staff.filter((s) => !s.isActive).map((s) => s.id);
  const inactiveSchedules: Record<string, string[]> = {};
  if (inactiveIds.length > 0) {
    const today = todayIL();
    const [assignments, rooms] = await Promise.all([
      db.select().from(t.fixedAssignments),
      db.select().from(t.rooms),
    ]);
    const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? "?";
    for (const id of inactiveIds) {
      inactiveSchedules[id] = assignments
        .filter((a) => a.userId === id && (!a.effectiveTo || a.effectiveTo >= today))
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMin - b.startMin)
        .map(
          (a) =>
            `יום ${DAY_NAMES[a.dayOfWeek]} · ${roomName(a.roomId)} · ${fmtRange(a.startMin, a.endMin)}${a.kind === "group" ? " (קבוצה)" : ""}`
        );
    }
  }

  return (
    <UsersScreen
      staff={staff}
      today={todayIL()}
      currentUserId={session.user.id}
      inactiveSchedules={inactiveSchedules}
    />
  );
}
