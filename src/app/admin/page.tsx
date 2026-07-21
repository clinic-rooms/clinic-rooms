import { buildGridForDate } from "@/lib/schedule/grid";
import { AdminGrid } from "@/components/admin-grid";

export const dynamic = "force-dynamic";

export default async function AdminGridPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const grid = await buildGridForDate(params.date);
  return <AdminGrid {...grid} roomWeek />;
}
