import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import { parseBgColor, parseBorderColor, parseColor } from "../parseColors";
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
}: {
  summary: EncounterKillTimeSummary;
  primaryDurationMs: number;
}) {
  const extent = Math.max(summary.max - summary.min, 1);
  const position = (value: number) => {
    const normalized = (value - summary.min) / extent;
    return `${6 + Math.min(1, Math.max(0, normalized)) * 88}%`;
  };

  return (
    <div className="relative h-10 w-full min-w-0">
      <div className="absolute inset-x-[6%] top-3 h-2 rounded-sm bg-muted/45" />
      {summary.count > 1 ? (
        <>
          <div
            className="absolute top-[15px] h-px bg-amber-200/45"
            style={{ left: position(summary.min), width: `calc(${position(summary.max)} - ${position(summary.min)})` }}
          />
          <div
            className="absolute top-1.5 h-3 rounded-sm border border-amber-200/50 bg-amber-200/75"
            style={{ left: position(summary.q1), width: `calc(${position(summary.q3)} - ${position(summary.q1)})` }}
          />
          <div className="absolute top-2 h-3 w-px bg-amber-100/70" style={{ left: position(summary.min) }} />
          <div className="absolute top-2 h-3 w-px bg-amber-100/70" style={{ left: position(summary.max) }} />
        </>
      ) : null}
      <div
        className="absolute top-1 h-5 w-px bg-amber-50"
        style={{ left: position(summary.median) }}
      />
      <div
        className="absolute top-0 h-7 w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.55)]"
        style={{ left: position(primaryDurationMs) }}
      >
        <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border border-background bg-white" />
      </div>
      <span className="absolute bottom-0 left-[6%] -translate-x-1/2 font-mono text-[9px] text-muted-foreground/70">
        {formatClearDuration(summary.min)}
      </span>
      <span className="absolute bottom-0 left-[94%] -translate-x-1/2 font-mono text-[9px] text-muted-foreground/70">
        {formatClearDuration(summary.max)}
      </span>
    </div>
  );
}

function TimeStatLine({
  label,
  value,
  description,
  highlight = false,
}: {
  label: string;
  value: string;
  description?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={highlight ? "font-semibold text-foreground" : "text-foreground"}>
        {label}
        {description && <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">{description}</span>}
      </span>
      <span className={cn("shrink-0 font-mono font-medium", highlight && "font-semibold text-white")}>
        {value}
      </span>
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
  const loading = primaryQuery.isLoading || comparisonQuery.isLoading;
  const error = primaryQuery.error ?? comparisonQuery.error;

  return (
    <Card className="overflow-hidden border-border/80 bg-card/75 shadow-sm">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-sm font-semibold">Encounter breakdown</h2>
          <span className="shrink-0 text-[11px] text-muted-foreground">Kill time per boss</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5 text-foreground/90">
            <span className="h-3.5 w-[3px] rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,0.7)]" />
            Your time
          </span>
          <span>Compared to median</span>
        </div>
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
        <TooltipProvider>
          <div className="space-y-1 px-5 py-3">
            {rows.map(({ encounterName, primarySummary, comparisonSummary }) => {
              const primaryDurationMs = primarySummary.median;
              const delta = primaryDurationMs - comparisonSummary.median;
              const percentile = killTimePercentile(primaryDurationMs, comparisonSummary.values);
              const spread = comparisonSummary.q3 - comparisonSummary.q1;
              return (
                <Tooltip key={encounterName}>
                  <TooltipTrigger asChild>
                    <div className="cursor-default rounded px-1 py-2 transition-colors hover:bg-muted/20">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            "min-w-9 rounded border px-1.5 py-0.5 text-center font-mono text-[10px] font-bold",
                            percentile === null && "border-zinc-400/30 bg-zinc-400/10 text-zinc-500",
                            percentile !== null && parseColor(percentile),
                            percentile !== null && parseBgColor(percentile),
                            percentile !== null && parseBorderColor(percentile),
                          )}
                        >
                          {percentile === null ? "—" : `P${percentile}`}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground" title={encounterName}>
                          {encounterName}
                        </span>
                        <div className="flex items-baseline gap-3 text-right font-mono text-xs">
                          <span className="font-semibold text-white">{formatClearDuration(primaryDurationMs)}</span>
                          <span className={cn(
                            "w-11 font-semibold",
                            delta < 0 && "text-emerald-400",
                            delta > 0 && "text-rose-400",
                            delta === 0 && "text-muted-foreground",
                          )}>
                            {formatDelta(delta)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 w-full">
                        <Distribution
                          summary={comparisonSummary}
                          primaryDurationMs={primaryDurationMs}
                        />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={6}
                    hideArrow
                    className="w-60 rounded-lg border border-white/10 bg-popover p-3 text-foreground shadow-lg"
                  >
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-semibold">{encounterName}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {comparisonSummary.count.toLocaleString()} kills
                      </span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <TimeStatLine label="Your time" value={formatClearDuration(primaryDurationMs)} highlight />
                      <TimeStatLine label="Fastest" value={formatClearDuration(comparisonSummary.min)} />
                      <TimeStatLine label="Top 25%" value={formatClearDuration(comparisonSummary.q1)} />
                      <TimeStatLine label="Typical" value={formatClearDuration(comparisonSummary.median)} />
                      <TimeStatLine label="Bottom 25%" value={formatClearDuration(comparisonSummary.q3)} />
                      <TimeStatLine label="Slowest" value={formatClearDuration(comparisonSummary.max)} />
                      <div className="mt-1 border-t border-white/5 pt-1">
                        <TimeStatLine
                          label="Spread"
                          description="IQR (Q3 − Q1)"
                          value={formatClearDuration(spread)}
                        />
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      )}
    </Card>
  );
}
