import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { NotificationsScreen } from "@/components/notifications-screen";
import { listPendingAssignmentRequests } from "@/actions/assignment-requests";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await requireUser();
  const isAdmin = session.user.role === "admin";
  const pendingAssignments = isAdmin ? await listPendingAssignmentRequests() : [];

  const [items, pendingSwaps] = await Promise.all([
    db
      .select()
      .from(t.notifications)
      .where(eq(t.notifications.userId, session.user.id))
      .orderBy(desc(t.notifications.createdAt))
      .limit(50),
    db
      .select({
        swap: t.swapRequests,
        requesterName: t.user.name,
        roomName: t.rooms.name,
      })
      .from(t.swapRequests)
      .innerJoin(t.user, eq(t.swapRequests.requesterId, t.user.id))
      .innerJoin(t.rooms, eq(t.swapRequests.roomId, t.rooms.id))
      .where(
        and(eq(t.swapRequests.targetUserId, session.user.id), eq(t.swapRequests.status, "pending"))
      ),
  ]);

  const altRooms = await db.select().from(t.rooms);
  const roomName = (id: string | null) => altRooms.find((r) => r.id === id)?.name ?? null;

  return (
    <NotificationsScreen
      items={items.map((n) => ({
        id: n.id,
        type: n.type,
        payload: n.payload,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      }))}
      pendingSwaps={pendingSwaps.map(({ swap, requesterName, roomName: rn }) => ({
        id: swap.id,
        requesterName,
        date: swap.date,
        startMin: swap.startMin,
        endMin: swap.endMin,
        roomName: rn,
        altRoomName: roomName(swap.altRoomId),
        message: swap.message,
        kind: swap.kind,
      }))}
      pendingAssignments={pendingAssignments}
    />
  );
}
