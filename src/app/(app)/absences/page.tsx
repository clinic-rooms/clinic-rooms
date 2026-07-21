import { requireUser } from "@/lib/auth/session";
import { listMyAbsences } from "@/actions/absences";
import { listMyReductions } from "@/actions/reductions";
import { AbsencesScreen } from "@/components/absences-screen";
import { todayIL } from "@/lib/dates";
import { aiAvailable } from "@/lib/ai/enabled";
import { getScheduleConfig } from "@/lib/schedule/config";

export const dynamic = "force-dynamic";

export default async function AbsencesPage() {
  await requireUser();
  const [absences, reductions, ai, cfg] = await Promise.all([
    listMyAbsences(),
    listMyReductions(),
    aiAvailable(),
    getScheduleConfig(),
  ]);
  return (
    <AbsencesScreen
      absences={absences}
      reductions={reductions}
      today={todayIL()}
      bounds={{ dayStartMin: cfg.dayStartMin, dayEndMin: cfg.dayEndMin }}
      aiEnabled={ai}
    />
  );
}
