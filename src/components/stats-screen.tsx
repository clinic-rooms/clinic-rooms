import { Card } from "@/components/ui";
import { Gauge, TrendingUp, DoorOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export type RoomStat = { name: string; pct: number; occupiedHours: number; openHours: number };
export type SlotStat = { label: string; pct: number };

function heatColor(pct: number): string {
  // teal scale: low = light, high = strong
  return `color-mix(in srgb, var(--primary) ${Math.max(pct, 4)}%, var(--muted))`;
}

export function StatsScreen({
  rooms,
  peak,
  overallPct,
  peakHoursPct,
  busiestLabel,
  daysCount,
}: {
  rooms: RoomStat[];
  peak: SlotStat[];
  overallPct: number;
  peakHoursPct: number;
  busiestLabel: string;
  daysCount: number;
}) {
  const busiest = rooms[0];
  const quietest = rooms[rooms.length - 1];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">ניצולת חדרים</h1>
        <p className="text-sm text-muted-foreground">
          תמונת מצב על {daysCount} ימי הפעילות הקרובים. תפוסה = שעות מאוישות מתוך שעות שהחדר פתוח.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Gauge size={16} />} label="תפוסה כללית" value={`${overallPct}%`} />
        <Stat icon={<TrendingUp size={16} />} label="שעות השיא (08–15)" value={`${peakHoursPct}%`} />
        <Stat icon={<TrendingUp size={16} />} label="השעה העמוסה" value={busiestLabel} />
      </div>

      {/* peak-hours heat strip */}
      <Card className="space-y-2">
        <h2 className="text-sm font-bold">עומס לפי שעה</h2>
        <div className="flex items-end gap-0.5">
          {peak.map((s, i) => (
            <div key={i} className="group relative flex flex-1 flex-col items-center">
              <div
                className="w-full rounded-t"
                style={{ height: `${Math.max(s.pct, 3) * 0.6 + 4}px`, backgroundColor: heatColor(s.pct) }}
                title={`${s.label} — ${s.pct}%`}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground" dir="ltr">
          <span>07:00</span>
          <span>13:00</span>
          <span>19:00</span>
        </div>
      </Card>

      {/* per-room occupancy bars */}
      <Card className="space-y-2.5">
        <h2 className="text-sm font-bold">תפוסה לפי חדר</h2>
        {rooms.length === 0 && <p className="text-sm text-muted-foreground">אין נתונים לשבוע זה.</p>}
        {rooms.map((r) => (
          <div key={r.name}>
            <div className="mb-0.5 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <DoorOpen size={14} className="text-muted-foreground" />
                {r.name}
              </span>
              <span className="text-muted-foreground">
                {r.pct}% · {r.occupiedHours}/{r.openHours} ש׳
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", r.pct >= 85 ? "bg-destructive" : "bg-primary")}
                style={{ width: `${r.pct}%` }}
              />
            </div>
          </div>
        ))}
      </Card>

      {busiest && quietest && busiest.name !== quietest.name && (
        <Card className="text-sm">
          <p>
            <b>{busiest.name}</b> העמוס ביותר ({busiest.pct}%).{" "}
            <b>{quietest.name}</b> הפנוי ביותר ({quietest.pct}%) — שקול/י להפנות אליו שיבוצים.
          </p>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="flex flex-col items-center gap-0.5 p-3 text-center">
      <span className="text-primary">{icon}</span>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </Card>
  );
}
