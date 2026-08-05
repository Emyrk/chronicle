import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card";

interface JourneyStatsCardProps {
  /** Formatted time in raid over the heatmap window (e.g. "29h 22m"). */
  timeInRaid: string;
  /** Items looted (e.g. "37" or "200+"), or null while loading. */
  itemsLooted: string | null;
}

/** Participation-focused headline stats for Journey mode. */
export function JourneyStatsCard({ timeInRaid, itemsLooted }: JourneyStatsCardProps) {
  const stats: Array<[string, string]> = [
    [timeInRaid, "time in raid · 12 weeks"],
    [itemsLooted ?? "—", "items looted"],
  ];

  return (
    // min-h matches ScoreCard so toggling modes doesn't shift the layout.
    <Card className="h-full min-h-[172px] gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-normal tracking-widest text-muted-foreground uppercase">
          Journey
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grow grid-cols-2 content-center gap-x-6">
        {stats.map(([value, label]) => (
          <div key={label}>
            <div className="font-mono text-2xl leading-none font-bold text-foreground">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
