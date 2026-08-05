import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import type { RecentInstance } from "@/api/typesGenerated";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { formatDuration } from "@/pages/Logs/utils/calendarUtils";
import { groupDuplicateInstances } from "@/utils/groupDuplicates";
import { parseColor } from "@/pages/Instance/parseColors";

const MAX_NIGHTS = 6;

interface RecentNightsCardProps {
  instances?: readonly RecentInstance[];
  /** Best parse display score per instance_id. */
  nightScores: Map<string, number>;
  onOpenActivity: () => void;
}

/** The last few raid nights, newest first, with the night's best parse. */
export function RecentNightsCard({ instances, nightScores, onOpenActivity }: RecentNightsCardProps) {
  const nights = useMemo(() => {
    const groups = groupDuplicateInstances([...(instances ?? [])]);
    groups.sort(
      (a, b) =>
        new Date(b[0].first_encounter_time).getTime() -
        new Date(a[0].first_encounter_time).getTime(),
    );
    return groups.slice(0, MAX_NIGHTS);
  }, [instances]);

  return (
    <Card className="gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>Recent nights</CardTitle>
        <CardDescription>
          {nights.length > 0
            ? `Last ${nights.length} raid ${nights.length === 1 ? "night" : "nights"}`
            : "No raids in the last 12 weeks"}
        </CardDescription>
        <CardAction>
          <button
            onClick={onOpenActivity}
            className="cursor-pointer text-xs text-link hover:underline"
          >
            All activity →
          </button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {nights.map((group) => {
          const inst = group[0];
          const date = new Date(inst.first_encounter_time);
          const duration = formatDuration(inst.duration_ms);
          // The group's best parse across duplicate uploads of the night.
          const best = group.reduce<number | undefined>((acc, g) => {
            const s = nightScores.get(g.id);
            return s !== undefined && s > (acc ?? -1) ? s : acc;
          }, undefined);
          const url = inst.slug ? `/instances/${inst.slug}` : `/instances/${inst.id}`;

          return (
            <Link
              key={inst.id}
              to={url}
              className="flex items-center gap-4 border-b border-border py-2.5 transition-colors last:border-b-0 hover:bg-muted/40"
            >
              <div className="w-14 shrink-0">
                <div className="font-mono text-xs text-foreground">{format(date, "MMM d")}</div>
                <div className="text-xs text-muted-foreground">{format(date, "EEE")}</div>
              </div>
              <div className="min-w-0 grow">
                <div className="font-wow truncate text-sm text-foreground">{inst.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {inst.boss_kills}/{inst.boss_count}{" "}
                  {inst.boss_count === 1 ? "boss" : "bosses"}
                  {duration ? ` · ${duration}` : ""}
                </div>
              </div>
              {best !== undefined && (
                <div className="shrink-0 text-right">
                  <div className={`font-mono text-sm font-bold ${parseColor(best)}`}>{best}</div>
                  <div className="text-xs text-muted-foreground">best</div>
                </div>
              )}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
