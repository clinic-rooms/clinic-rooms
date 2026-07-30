import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { buildGridForDate } from "@/lib/schedule/grid";
import { AdminGrid } from "@/components/admin-grid";

export const dynamic = "force-dynamic";

/** Full room board — visible to every staff member, read-only. */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireUser();
  const params = await searchParams;
  const grid = await buildGridForDate(params.date);
  const [me] = await db
    .select({ primaryCenterId: t.user.primaryCenterId })
    .from(t.user)
    .where(eq(t.user.id, session.user.id));
  // read-only for editing, but staff can click a free slot to book it
  return (
    <AdminGrid
      {...grid}
      readOnly
      bookable
      roomWeek
      rememberCenter
      primaryCenterId={me?.primaryCenterId ?? null}
      basePath="/board"
    />
  );
}
