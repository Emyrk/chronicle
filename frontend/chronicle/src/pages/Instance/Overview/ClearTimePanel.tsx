import { Clock3, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import type { PopulationSelection } from "./populationSelectionState";
import { summarizeClearTimes, type ClearTimeSummary } from "./clearTimePopulation";
import { useSpeedrunPopulation } from "./overviewQueries";

function BoxPlot({
  summary,
  scaleMin,
  scaleMax,
  colorClass,
}: {
  summary: ClearTimeSummary;
  scaleMin: number;
  scaleMax: number;
  colorClass: string;
}) {
  const width = Math.max(scaleMax - scaleMin, 1);
  const position = (value: number) => `${((value - scaleMin) / width) * 100}%`;

  if (summary.count === 1) {
    return (
      <div className="relative h-7">
        <div
          className={`absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded ${colorClass}`}
          style={{ left: position(summary.median) }}
        />
      </div>
    );
  }

  return (
    <div className="relative h-7">
      <div
        className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/45"
        style={{ left: position(summary.min), right: `${100 - Number.parseFloat(position(summary.max))}%` }}
      />
      <div
        className="absolute top-1/2 h-4 -translate-y-1/2 rounded border border-current bg-current/15"
        style={{ left: position(summary.q1), right: `${100 - Number.parseFloat(position(summary.q3))}%` }}
      />
      <div
        className={`absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 ${colorClass}`}
        style={{ left: position(summary.median) }}
      />
    </div>
  );
}

function PopulationRow({
  label,
  summary,
  scaleMin,
  scaleMax,
  primary,
}: {
  label: string;
  summary: ClearTimeSummary | null;
  scaleMin: number;
  scaleMax: number;
  primary: boolean;
}) {
  return (
    <div className="grid gap-2 border-t py-3 first:border-t-0 sm:grid-cols-[minmax(10rem,0.7fr)_minmax(14rem,1.5fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {summary ? `${summary.count} qualified ${summary.count === 1 ? "raid" : "raids"}` : "No qualified clears"}
        </p>
      </div>
      {summary ? (
        <BoxPlot
          summary={summary}
          scaleMin={scaleMin}
          scaleMax={scaleMax}
          colorClass={primary ? "bg-amber-400 text-amber-400" : "bg-sky-400 text-sky-400"}
        />
      ) : <div />}
      <div className="text-left sm:min-w-28 sm:text-right">
        <p className="font-mono text-sm font-semibold">
          {summary ? formatClearDuration(summary.median) : "—"}
        </p>
        <p className="text-[11px] text-muted-foreground">median</p>
      </div>
    </div>
  );
}

export function ClearTimePanel({
  primary,
  comparison,
}: {
  primary: PopulationSelection;
  comparison?: PopulationSelection;
}) {
  const primaryQuery = useSpeedrunPopulation(primary);
  const comparisonQuery = useSpeedrunPopulation(comparison);
  const primarySummary = summarizeClearTimes(primaryQuery.data?.runs ?? []);
  const comparisonSummary = summarizeClearTimes(comparisonQuery.data?.runs ?? []);
  const summaries = [primarySummary, comparisonSummary].filter((value): value is ClearTimeSummary => value !== null);
  const scaleMin = summaries.length ? Math.min(...summaries.map((summary) => summary.min)) : 0;
  const scaleMax = summaries.length ? Math.max(...summaries.map((summary) => summary.max)) : 1;
  const loading = primaryQuery.isLoading || comparisonQuery.isLoading;
  const error = primaryQuery.error ?? comparisonQuery.error;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-amber-500" />
          <h3 className="font-semibold">Clear Time</h3>
        </div>
        <span className="text-xs text-muted-foreground">qualified full clears</span>
      </div>
      <div className="px-4">
        {loading ? (
          <div className="flex h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading populations
          </div>
        ) : error ? (
          <div className="flex h-28 items-center justify-center text-sm text-destructive">
            {error instanceof Error ? error.message : "Unable to load clear times"}
          </div>
        ) : (
          <>
            <PopulationRow
              label={primaryQuery.data?.label ?? "Primary population"}
              summary={primarySummary}
              scaleMin={scaleMin}
              scaleMax={scaleMax}
              primary
            />
            {comparison && (
              <PopulationRow
                label={comparisonQuery.data?.label ?? "Comparison population"}
                summary={comparisonSummary}
                scaleMin={scaleMin}
                scaleMax={scaleMax}
                primary={false}
              />
            )}
          </>
        )}
      </div>
    </Card>
  );
}
