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
  specs: string[];
  selectedSpec: string | null;
  onSpecChange: (spec: string | null) => void;
  isLoading: boolean;
}

/**
 * The character's overall or selected-spec score (best 3 parses per boss,
 * averaged across bosses) plus their top-scoring bosses.
 */
export function ScoreCard({
  score,
  top3,
  metric,
  onMetricChange,
  specs,
  selectedSpec,
  onSpecChange,
  isLoading,
}: ScoreCardProps) {
  return (
    // min-h matches JourneyStatsCard so toggling modes doesn't shift the layout.
    <Card className="h-full min-h-[172px] gap-0 py-4">
      <CardHeader className="grid-cols-1 pb-3 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="text-xs font-normal tracking-widest text-muted-foreground uppercase">
          Player score · last 60 days
        </CardTitle>
        <CardAction className="col-start-1 row-start-2 flex items-center gap-1 justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end">
          {specs.length > 1 && (
            <select
              aria-label="Performance specialization"
              value={selectedSpec ?? ""}
              onChange={(event) => onSpecChange(event.target.value || null)}
              className="h-7 max-w-32 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Overall</option>
              {specs.map((spec) => (
                <option key={spec} value={spec}>{spec}</option>
              ))}
            </select>
          )}
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
