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

interface ExplainedPlayer {
  player: NumbersExplainerPlayer;
  summary: PerformanceSummary;
  /** Ascending by value. */
  runs: ExplainedRun[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Vertical distance between stacked dots, in pixels. */
const LANE_PX = 9;
/** Dots closer than this (percent of the strip width) stack instead of overlapping. */
const MIN_DOT_GAP = 1.4;
const LANES = [0, -1, 1, -2, 2, -3, 3, -4, 4];

/**
 * Teaches the summary stats with the charted runs: a dot timeline per player on a
 * shared axis, and stat-by-stat cards for the selected player.
 */
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
  const explained = players.flatMap((player) => {
    const result = explainPlayer(player, metric, display);
    return result ? [result] : [];
  });
  if (explained.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        No runs match these filters, so there is nothing to explain yet.
      </div>
    );
  }

  const selected = explained.find((item) => item.player.id === selectedId) ?? explained[0];
  const single = players.length === 1;
  const unit = display === "parse" ? "parse" : metric.toUpperCase();
  const scale = sharedScale(explained.flatMap((item) => item.runs.map((run) => run.value)), display);
  const fmt = (value: number) => formatStat(value, display);
  const legendColor = getClassColorVar(selected.player.className);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-black/10 px-4 pt-3 pb-2">
        <div className="text-sm text-muted-foreground">
          {single ? (
            <>
              <PlayerNameText player={selected.player} />: all {selected.runs.length} runs in range, lowest to highest {unit}
            </>
          ) : (
            <>Every run in range for each player, lowest to highest {unit}. Click a player to explain their numbers below.</>
          )}
        </div>

        {single ? (
          <div className="mt-7 mb-7">
            <RunStrip item={selected} position={scale.position} display={display} labeled />
          </div>
        ) : (
          <div className="mt-3 space-y-1">
            {explained.map((item) => (
              <div key={item.player.id} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <button
                  type="button"
                  aria-pressed={item === selected}
                  onClick={() => setSelectedId(item.player.id)}
                  className={cn(
                    "min-w-0 rounded-md px-2 py-1 text-left transition-colors",
                    item === selected ? "bg-white/10" : "hover:bg-white/5",
                  )}
                >
                  <span className="block truncate text-sm font-medium"><PlayerNameText player={item.player} /></span>
                  <span className="block font-mono text-[11px] text-muted-foreground tabular-nums">Typical {fmt(item.summary.typical)}</span>
                </button>
                <RunStrip item={item} position={scale.position} display={display} />
              </div>
            ))}
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <span />
              <div className="relative h-4 border-t border-border/60">
                {scale.ticks.map((tick, index) => (
                  <span
                    key={tick}
                    className={cn(
                      "absolute top-0.5 font-mono text-[10px] text-muted-foreground tabular-nums",
                      index === 0 ? "" : index === scale.ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                    )}
                    style={{ left: `${scale.position(tick)}%` }}
                  >
                    {display === "parse" ? Math.round(tick) : Math.round(tick).toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: legendColor }} />Run</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full ring-2 ring-white/80" style={{ backgroundColor: legendColor }} />Latest {PERFORMANCE_RECENT_RUN_COUNT}</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full border-2 border-amber-300" />Outlier</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-white/10" />Middle half of runs</span>
          {!single && (
            <>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-rose-400/70" />Floor</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-white" />Typical</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-amber-300/70" />Best</span>
            </>
          )}
        </div>
      </div>

      {!single && (
        <div className="text-sm font-semibold">
          <PlayerNameText player={selected.player} />'s numbers
        </div>
      )}
      <StatCards item={selected} metric={metric} display={display} />
    </div>
  );
}

function explainPlayer(player: NumbersExplainerPlayer, metric: ParseMetric, display: PerformanceDisplayMode): ExplainedPlayer | null {
  const summary = summarizePerformanceRuns(player.runs, metric, display);
  if (!summary) return null;
  const latestIds = new Set([...player.runs]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, PERFORMANCE_RECENT_RUN_COUNT)
    .map((run) => run.run_id));
  const outliers = new Set(summary.outliers);
  const runs = player.runs
    .map((run) => {
      const value = performanceValue(run, metric, display);
      return { id: run.run_id, value, recent: latestIds.has(run.run_id), outlier: outliers.has(value) };
    })
    .sort((a, b) => a.value - b.value);
  return { player, summary, runs };
}

function sharedScale(values: readonly number[], display: PerformanceDisplayMode) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = Math.max((high - low) * 0.04, display === "parse" ? 1 : high * 0.01);
  const domainLow = low - padding;
  const domainHigh = high + padding;
  return {
    position: (value: number) => ((value - domainLow) / (domainHigh - domainLow)) * 100,
    ticks: [0, 0.25, 0.5, 0.75, 1].map((step) => domainLow + (domainHigh - domainLow) * step),
  };
}

/** Puts each dot on the center line unless it would overlap the previous dot there, then stacks it outward. */
function assignLanes(positions: readonly number[]): number[] {
  const lastInLane = new Map<number, number>();
  return positions.map((x) => {
    const lane = LANES.find((candidate) => {
      const last = lastInLane.get(candidate);
      return last === undefined || x - last >= MIN_DOT_GAP;
    }) ?? LANES[LANES.length - 1];
    lastInLane.set(lane, x);
    return lane;
  });
}

function RunStrip({
  item,
  position,
  display,
  labeled = false,
}: {
  item: ExplainedPlayer;
  position: (value: number) => number;
  display: PerformanceDisplayMode;
  labeled?: boolean;
}) {
  const { summary, runs } = item;
  const color = getClassColorVar(item.player.className);
  const fmt = (value: number) => formatStat(value, display);
  const lanes = assignLanes(runs.map((run) => position(run.value)));
  const reach = Math.max(1, ...lanes.map((lane) => Math.abs(lane)));
  const height = (reach * 2 + 1) * LANE_PX + 8;

  return (
    <div className="relative" style={{ height }}>
      <span
        className="absolute inset-y-0 rounded-sm bg-white/10"
        style={{ left: `${position(summary.lowerQuartile)}%`, width: `${position(summary.upperQuartile) - position(summary.lowerQuartile)}%` }}
      />
      <StripMarker position={position(summary.floor)} label={labeled ? `Floor ${fmt(summary.floor)}` : undefined} side="top" className="bg-rose-400/70" />
      <StripMarker position={position(summary.best)} label={labeled ? `Best ${fmt(summary.best)}` : undefined} side="top" className="bg-amber-300/70" />
      <StripMarker position={position(summary.typical)} label={labeled ? `Typical ${fmt(summary.typical)}` : undefined} side="bottom" className="bg-white" />
      {runs.map((run, index) => (
        <span
          key={run.id}
          title={fmt(run.value)}
          className={cn(
            "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
            run.outlier ? "border-2 border-amber-300 bg-transparent" : "opacity-85",
            run.recent && "ring-2 ring-white/80",
          )}
          style={{
            left: `${position(run.value)}%`,
            top: `calc(50% + ${lanes[index] * LANE_PX}px)`,
            backgroundColor: run.outlier ? undefined : color,
          }}
        />
      ))}
    </div>
  );
}

function StripMarker({ position, label, side, className }: { position: number; label?: string; side: "top" | "bottom"; className: string }) {
  const align = position < 12 ? "translate-x-0" : position > 88 ? "-translate-x-full" : "-translate-x-1/2";
  return (
    <>
      <span className={cn("absolute inset-y-0 w-px", className)} style={{ left: `${position}%` }} />
      {label && (
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
      )}
    </>
  );
}

function StatCards({ item, metric, display }: { item: ExplainedPlayer; metric: ParseMetric; display: PerformanceDisplayMode }) {
  const { player, summary, runs } = item;
  const fmt = (value: number) => formatStat(value, display);
  const unit = display === "parse" ? "parse" : metric.toUpperCase();
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
  );
}

function PlayerNameText({ player }: { player: NumbersExplainerPlayer }) {
  return <span className="font-medium" style={{ color: getClassColorVar(player.className) }}>{player.name}</span>;
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
