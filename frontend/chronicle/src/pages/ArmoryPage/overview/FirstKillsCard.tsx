import { useMemo } from "react";
import { format } from "date-fns";
import type { CharacterEncounterStats } from "@/api/typesGenerated";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";

const MAX_NIGHTS = 6;
const MAX_NAMES = 2;

interface FirstKillsCardProps {
  encounters?: readonly CharacterEncounterStats[];
  isLoading: boolean;
}

interface FirstKillNight {
  instanceName: string;
  date: Date;
  bosses: string[];
}

/**
 * The most recent first-kills, aggregated per raid night: one progression
 * evening that downed five new bosses is one row, not five.
 */
export function FirstKillsCard({ encounters, isLoading }: FirstKillsCardProps) {
  const nights = useMemo(() => {
    const byNight = new Map<string, FirstKillNight>();
    const sorted = [...(encounters ?? [])].sort(
      (a, b) => new Date(a.first_killed_at).getTime() - new Date(b.first_killed_at).getTime(),
    );
    for (const e of sorted) {
      const date = new Date(e.first_killed_at);
      const key = `${e.instance_name}|${format(date, "yyyy-MM-dd")}`;
      const night = byNight.get(key);
      if (night) {
        night.bosses.push(e.encounter_name);
      } else {
        byNight.set(key, { instanceName: e.instance_name, date, bosses: [e.encounter_name] });
      }
    }
    return [...byNight.values()]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, MAX_NIGHTS);
  }, [encounters]);

  return (
    <Card className="h-full gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>First kills</CardTitle>
        <CardDescription>The night each boss went down for you</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {nights.length === 0 && (
          <div className="py-2 text-sm text-muted-foreground">
            {isLoading ? "Loading first kills…" : "No boss kills recorded yet."}
          </div>
        )}
        {nights.map((night) => {
          const shown = night.bosses.slice(0, MAX_NAMES).join(", ");
          const extra = night.bosses.length - MAX_NAMES;
          return (
            <div
              key={`${night.instanceName}|${night.date.toDateString()}`}
              className="flex items-baseline justify-between gap-3 border-b border-border pb-2.5 last:border-b-0 last:pb-0"
            >
              <div className="min-w-0">
                <div
                  className="font-wow truncate text-sm"
                  style={{ color: "var(--color-amber-500)" }}
                  title={night.bosses.join(", ")}
                >
                  {shown}
                  {extra > 0 && (
                    <span className="text-muted-foreground"> +{extra} more</span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {night.instanceName}
                  {night.bosses.length > 1
                    ? ` · ${night.bosses.length} first kills`
                    : ""}
                </div>
              </div>
              <div className="font-mono shrink-0 text-xs text-muted-foreground">
                {format(night.date, "MMM d, yyyy")}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
