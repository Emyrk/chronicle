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
import {
  summarizeClearTimes,
  type ClearTimeSummary,
} from "./clearTimePopulation";

interface MetricCellProps {
  label: string;
  value: number | null;
  comparisonValue: number | null;
  comparisonLabel: string;
  formatValue: (value: number) => string;
  formatDelta: (value: number) => string;
  parseScore?: number | null;
  parseDistribution?: ClearTimeSummary | null;
}

function ParseDistribution({
  score,
  primaryValue,
  summary,
}: {
  score: number;
  primaryValue: number;
  summary: ClearTimeSummary;
}) {
  const domainMin = Math.min(summary.min, primaryValue);
  const domainMax = Math.max(summary.max, primaryValue);
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
            parseColor(score),
            parseBgColor(score),
            parseBorderColor(score),
          )}
          aria-label={`Clear-time parse ${score}. Show comparison distribution.`}
        >
          {score}
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
            <p className="text-xs font-semibold text-foreground">Clear-time parse</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Faster than or equal to {score}% of {summary.count.toLocaleString()} qualified clears.
            </p>
          </div>
          <span
            className={cn(
              "rounded border px-2 py-0.5 font-mono text-xs font-bold",
              parseColor(score),
              parseBgColor(score),
              parseBorderColor(score),
            )}
          >
            {score}
          </span>
        </div>

        <div className="mt-3 rounded-lg border border-white/5 bg-black/20 px-3 pb-2.5 pt-2">
          <div className="mb-2 flex items-center justify-between text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
            <span>Clear-time distribution</span>
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
  parseScore,
  parseDistribution,
}: MetricCellProps) {
  const delta = value !== null && comparisonValue !== null ? value - comparisonValue : null;

  return (
    <div className="group min-w-0 border-t px-5 py-4 transition-colors hover:bg-muted/10 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground transition-colors group-hover:text-foreground/75">{label}</p>
        {parseScore !== null && parseScore !== undefined && value !== null && parseDistribution && (
          <ParseDistribution score={parseScore} primaryValue={value} summary={parseDistribution} />
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
  const primaryInstanceId = primary.kind === "instance" ? primary.instanceId : undefined;
  const timeParsesQuery = useInstanceTimeParses(primaryInstanceId);
  const primarySummary = summarizePrimaryRaid(primaryQuery.data?.runs[0]);
  const comparisonRuns = comparisonQuery.data?.runs ?? [];
  const comparisonSummary = comparison
    ? summarizeComparisonRaids(comparisonRuns)
    : null;
  // Clear-time parse comes exclusively from the snapshot API — no client-side fallback.
  const clearTimeParseScore = timeParsesQuery.data?.available && timeParsesQuery.data.clear_time?.status !== "sample_too_small"
    ? timeParsesQuery.data.clear_time?.display_score ?? null
    : null;
  const clearTimeDistribution = comparison
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
              parseScore={clearTimeParseScore}
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
