import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { buildGridForDate } from "@/lib/schedule/grid";
import { AdminGrid } from "@/components/admin-grid";

export const dynamic = "force-dynamic";

export default async function AdminGridPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireAdmin();
  const params = await searchParams;
  const grid = await buildGridForDate(params.date);
  const [me] = await db
    .select({ primaryCenterId: t.user.primaryCenterId })
    .from(t.user)
    .where(eq(t.user.id, session.user.id));
  return (
    <AdminGrid {...grid} roomWeek rememberCenter primaryCenterId={me?.primaryCenterId ?? null} />
  );
}
