import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { cn } from "@/lib/utils";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import type { PopulationSelection } from "./populationSelectionState";
import { useSpeedrunPopulation } from "./overviewQueries";
import {
  killTimePercentile,
  summarizeEncounterKillTimes,
  type EncounterKillTimeSummary,
} from "./encounterKillTimePopulation";

function formatDelta(deltaMs: number): string {
  const sign = deltaMs > 0 ? "+" : deltaMs < 0 ? "-" : "";
  return `${sign}${formatClearDuration(Math.abs(deltaMs))}`;
}

function Distribution({
  summary,
  primaryDurationMs,
  scaleMax,
}: {
  summary: EncounterKillTimeSummary;
  primaryDurationMs: number;
  scaleMax: number;
}) {
  const position = (value: number) => `${Math.min(100, Math.max(0, value / scaleMax * 100))}%`;

  return (
    <div className="relative h-5 min-w-24">
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-sm bg-muted/45" />
      {summary.count > 1 ? (
        <>
          <div
            className="absolute top-1/2 h-px -translate-y-1/2 bg-amber-200/45"
            style={{ left: position(summary.min), width: `calc(${position(summary.max)} - ${position(summary.min)})` }}
          />
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-amber-200/75"
            style={{ left: position(summary.q1), width: `calc(${position(summary.q3)} - ${position(summary.q1)})` }}
          />
        </>
      ) : null}
      <div
        className="absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-amber-100/90"
        style={{ left: position(summary.median) }}
        title={`Median ${formatClearDuration(summary.median)}`}
      />
      <div
        className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.65)]"
        style={{ left: position(primaryDurationMs) }}
        title={`This raid ${formatClearDuration(primaryDurationMs)}`}
      />
    </div>
  );
}

export function EncounterKillTimesPanel({
  primary,
  comparison,
}: {
  primary: PopulationSelection;
  comparison?: PopulationSelection;
}) {
  const primaryQuery = useSpeedrunPopulation(primary);
  const comparisonQuery = useSpeedrunPopulation(comparison);
  const primarySummaries = summarizeEncounterKillTimes(primaryQuery.data?.runs ?? []);
  const comparisonSummaries = summarizeEncounterKillTimes(comparisonQuery.data?.runs ?? []);
  const rows = [...primarySummaries].flatMap(([encounterName, primarySummary]) => {
    const comparisonSummary = comparisonSummaries.get(encounterName);
    return comparisonSummary ? [{ encounterName, primarySummary, comparisonSummary }] : [];
  });
  const scaleMax = Math.max(1, ...rows.flatMap((row) => [row.primarySummary.median, row.comparisonSummary.max]));
  const loading = primaryQuery.isLoading || comparisonQuery.isLoading;
  const error = primaryQuery.error ?? comparisonQuery.error;

  return (
    <Card className="overflow-hidden border-border/80 bg-card/75 shadow-sm">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-sm font-semibold">Encounter breakdown</h2>
          <span className="shrink-0 text-[11px] text-muted-foreground">Kill time per boss</span>
        </div>
        <span className="text-[11px] text-muted-foreground">Compared to median</span>
      </div>

      {!comparison ? (
        <div className="flex h-28 items-center justify-center px-5 text-sm text-muted-foreground">
          Choose a comparison population to compare encounter kill times.
        </div>
      ) : loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading encounter kill times
        </div>
      ) : error ? (
        <div className="flex h-28 items-center justify-center px-5 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load encounter kill times"}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-28 items-center justify-center px-5 text-sm text-muted-foreground">
          No comparable clean boss kills were found.
        </div>
      ) : (
        <div className="px-5 py-3">
          <div className="space-y-1">
            {rows.map(({ encounterName, primarySummary, comparisonSummary }) => {
              const primaryDurationMs = primarySummary.median;
              const delta = primaryDurationMs - comparisonSummary.median;
              const percentile = killTimePercentile(primaryDurationMs, comparisonSummary.values);
              return (
                <div
                  key={encounterName}
                  className="grid grid-cols-[minmax(7rem,10rem)_minmax(7rem,1fr)_auto] items-center gap-3 rounded px-1 py-1.5 hover:bg-muted/20"
                >
                  <span className="truncate text-xs text-muted-foreground" title={encounterName}>
                    {encounterName}
                  </span>
                  <Distribution
                    summary={comparisonSummary}
                    primaryDurationMs={primaryDurationMs}
                    scaleMax={scaleMax}
                  />
                  <div className="flex items-baseline justify-end gap-3 text-right font-mono text-xs">
                    <span className="w-11 font-semibold text-white">{formatClearDuration(primaryDurationMs)}</span>
                    <span className="hidden w-11 text-muted-foreground sm:inline">
                      {formatClearDuration(comparisonSummary.median)}
                    </span>
                    <span className={cn(
                      "w-11 font-semibold",
                      delta < 0 && "text-emerald-400",
                      delta > 0 && "text-rose-400",
                      delta === 0 && "text-muted-foreground",
                    )}>
                      {formatDelta(delta)}
                    </span>
                    {percentile !== null && (
                      <span
                        className="hidden w-8 rounded bg-muted/50 px-1 py-0.5 text-center text-[10px] text-muted-foreground md:inline"
                        title={`${percentile}th percentile for kill speed among ${comparisonSummary.count} comparable raids`}
                      >
                        P{percentile}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
