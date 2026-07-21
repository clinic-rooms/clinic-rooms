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
  await requireUser();
  const params = await searchParams;
  const grid = await buildGridForDate(params.date);
  // read-only for editing, but staff can click a free slot to book it
  return <AdminGrid {...grid} readOnly bookable roomWeek basePath="/board" />;
}
