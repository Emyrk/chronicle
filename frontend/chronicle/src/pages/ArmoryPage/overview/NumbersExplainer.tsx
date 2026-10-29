import { useState, type ReactNode } from "react";
import type { CharacterPerformanceRun } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { getClassColorVar } from "../types";
import type { ParseMetric } from "./util";
import type { PerformanceDisplayMode } from "./performanceComparisonState";
import {
  consistencyLabel,
  formatStat,
  PERFORMANCE_RECENT_RUN_COUNT,
  performanceParseColor,
  performanceValue,
  summarizePerformanceRuns,
  type PerformanceSummary,
} from "./performanceExplorerModel";

export interface NumbersExplainerPlayer {
  id: string;
  name: string;
  className: string;
  color: string;
  runs: readonly CharacterPerformanceRun[];
}

interface ExplainedRun {
  id: string;
  value: number;
  recent: boolean;
  outlier: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Teaches the summary stats using the selected player's own charted runs. */
export function NumbersExplainer({
  players,
  metric,
  display,
}: {
  players: readonly NumbersExplainerPlayer[];
  metric: ParseMetric;
  display: PerformanceDisplayMode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = players.find((player) => player.id === selectedId) ?? players[0];
  if (!selected) return null;

  const summary = summarizePerformanceRuns(selected.runs, metric, display);

  return (
    <div className="space-y-4">
      {players.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Explain the numbers for</span>
          {players.map((player) => (
            <button
              key={player.id}
              type="button"
              aria-pressed={player.id === selected.id}
              onClick={() => setSelectedId(player.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium transition-colors",
                player.id === selected.id ? "border-white/20 bg-white/10" : "border-transparent hover:bg-white/5",
              )}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: player.color }} />
              <span style={{ color: getClassColorVar(player.className) }}>{player.name}</span>
            </button>
          ))}
        </div>
      )}
      {summary ? (
        <PlayerExplanation player={selected} summary={summary} metric={metric} display={display} />
      ) : (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {selected.name} has no runs matching these filters, so there is nothing to explain yet.
        </div>
      )}
    </div>
  );
}

function PlayerExplanation({
  player,
  summary,
  metric,
  display,
}: {
  player: NumbersExplainerPlayer;
  summary: PerformanceSummary;
  metric: ParseMetric;
  display: PerformanceDisplayMode;
}) {
  const fmt = (value: number) => formatStat(value, display);
  const unit = display === "parse" ? "parse" : metric.toUpperCase();
  const latest = [...player.runs]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, PERFORMANCE_RECENT_RUN_COUNT);
  const latestIds = new Set(latest.map((run) => run.run_id));
  const outliers = new Set(summary.outliers);
  const runs: ExplainedRun[] = player.runs
    .map((run) => {
      const value = performanceValue(run, metric, display);
      return { id: run.run_id, value, recent: latestIds.has(run.run_id), outlier: outliers.has(value) };
    })
    .sort((a, b) => a.value - b.value);
  const values = runs.map((run) => run.value);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sameThreshold = display === "parse" ? 0.5 : summary.typical * 0.01;
  const belowFloor = values.filter((value) => value < summary.floor).length;
  const recentDelta = summary.recent === null ? 0 : summary.recent - summary.typical;
  const days = player.runs.map((run) => Date.parse(run.started_at));
  const spanWeeks = (Math.max(...days) - Math.min(...days)) / (7 * DAY_MS);
  const perWeek = summary.trend ? summary.trend.slope * 7 : 0;
  // The trend explains the spread when the drift across the window is at least as wide as the middle band.
  const trendWidensBand = summary.trend !== null
    && summary.consistency !== null
    && consistencyLabel(summary.consistency, summary.typical, display) !== "High"
    && Math.abs(perWeek) * spanWeeks >= summary.spread;
  const bandRule = display === "parse" ? "±2 parse points, Med within ±4" : "±2% of Typical, Med within ±4%";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-black/10 px-4 pt-3 pb-2">
        <div className="text-sm">
          <span className="font-medium" style={{ color: getClassColorVar(player.className) }}>{player.name}</span>
          <span className="text-muted-foreground">: all {runs.length} runs in range, lowest to highest {unit}</span>
        </div>
        <RunStrip runs={runs} summary={summary} display={display} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-300" />Run</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-300 ring-2 ring-white/80" />Latest {PERFORMANCE_RECENT_RUN_COUNT}</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full border-2 border-amber-300" />Outlier</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-white/10" />Middle half of runs</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Typical" value={fmt(summary.typical)} color={parseColor(summary.typical, display)}>
          Half of {player.name}'s {runs.length} runs are above {fmt(summary.typical)} and half are below: it's the middle run.
          {" "}The plain average is {fmt(average)}
          {summary.outliers.length > 0 && Math.abs(average - summary.typical) >= sameThreshold
            ? `, ${average < summary.typical ? "dragged down" : "pulled up"} by the outlier nights. Typical barely moves for those, so it's the better picture of a normal night.`
            : ". Typical uses the middle run instead, so one unusual night can't drag it around."}
        </StatCard>

        <StatCard label="Best" value={fmt(summary.best)} color={parseColor(summary.best, display)}>
          The single highest run.
          {summary.best > summary.highWhisker
            ? ` It's marked * because it's far above the usual range, which tops out at ${fmt(summary.highWhisker)}. Typical and Floor say more about a normal night.`
            : " It sits inside the usual range, so it's a fair picture of a good night."}
        </StatCard>

        <StatCard label="Floor" value={fmt(summary.floor)} color={parseColor(summary.floor, display)}>
          {belowFloor} of {runs.length} runs {belowFloor === 1 ? "is" : "are"} below {fmt(summary.floor)}, roughly 1 in 10. It shows how low an off night
          goes without letting the single worst run ({fmt(values[0])}) decide.
        </StatCard>

        <StatCard
          label="Recent"
          value={summary.recent === null ? "—" : fmt(summary.recent)}
          color={summary.recent === null ? undefined : parseColor(summary.recent, display)}
        >
          {summary.recent === null
            ? `It needs more than ${PERFORMANCE_RECENT_RUN_COUNT} runs, and ${player.name} has ${runs.length}.`
            : (
              <>
                The middle of the latest {PERFORMANCE_RECENT_RUN_COUNT} runs (ringed above).
                {Math.abs(recentDelta) < sameThreshold
                  ? " That's about the same as Typical, so lately is business as usual."
                  : ` That's ${fmt(Math.abs(recentDelta))} ${recentDelta > 0 ? "above" : "below"} Typical, so the latest nights are ${recentDelta > 0 ? "better" : "worse"} than usual.`}
              </>
            )}
        </StatCard>

        <StatCard
          label="Consistency"
          value={summary.consistency === null ? "—" : `${consistencyLabel(summary.consistency, summary.typical, display)} ±${fmt(summary.consistency / 2)}`}
        >
          {summary.consistency === null
            ? `It needs at least 3 runs, and ${player.name} has ${runs.length}.`
            : (
              <>
                The middle half of runs (shaded above) sits between {fmt(summary.lowerQuartile)} and {fmt(summary.upperQuartile)}.
                High means that band is within {bandRule}; anything wider is Low.
                {trendWidensBand && ` ${player.name} is ${perWeek > 0 ? "improving" : "declining"} about ${fmt(Math.abs(perWeek))} ${unit} a week, which on its own spreads the runs out, so a fast ${perWeek > 0 ? "improver" : "decline"} naturally reads as less consistent.`}
              </>
            )}
        </StatCard>

        <StatCard label="Outliers" value={String(summary.outliers.length)}>
          {summary.outliers.length === 0
            ? `None. Every run is inside the usual range of ${fmt(summary.lowWhisker)} to ${fmt(summary.highWhisker)}.`
            : `${listValues(summary.outliers.map(fmt))} ${summary.outliers.length === 1 ? "is" : "are"} far from the middle half: more than 1.5× its width away, and at least ${display === "parse" ? "10 parse points" : "10% of Typical"}. Outliers stay on the chart but barely move Typical or Consistency.`}
        </StatCard>
      </div>
    </div>
  );
}

function RunStrip({ runs, summary, display }: { runs: readonly ExplainedRun[]; summary: PerformanceSummary; display: PerformanceDisplayMode }) {
  const low = runs[0].value;
  const high = runs[runs.length - 1].value;
  const padding = Math.max((high - low) * 0.04, display === "parse" ? 1 : high * 0.01);
  const domainLow = low - padding;
  const domainHigh = high + padding;
  const position = (value: number) => ((value - domainLow) / (domainHigh - domainLow)) * 100;
  const fmt = (value: number) => formatStat(value, display);

  return (
    <div className="relative mt-7 mb-7 h-12">
      <span
        className="absolute inset-y-0 rounded-sm bg-white/10"
        style={{ left: `${position(summary.lowerQuartile)}%`, width: `${position(summary.upperQuartile) - position(summary.lowerQuartile)}%` }}
      />
      <StripMarker position={position(summary.floor)} label={`Floor ${fmt(summary.floor)}`} side="top" className="bg-rose-400/70" />
      <StripMarker position={position(summary.best)} label={`Best ${fmt(summary.best)}`} side="top" className="bg-amber-300/70" />
      <StripMarker position={position(summary.typical)} label={`Typical ${fmt(summary.typical)}`} side="bottom" className="bg-white" />
      {runs.map((run, index) => (
        <span
          key={run.id}
          title={fmt(run.value)}
          className={cn(
            "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
            run.outlier ? "border-2 border-amber-300 bg-transparent" : "bg-sky-300/80",
            run.recent && "ring-2 ring-white/80",
          )}
          style={{ left: `${position(run.value)}%`, top: `${50 + ((index % 3) - 1) * 25}%` }}
        />
      ))}
    </div>
  );
}

function StripMarker({ position, label, side, className }: { position: number; label: string; side: "top" | "bottom"; className: string }) {
  const align = position < 12 ? "translate-x-0" : position > 88 ? "-translate-x-full" : "-translate-x-1/2";
  return (
    <>
      <span className={cn("absolute inset-y-0 w-px", className)} style={{ left: `${position}%` }} />
      <span
        className={cn(
          "absolute font-mono text-[10px] whitespace-nowrap text-muted-foreground tabular-nums",
          side === "top" ? "-top-5" : "-bottom-5",
          align,
        )}
        style={{ left: `${position}%` }}
      >
        {label}
      </span>
    </>
  );
}

function StatCard({ label, value, color, children }: { label: string; value: string; color?: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-black/10 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="font-mono text-sm font-semibold tabular-nums" style={{ color }}>{value}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function parseColor(value: number, display: PerformanceDisplayMode) {
  return display === "parse" ? performanceParseColor(value) : undefined;
}

function listValues(values: readonly string[]) {
  if (values.length <= 4) return values.join(", ");
  return `${values.slice(0, 4).join(", ")} and ${values.length - 4} more`;
}
