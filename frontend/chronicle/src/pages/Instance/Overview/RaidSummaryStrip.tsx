import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { cn } from "@/lib/utils";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import { parseBgColor, parseBorderColor, parseColor } from "../parseColors";
import { PopulationSelector } from "./PopulationSelector";
import { useSpeedrunPopulation } from "./overviewQueries";
import type { PopulationSelection } from "./populationSelectionState";
import { summarizeComparisonRaids, summarizePrimaryRaid } from "./raidSummary";
import { clearTimeParse } from "./clearTimePopulation";

interface MetricCellProps {
  label: string;
  value: number | null;
  comparisonValue: number | null;
  formatValue: (value: number) => string;
  formatDelta: (value: number) => string;
  parseScore?: number | null;
}

function MetricCell({
  label,
  value,
  comparisonValue,
  formatValue,
  formatDelta,
  parseScore,
}: MetricCellProps) {
  const delta = value !== null && comparisonValue !== null ? value - comparisonValue : null;

  return (
    <div className="min-w-0 border-t px-5 py-4 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {parseScore !== null && parseScore !== undefined && (
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold",
              parseColor(parseScore),
              parseBgColor(parseScore),
              parseBorderColor(parseScore),
            )}
            title={`Clear-time parse ${parseScore}: faster than or equal to ${parseScore}% of qualified comparison clears`}
          >
            {parseScore}
          </span>
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
      <p className="mt-0.5 h-4 font-mono text-xs text-muted-foreground/70">
        {comparisonValue === null ? "" : formatValue(comparisonValue)}
      </p>
    </div>
  );
}

export function RaidSummaryStrip({
  primary,
  comparison,
  guildAvailable,
  fixedAnchorInstanceId,
  onComparisonChange,
}: {
  primary: PopulationSelection;
  comparison?: PopulationSelection;
  guildAvailable: boolean;
  fixedAnchorInstanceId: string;
  onComparisonChange: (selection?: PopulationSelection) => void;
}) {
  const primaryQuery = useSpeedrunPopulation(primary);
  const comparisonQuery = useSpeedrunPopulation(comparison);
  const primarySummary = summarizePrimaryRaid(primaryQuery.data?.runs[0]);
  const comparisonRuns = comparisonQuery.data?.runs ?? [];
  const comparisonSummary = comparison
    ? summarizeComparisonRaids(comparisonRuns)
    : null;
  const clearTimeParseScore = comparison
    ? clearTimeParse(primaryQuery.data?.runs[0], comparisonRuns)
    : null;
  const loading = primaryQuery.isLoading || comparisonQuery.isLoading;
  const error = primaryQuery.error ?? comparisonQuery.error;
  const coverage = comparisonQuery.data?.overviewCoverage;

  return (
    <Card className="mb-4 overflow-hidden border-border/80 bg-card/75 shadow-sm">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-sm font-semibold">Raid summary</h2>
          <span className="shrink-0 text-[11px] text-muted-foreground">Whole instance</span>
          {coverage && coverage.runsWithMetrics < coverage.eligibleRuns && (
            <span
              className="hidden truncate text-[11px] text-amber-400/80 md:inline"
              title={`Overview metrics v${coverage.metricsVersion}: ${coverage.runsWithMetrics} of ${coverage.eligibleRuns} eligible raids`}
            >
              {coverage.runsWithMetrics}/{coverage.eligibleRuns} with Overview data
            </span>
          )}
        </div>
        <PopulationSelector
          label="Compare against"
          value={comparison}
          allowNone
          compact
          disabled={primaryQuery.isLoading}
          guildAvailable={guildAvailable}
          fixedAnchorInstanceId={fixedAnchorInstanceId}
          onChange={onComparisonChange}
        />
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
        <div className="grid sm:grid-cols-3">
          <MetricCell
            label="Clear time"
            value={primarySummary.clearTimeMs}
            comparisonValue={comparisonSummary?.clearTimeMs ?? null}
            formatValue={formatClearDuration}
            formatDelta={formatDurationDelta}
            parseScore={clearTimeParseScore}
          />
          <MetricCell
            label="Deaths"
            value={primarySummary.playerDeaths}
            comparisonValue={comparisonSummary?.playerDeaths ?? null}
            formatValue={formatCount}
            formatDelta={formatCountDelta}
          />
          <MetricCell
            label="Wipes"
            value={primarySummary.wipeCount}
            comparisonValue={comparisonSummary?.wipeCount ?? null}
            formatValue={formatCount}
            formatDelta={formatCountDelta}
          />
        </div>
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
