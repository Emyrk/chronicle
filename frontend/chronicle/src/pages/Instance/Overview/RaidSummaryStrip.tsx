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
import { useInstanceTimeParses, useSpeedrunPopulation } from "./overviewQueries";
import type { PopulationSelection } from "./populationSelectionState";
import { summarizeComparisonRaids, summarizePrimaryRaid } from "./raidSummary";
import { summarizeClearTimes, type ClearTimeSummary } from "./clearTimePopulation";
import { selectTimeParseScopeResult } from "./timeParseScope";

interface MetricCellProps {
  label: string;
  value: number | null;
  comparisonValue: number | null;
  comparisonLabel: string;
  formatValue: (value: number) => string;
  formatDelta: (value: number) => string;
  showParseBadge?: boolean;
  parseScore?: number | null;
  parseSampleSize?: number;
  parseUnavailableReason?: string;
  parseDistribution?: ClearTimeSummary | null;
}

function ClearTimeParseBadge({
  score,
  primaryValue,
  sampleSize,
  unavailableReason,
  summary,
}: {
  score: number | null;
  primaryValue: number | null;
  sampleSize?: number;
  unavailableReason?: string;
  summary?: ClearTimeSummary | null;
}) {
  const hasDistribution = summary !== null && summary !== undefined && primaryValue !== null;
  const domainMin = hasDistribution ? Math.min(summary.min, primaryValue) : 0;
  const domainMax = hasDistribution ? Math.max(summary.max, primaryValue) : 0;
  const span = Math.max(domainMax - domainMin, 1);
  const position = (value: number) => `${((value - domainMin) / span) * 100}%`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold",
            "cursor-help transition duration-150 hover:-translate-y-px hover:brightness-125",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
            score === null && "border-zinc-400/30 bg-zinc-400/10 text-zinc-500",
            score !== null && parseColor(score),
            score !== null && parseBgColor(score),
            score !== null && parseBorderColor(score),
          )}
          aria-label={score === null ? "Clear-time parse unavailable. Show details." : `Clear-time parse ${score}. Show details.`}
        >
          {score ?? "—"}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        sideOffset={8}
        hideArrow
        className="w-72 rounded-xl border border-white/10 bg-popover p-3.5 text-foreground shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-foreground">
              {score === null ? "Clear-time parse unavailable" : "Clear-time parse"}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {score === null
                ? unavailableReason ?? "No persisted score is available for this population."
                : `Faster than or equal to ${score}% of ${(sampleSize ?? 0).toLocaleString()} qualified clears.`}
            </p>
          </div>
          <span
            className={cn(
              "rounded border px-2 py-0.5 font-mono text-xs font-bold",
              score === null && "border-zinc-400/30 bg-zinc-400/10 text-zinc-500",
              score !== null && parseColor(score),
              score !== null && parseBgColor(score),
              score !== null && parseBorderColor(score),
            )}
          >
            {score ?? "—"}
          </span>
        </div>

        {hasDistribution && (
          <>
            <div className="mt-3 rounded-lg border border-white/5 bg-black/20 px-3 pb-2.5 pt-2">
              <div className="mb-2 flex items-center justify-between text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
                <span>Selected comparison distribution</span>
                <span>Lower is better</span>
              </div>
              <div className="relative h-8" aria-hidden>
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/80" />
                <div
                  className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/70"
                  style={{ left: position(summary.min), width: `calc(${position(summary.max)} - ${position(summary.min)})` }}
                />
                <div
                  className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-sm border border-muted-foreground/50 bg-muted-foreground/30"
                  style={{ left: position(summary.q1), width: `calc(${position(summary.q3)} - ${position(summary.q1)})` }}
                />
                <div
                  className="absolute top-1/2 h-5 w-px -translate-y-1/2 bg-foreground/80"
                  style={{ left: position(summary.median) }}
                />
                <div
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-primary-foreground/70 bg-primary shadow-[0_0_0_2px_rgba(0,0,0,0.75),0_0_7px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
                  style={{ left: position(primaryValue) }}
                />
              </div>
              <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>{formatClearDuration(domainMin)}</span>
                <span>{formatClearDuration(domainMax)}</span>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <span className="text-muted-foreground">Your clear</span>
              <span className="text-right font-mono font-semibold text-foreground">{formatClearDuration(primaryValue)}</span>
              <span className="text-muted-foreground">Comparison median</span>
              <span className="text-right font-mono">{formatClearDuration(summary.median)}</span>
              <span className="text-muted-foreground">Top 25%</span>
              <span className="text-right font-mono">{formatClearDuration(summary.q1)}</span>
              <span className="text-muted-foreground">Fastest</span>
              <span className="text-right font-mono">{formatClearDuration(summary.min)}</span>
            </div>
            <div className="mt-2 flex items-center gap-3 border-t border-white/5 pt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rotate-45 bg-primary" /> Your clear
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-4 rounded-sm bg-muted-foreground/40" /> Middle 50%
              </span>
            </div>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function MetricCell({
  label,
  value,
  comparisonValue,
  comparisonLabel,
  formatValue,
  formatDelta,
  showParseBadge = false,
  parseScore = null,
  parseSampleSize,
  parseUnavailableReason,
  parseDistribution,
}: MetricCellProps) {
  const delta = value !== null && comparisonValue !== null ? value - comparisonValue : null;

  return (
    <div className="group min-w-0 border-t px-5 py-4 transition-colors hover:bg-muted/10 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground transition-colors group-hover:text-foreground/75">{label}</p>
        {showParseBadge && (
          <ClearTimeParseBadge
            score={parseScore}
            primaryValue={value}
            sampleSize={parseSampleSize}
            unavailableReason={parseUnavailableReason}
            summary={parseDistribution}
          />
        )}
      </div>
      <div className="mt-1 flex min-w-0 items-baseline gap-2">
        <span className="truncate font-mono text-2xl font-semibold tracking-tight text-foreground">
          {value === null ? "—" : formatValue(value)}
        </span>
        {delta !== null && (
          <span className={cn(
            "shrink-0 font-mono text-xs font-semibold",
            delta < 0 && "text-emerald-400",
            delta > 0 && "text-rose-400",
            delta === 0 && "text-muted-foreground",
          )}>
            {formatDelta(delta)}
          </span>
        )}
      </div>
      <p className="mt-0.5 h-4 text-[10px] text-muted-foreground/60">
        {comparisonValue === null ? "" : (
          <>
            {comparisonLabel} <span className="font-mono text-xs text-muted-foreground/75">{formatValue(comparisonValue)}</span>
          </>
        )}
      </p>
    </div>
  );
}

export function RaidSummaryStrip({
  primary,
  comparison,
}: {
  primary: PopulationSelection;
  comparison?: PopulationSelection;
}) {
  const primaryQuery = useSpeedrunPopulation(primary);
  const comparisonQuery = useSpeedrunPopulation(comparison);
  const timeParsesQuery = useInstanceTimeParses(
    primary.kind === "instance" ? primary.instanceId : undefined,
  );
  const primarySummary = summarizePrimaryRaid(primaryQuery.data?.runs[0]);
  const comparisonRuns = comparisonQuery.data?.runs ?? [];
  const comparisonSummary = comparison
    ? summarizeComparisonRaids(comparisonRuns)
    : null;
  const selectedTimeParses = selectTimeParseScopeResult(timeParsesQuery.data, comparison);
  const clearTimeParse = selectedTimeParses?.available ? selectedTimeParses.clear_time : undefined;
  const clearTimeParseScore = clearTimeParse?.status === "sample_too_small"
    ? null
    : clearTimeParse?.display_score ?? null;
  const clearTimeParseUnavailableReason = !selectedTimeParses
    ? "No persisted score is available for this population."
    : !selectedTimeParses.available
      ? selectedTimeParses.reason ?? "Time parses are unavailable for this population."
      : clearTimeParse?.status === "sample_too_small"
        ? `The selected population has only ${clearTimeParse.sample_size.toLocaleString()} eligible clears, which is too small to score.`
        : !clearTimeParse
          ? "This raid does not have a qualified clear-time parse."
          : undefined;
  const clearTimeDistribution = comparison?.kind === "cohort"
    ? summarizeClearTimes(comparisonRuns)
    : null;
  const comparisonLabel = comparison?.kind === "instance" ? "Other raid" : "Comparison avg";
  const loading = primaryQuery.isLoading || comparisonQuery.isLoading;
  const error = primaryQuery.error ?? comparisonQuery.error;
  const coverage = comparisonQuery.data?.overviewCoverage;

  return (
    <Card className="mb-4 gap-0 overflow-hidden border-border/80 bg-card/75 py-0 shadow-sm">
      <div className="flex min-h-12 items-center border-b px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-sm font-semibold">Raid summary</h2>
          <span className="shrink-0 text-[11px] text-muted-foreground">Whole instance</span>
          {coverage && coverage.runsWithMetrics < coverage.eligibleRuns && (
            <span
              className="hidden truncate text-[11px] text-amber-400/80 md:inline"
              title={`Overview metrics v${coverage.metricsVersion}: ${coverage.runsWithMetrics} of ${coverage.eligibleRuns} eligible raids`}
            >
              {coverage.runsWithMetrics}/{coverage.eligibleRuns} with data
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading raid summary
        </div>
      ) : error ? (
        <div className="flex h-24 items-center justify-center px-5 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load raid summary"}
        </div>
      ) : (
        <TooltipProvider>
          <div className="grid sm:grid-cols-3">
            <MetricCell
              label="Clear time"
              value={primarySummary.clearTimeMs}
              comparisonValue={comparisonSummary?.clearTimeMs ?? null}
              comparisonLabel={comparisonLabel}
              formatValue={formatClearDuration}
              formatDelta={formatDurationDelta}
              showParseBadge={timeParsesQuery.isSuccess}
              parseScore={clearTimeParseScore}
              parseSampleSize={clearTimeParse?.sample_size}
              parseUnavailableReason={clearTimeParseUnavailableReason}
              parseDistribution={clearTimeDistribution}
            />
            <MetricCell
              label="Deaths"
              value={primarySummary.playerDeaths}
              comparisonValue={comparisonSummary?.playerDeaths ?? null}
              comparisonLabel={comparisonLabel}
              formatValue={formatCount}
              formatDelta={formatCountDelta}
            />
            <MetricCell
              label="Wipes"
              value={primarySummary.wipeCount}
              comparisonValue={comparisonSummary?.wipeCount ?? null}
              comparisonLabel={comparisonLabel}
              formatValue={formatCount}
              formatDelta={formatCountDelta}
            />
          </div>
        </TooltipProvider>
      )}
    </Card>
  );
}

function formatDurationDelta(deltaMs: number): string {
  const sign = deltaMs > 0 ? "+" : deltaMs < 0 ? "-" : "";
  return `${sign}${formatClearDuration(Math.abs(deltaMs))}`;
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatCountDelta(delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${sign}${formatCount(Math.abs(delta))}`;
}
