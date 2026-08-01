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
  averageKillTimePercentile,
  killTimePercentile,
  summarizeEncounterKillTimes,
  type EncounterKillTimeSummary,
} from "./encounterKillTimePopulation";

function formatDelta(deltaMs: number): string {
  const sign = deltaMs > 0 ? "+" : deltaMs < 0 ? "-" : "";
  return `${sign}${formatClearDuration(Math.abs(deltaMs))}`;
}

const AXIS_MIN_PERCENT = -100;
const AXIS_MAX_PERCENT = 100;
const AXIS_TICKS = [-100, -50, 0, 50, 100];

function relativeToMedian(value: number, median: number): number {
  return ((value - median) / median) * 100;
}

function Distribution({
  summary,
  primaryDurationMs,
}: {
  summary: EncounterKillTimeSummary;
  primaryDurationMs: number;
}) {
  const positionForRelative = (relative: number) => {
    const clamped = Math.min(AXIS_MAX_PERCENT, Math.max(AXIS_MIN_PERCENT, relative));
    return `${((clamped - AXIS_MIN_PERCENT) / (AXIS_MAX_PERCENT - AXIS_MIN_PERCENT)) * 100}%`;
  };
  const position = (value: number) => positionForRelative(relativeToMedian(value, summary.median));
  const primaryRelative = relativeToMedian(primaryDurationMs, summary.median);
  const primaryBeyondAxis = primaryRelative < AXIS_MIN_PERCENT || primaryRelative > AXIS_MAX_PERCENT;

  return (
    <div className="relative h-7 w-full min-w-0">
      {AXIS_TICKS.map((tick) => (
        <div
          key={tick}
          className={cn(
            "absolute inset-y-0 w-px bg-border/25",
            tick === 0 && "bg-muted-foreground/35",
          )}
          style={{ left: positionForRelative(tick) }}
        />
      ))}
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/60" />
      {summary.count > 1 ? (
        <>
          <div
            className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/35"
            style={{ left: position(summary.min), width: `calc(${position(summary.max)} - ${position(summary.min)})` }}
          />
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm border border-muted-foreground/30 bg-muted-foreground/45"
            style={{ left: position(summary.q1), width: `calc(${position(summary.q3)} - ${position(summary.q1)})` }}
          />
        </>
      ) : null}
      <div className="absolute top-0.5 bottom-0.5 w-0.5 bg-muted-foreground/70" style={{ left: position(summary.median) }} />
      {primaryBeyondAxis ? (
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 font-mono text-sm font-bold tracking-[-0.2em] text-primary drop-shadow-[0_0_4px_color-mix(in_oklab,var(--primary)_55%,transparent)]",
            primaryRelative < AXIS_MIN_PERCENT ? "left-0" : "right-0",
          )}
          title={`Your time is ${primaryRelative > 0 ? "+" : ""}${Math.round(primaryRelative)}% from median`}
        >
          {primaryRelative < AXIS_MIN_PERCENT ? "‹‹‹" : "›››"}
        </div>
      ) : (
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-primary-foreground/70 bg-primary shadow-[0_0_0_2px_rgba(0,0,0,0.85),0_0_5px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
          style={{ left: position(primaryDurationMs) }}
        />
      )}
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
    if (!comparisonSummary) return [];
    return [{
      encounterName,
      primarySummary,
      comparisonSummary,
      percentile: killTimePercentile(primarySummary.median, comparisonSummary.values),
    }];
  });
  const averageParse = averageKillTimePercentile(rows.map((row) => row.percentile));
  const loading = primaryQuery.isLoading || comparisonQuery.isLoading;
  const error = primaryQuery.error ?? comparisonQuery.error;

  return (
    <Card className="overflow-hidden border-border/80 bg-card/75 shadow-sm">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2 className="truncate text-sm font-semibold">Encounter breakdown</h2>
          <span className="shrink-0 text-[11px] text-muted-foreground">Kill time vs comparison median</span>
          {averageParse !== null && (
            <span
              className={cn(
                "flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px]",
                parseBgColor(averageParse),
                parseBorderColor(averageParse),
              )}
              title={`Arithmetic mean of ${rows.filter((row) => row.percentile !== null).length} encounter parse scores`}
            >
              <span className="text-muted-foreground">Avg Parse</span>
              <span className={cn("font-mono font-bold", parseColor(averageParse))}>{averageParse}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5 text-foreground/90">
            <span className="size-2 rotate-45 border border-primary-foreground/70 bg-primary shadow-[0_0_4px_color-mix(in_oklab,var(--primary)_55%,transparent)]" />
            Your time
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-sm bg-muted-foreground/45" />
            Comparison spread
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono font-bold tracking-[-0.2em] text-primary">›››</span>
            Beyond axis
          </span>
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
          <div className="px-5 py-3">
            <div className="grid grid-cols-[2.5rem_minmax(6rem,9rem)_minmax(7rem,1fr)_2.75rem_2.75rem_3rem] items-end gap-2 border-b border-border/40 px-1 pb-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
              <span />
              <span />
              <div className="relative h-4 font-mono normal-case tracking-normal">
                {AXIS_TICKS.map((tick) => (
                  <span
                    key={tick}
                    className={cn(
                      "absolute",
                      tick === AXIS_MIN_PERCENT ? "" : tick === AXIS_MAX_PERCENT ? "-translate-x-full" : "-translate-x-1/2",
                    )}
                    style={{ left: `${((tick - AXIS_MIN_PERCENT) / (AXIS_MAX_PERCENT - AXIS_MIN_PERCENT)) * 100}%` }}
                  >
                    {tick > 0 ? `+${tick}%` : `${tick}%`}
                  </span>
                ))}
              </div>
              <span className="text-right">Yours</span>
              <span className="text-right">Median</span>
              <span className="text-right">Delta</span>
            </div>
            {rows.map(({ encounterName, primarySummary, comparisonSummary, percentile }) => {
              const primaryDurationMs = primarySummary.median;
              const delta = primaryDurationMs - comparisonSummary.median;
              const deltaPercent = relativeToMedian(primaryDurationMs, comparisonSummary.median);
              const spread = comparisonSummary.q3 - comparisonSummary.q1;
              return (
                <Tooltip key={encounterName}>
                  <TooltipTrigger asChild>
                    <div className="grid cursor-default grid-cols-[2.5rem_minmax(6rem,9rem)_minmax(7rem,1fr)_2.75rem_2.75rem_3rem] items-center gap-2 border-b border-border/30 px-1 py-2 last:border-b-0 hover:bg-muted/20">
                      <span
                        className={cn(
                          "rounded border px-1 py-0.5 text-center font-mono text-[10px] font-bold",
                          percentile === null && "border-zinc-400/30 bg-zinc-400/10 text-zinc-500",
                          percentile !== null && parseColor(percentile),
                          percentile !== null && parseBgColor(percentile),
                          percentile !== null && parseBorderColor(percentile),
                        )}
                        title={percentile === null
                          ? "Parse unavailable: fewer than 5 comparable kills"
                          : `Kill-time parse ${percentile}: faster than or equal to ${percentile}% of comparable kills`}
                      >
                        {percentile === null ? "—" : percentile}
                      </span>
                      <span className="truncate text-xs font-medium text-foreground" title={encounterName}>
                        {encounterName}
                      </span>
                      <Distribution summary={comparisonSummary} primaryDurationMs={primaryDurationMs} />
                      <span className="text-right font-mono text-xs font-semibold text-white">
                        {formatClearDuration(primaryDurationMs)}
                      </span>
                      <span className="text-right font-mono text-xs text-muted-foreground">
                        {formatClearDuration(comparisonSummary.median)}
                      </span>
                      <span
                        className={cn(
                          "text-right font-mono text-xs font-semibold",
                          deltaPercent < 0 && "text-emerald-400",
                          deltaPercent > 0 && "text-rose-400",
                          deltaPercent === 0 && "text-muted-foreground",
                        )}
                        title={formatDelta(delta)}
                      >
                        {deltaPercent > 0 ? "+" : ""}{Math.round(deltaPercent)}%
                      </span>
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
                    {percentile !== null && (
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        Parse <span className={cn("font-mono font-bold", parseColor(percentile))}>{percentile}</span>
                        {" "}means this kill was faster than or equal to {percentile}% of comparable kills.
                      </p>
                    )}
                    <div className="space-y-1 text-xs">
                      <TimeStatLine label="Your time" value={formatClearDuration(primaryDurationMs)} highlight />
                      <TimeStatLine label="Median delta" value={`${formatDelta(delta)} · ${deltaPercent > 0 ? "+" : ""}${Math.round(deltaPercent)}%`} />
                      <div className="my-1 border-t border-white/5" />
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
