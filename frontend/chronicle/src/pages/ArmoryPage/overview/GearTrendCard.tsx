import { useMemo } from "react";
import { format } from "date-fns";
import type { ArmoryGearSnapshot } from "@/api/typesGenerated";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";

const MAX_BARS = 16;

interface GearTrendCardProps {
  snapshots?: readonly ArmoryGearSnapshot[];
  isLoading: boolean;
}

/** Average item level per gear snapshot, oldest to newest. */
export function GearTrendCard({ snapshots, isLoading }: GearTrendCardProps) {
  const points = useMemo(
    () =>
      [...(snapshots ?? [])]
        .filter((s) => s.avg_ilvl != null)
        .reverse() // endpoint is newest-first
        .slice(-MAX_BARS),
    [snapshots],
  );

  const first = points[0];
  const last = points[points.length - 1];
  const min = Math.min(...points.map((p) => p.avg_ilvl!));
  const max = Math.max(...points.map((p) => p.avg_ilvl!));
  const span = Math.max(max - min, 1);

  return (
    <Card className="h-full gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>Gear over time</CardTitle>
        <CardDescription>Average item level by raid night</CardDescription>
      </CardHeader>
      <CardContent>
        {points.length < 2 ? (
          <div className="py-2 text-sm text-muted-foreground">
            {isLoading
              ? "Loading gear history…"
              : "Not enough gear history yet — snapshots are recorded from each new log."}
          </div>
        ) : (
          <>
            <div className="flex items-end gap-1.5" style={{ height: 150 }}>
              {points.map((p, i) => (
                <div
                  key={p.instance_id}
                  className="flex h-full grow items-end"
                  title={`${format(new Date(p.equipped_at), "MMM d")} · ${p.avg_ilvl!.toFixed(1)}`}
                >
                  <div
                    className="w-full rounded-t-xs"
                    style={{
                      height: `${20 + ((p.avg_ilvl! - min) / span) * 80}%`,
                      background:
                        i === points.length - 1
                          ? "var(--color-amber-500)"
                          : "var(--color-blue-400)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
              <div className="text-xs text-muted-foreground">
                {first.avg_ilvl!.toFixed(1)} in {format(new Date(first.equipped_at), "MMM")}
              </div>
              <div className="font-mono text-sm font-bold" style={{ color: "var(--color-amber-500)" }}>
                {last.avg_ilvl!.toFixed(1)} now
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
