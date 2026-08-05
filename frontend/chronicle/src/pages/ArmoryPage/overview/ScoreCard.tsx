import type { CharacterScore } from "@/api/typesGenerated";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { parseColor, parseHexColor } from "@/pages/Instance/parseColors";
import type { EncounterSummary } from "../parseAggregation";
import type { ParseMetric } from "./util";

interface ScoreCardProps {
  score?: CharacterScore;
  top3: EncounterSummary[];
  metric: ParseMetric;
  onMetricChange: (metric: ParseMetric) => void;
  isLoading: boolean;
}

/**
 * The character's overall parse score (the server averages the best 3 parses
 * per boss, then averages across bosses) plus their top-scoring bosses.
 */
export function ScoreCard({ score, top3, metric, onMetricChange, isLoading }: ScoreCardProps) {
  return (
    // min-h matches JourneyStatsCard so toggling modes doesn't shift the layout.
    <Card className="h-full min-h-[172px] gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-normal tracking-widest text-muted-foreground uppercase">
          Player score · last 60 days
        </CardTitle>
        <CardAction className="flex gap-1">
          {(["dps", "hps"] as const).map((m) => (
            <Button
              key={m}
              variant={metric === m ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => onMetricChange(m)}
            >
              {m.toUpperCase()}
            </Button>
          ))}
        </CardAction>
      </CardHeader>
      <CardContent className="flex items-center gap-6">
        <div className="shrink-0">
          <div className={`font-mono text-5xl leading-none font-bold ${score ? parseColor(score.display_value) : "text-muted-foreground"}`}>
            {score ? score.display_value : "—"}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {score
              ? `across ${score.encounter_groups} ${score.encounter_groups === 1 ? "boss" : "bosses"}`
              : isLoading
                ? "loading…"
                : "no recent parses"}
          </div>
        </div>
        <div className="grow border-l border-border pl-6">
          {top3.length === 0 && (
            <div className="py-2 text-sm text-muted-foreground">
              {isLoading ? "Loading parses…" : `No ${metric.toUpperCase()} parses in the last 60 days.`}
            </div>
          )}
          {top3.map((e) => (
            <div key={e.encounterName} className="flex items-baseline gap-3 py-1">
              <div className="font-wow w-28 min-w-0 shrink-0 truncate text-xs text-foreground">
                {e.encounterName}
              </div>
              <div className="h-[5px] grow overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${e.score}%`, background: parseHexColor(e.score) }}
                />
              </div>
              <div className={`w-7 shrink-0 text-right font-mono text-xs font-bold ${parseColor(e.score)}`}>
                {e.score}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
