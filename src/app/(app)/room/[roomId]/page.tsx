import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { buildRoomWeek } from "@/lib/schedule/grid";
import { RoomWeek } from "@/components/room-week";

export const dynamic = "force-dynamic";

/** Weekly view of a single room — reached by tapping a room header on the board. */
export default async function RoomWeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ from?: string; back?: string }>;
}) {
  await requireUser();
  const { roomId } = await params;
  const { from, back } = await searchParams;
  const data = await buildRoomWeek(roomId, from);
  if (!data) notFound();

  // only allow internal back-targets
  const backPath = back && back.startsWith("/") && !back.startsWith("//") ? back : "/board";
  return <RoomWeek {...data} backPath={backPath} />;
}
