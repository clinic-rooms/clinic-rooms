import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import * as t from "@/lib/db/schema";
import { buildGridForDate } from "@/lib/schedule/grid";
import { AdminGrid } from "@/components/admin-grid";

export const dynamic = "force-dynamic";

/** Public, no-login, read-only schedule — accessible only with a valid share token. */
export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { token } = await params;
  const [settings] = await db.select().from(t.clinicSettings).limit(1);
  if (!settings?.shareToken || settings.shareToken !== token) notFound();

  const { date } = await searchParams;
  const grid = await buildGridForDate(date);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-6xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">
          {settings.clinicName.trim().charAt(0) || "מ"}
        </span>
        <div>
          <h1 className="font-bold leading-tight">{settings.clinicName} — לוח החדרים</h1>
          <p className="text-xs text-muted-foreground">תצוגה בלבד · מתעדכן אוטומטית</p>
        </div>
      </div>
      <AdminGrid {...grid} readOnly basePath={`/share/${token}`} />
    </div>
  );
}
