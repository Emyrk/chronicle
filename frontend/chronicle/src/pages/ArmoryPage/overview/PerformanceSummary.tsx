import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import type { CharacterPerformanceRun } from "@/api/typesGenerated";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { getClassColorVar } from "../types";
import type { ParseMetric } from "./util";
import type { PerformanceDisplayMode } from "./performanceComparisonState";
import {
  PERFORMANCE_RECENT_RUN_COUNT,
  performanceParseColor,
  summarizePerformanceRuns,
  type PerformanceSummary,
} from "./performanceExplorerModel";

export interface PerformanceSummaryPlayer {
  id: string;
  name: string;
  className: string;
  color: string;
  runs: readonly CharacterPerformanceRun[];
}

export type SummaryView = "numbers" | "boxplot";

interface SummaryRow {
  player: PerformanceSummaryPlayer;
  summary: PerformanceSummary | null;
}

// Players with fewer runs are shown but never marked as a column leader.
const MIN_COMPARABLE_RUNS = 3;

type StatKey = "best" | "typical" | "recent" | "floor" | "spread" | "averageDeaths";

interface StatColumn {
  key: StatKey;
  label: string;
  help: string;
  higherIsBetter: boolean;
}

const RUNS_HELP = `Runs matching the current filters. Players with fewer than ${MIN_COMPARABLE_RUNS} runs are shown but never highlighted.`;

const STAT_COLUMNS: readonly StatColumn[] = [
  {
    key: "best",
    label: "Best",
    help: "The single highest run. One great night can set it, so it is the least reliable number here.",
    higherIsBetter: true,
  },
  {
    key: "typical",
    label: "Typical",
    help: "The median run: half of the runs are better and half are worse. One unusually good or bad night barely moves it.",
    higherIsBetter: true,
  },
  {
    key: "recent",
    label: "Recent",
    help: `The median of the latest ${PERFORMANCE_RECENT_RUN_COUNT} runs. The marker beside it compares it with Typical: ▲ improving, ▼ declining, ≈ about the same.`,
    higherIsBetter: true,
  },
  {
    key: "floor",
    label: "Floor",
    help: "The 10th percentile: about 1 run in 10 is worse. It shows how low an off night goes without letting the single worst run decide.",
    higherIsBetter: true,
  },
  {
    key: "spread",
    label: "Spread",
    help: "The gap between the 25th and 75th percentile runs, which covers the middle half. Smaller means more consistent. Outliers don't affect it.",
    higherIsBetter: false,
  },
  {
    key: "averageDeaths",
    label: "Deaths",
    help: "Average deaths per run, and the average share of the fight spent alive.",
    higherIsBetter: false,
  },
];

/** Switches the summary between the numbers and the box plot. */
export function SummaryViewToggle({
  view,
  onChange,
  className,
}: {
  view: SummaryView;
  onChange: (view: SummaryView) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-black/20 p-0.5", className)} role="group" aria-label="Summary view">
      {(["numbers", "boxplot"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            view === option ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option === "numbers" ? "Numbers" : "Box plot"}
        </button>
      ))}
    </div>
  );
}

/** Headline stats for the runs currently charted, as numbers or a box plot. */
export function PerformanceSummaryPanel({
  players,
  metric,
  display,
  view,
}: {
  players: readonly PerformanceSummaryPlayer[];
  metric: ParseMetric;
  display: PerformanceDisplayMode;
  view: SummaryView;
}) {
  const rows: SummaryRow[] = players.map((player) => ({ player, summary: summarizePerformanceRuns(player.runs, metric, display) }));
  if (rows.every((row) => row.summary === null)) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-black/10">
      {view === "boxplot" ? (
        <SummaryBoxPlot rows={rows} display={display} />
      ) : rows.length === 1 ? (
        <SummaryStrip summary={rows[0].summary!} display={display} />
      ) : (
        <SummaryTable rows={rows} display={display} />
      )}
    </div>
  );
}

function StatLabel({ label, help, className }: { label: string; help: string; className?: string }) {
  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("inline-flex cursor-help items-center gap-1", className)}>
          {label}
          <CircleHelp className="size-3 opacity-50" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-left leading-relaxed">
        <div className="font-semibold">{label}</div>
        <div className="mt-0.5 text-zinc-300">{help}</div>
      </TooltipContent>
    </HintTooltip>
  );
}

function SummaryStrip({ summary, display }: { summary: PerformanceSummary; display: PerformanceDisplayMode }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4 xl:grid-cols-7">
      <SummaryTile label="Runs" help={RUNS_HELP}>
        <span className="text-foreground">{summary.runCount}</span>
      </SummaryTile>
      {STAT_COLUMNS.map((column) => (
        <SummaryTile key={column.key} label={column.label} help={column.help}>
          <StatValue summary={summary} column={column} display={display} showRecentDelta />
        </SummaryTile>
      ))}
    </div>
  );
}

function SummaryTile({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <StatLabel label={label} help={help} className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground" />
      <div className="mt-0.5 truncate font-mono text-lg font-semibold tabular-nums">{children}</div>
    </div>
  );
}

function SummaryTable({ rows, display }: { rows: readonly SummaryRow[]; display: PerformanceDisplayMode }) {
  const leaders = columnLeaders(rows.map((row) => row.summary));

  return (
    <div className="overflow-x-auto styled-scrollbar">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-3 py-2 text-left font-medium">Player</th>
            <th className="px-3 py-2 text-right font-medium"><StatLabel label="Runs" help={RUNS_HELP} /></th>
            {STAT_COLUMNS.map((column) => (
              <th key={column.key} className="px-3 py-2 text-right font-medium">
                <StatLabel label={column.label} help={column.help} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player, summary }) => {
            const lowSample = !summary || summary.runCount < MIN_COMPARABLE_RUNS;
            return (
              <tr key={player.id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <PlayerName player={player} />
                </td>
                <td className={cn("px-3 py-1.5 text-right font-mono tabular-nums", lowSample && "text-muted-foreground")}>
                  {summary?.runCount ?? 0}
                </td>
                {STAT_COLUMNS.map((column) => (
                  <td key={column.key} className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {summary ? (
                      <span
                        className={cn(
                          leaders[column.key] !== undefined
                            && summary[column.key] === leaders[column.key]
                            && !lowSample
                            && "font-semibold underline decoration-sky-400 decoration-2 underline-offset-4",
                        )}
                      >
                        <StatValue summary={summary} column={column} display={display} showRecentDelta />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlayerName({ player }: { player: PerformanceSummaryPlayer }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: player.color }} />
      <span className="truncate font-medium" style={{ color: getClassColorVar(player.className) }}>{player.name}</span>
    </span>
  );
}

function StatValue({
  summary,
  column,
  display,
  showRecentDelta = false,
}: {
  summary: PerformanceSummary;
  column: StatColumn;
  display: PerformanceDisplayMode;
  showRecentDelta?: boolean;
}) {
  if (column.key === "averageDeaths") {
    if (summary.averageDeaths === null) return <span className="text-muted-foreground">—</span>;
    return (
      <>
        {summary.averageDeaths.toFixed(1)}
        {summary.averageAlive !== null && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{Math.round(summary.averageAlive)}% alive</span>
        )}
      </>
    );
  }

  const value = summary[column.key];
  if (value === null) {
    return <span className="text-muted-foreground" title={`Needs more than ${PERFORMANCE_RECENT_RUN_COUNT} runs`}>—</span>;
  }
  if (column.key === "spread") return <>{formatStat(value, display)}</>;

  const delta = column.key === "recent" ? value - summary.typical : 0;
  const deltaThreshold = display === "parse" ? 0.5 : summary.typical * 0.01;
  return (
    <>
      <span style={{ color: display === "parse" ? performanceParseColor(value) : undefined }}>{formatStat(value, display)}</span>
      {column.key === "best" && summary.best > summary.highWhisker && <OutlierMark />}
      {showRecentDelta && column.key === "recent" && (
        Math.abs(delta) >= deltaThreshold ? (
          <span className={cn("ml-1.5 text-xs font-normal", delta > 0 ? "text-emerald-400" : "text-rose-400")}>
            {delta > 0 ? "▲" : "▼"} {formatStat(Math.abs(delta), display)}
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground" title="About the same as Typical">≈</span>
        )
      )}
    </>
  );
}

function OutlierMark() {
  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <sup tabIndex={0} className="ml-0.5 cursor-help font-sans text-[10px] font-semibold text-amber-300 no-underline">outlier</sup>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-left leading-relaxed">
        This best run is far above the player's usual range, so Typical and Floor are better guides to what they normally do.
      </TooltipContent>
    </HintTooltip>
  );
}

function SummaryBoxPlot({ rows, display }: { rows: readonly SummaryRow[]; display: PerformanceDisplayMode }) {
  const summaries = rows.flatMap((row) => row.summary ? [row.summary] : []);
  const low = Math.min(...summaries.flatMap((summary) => [summary.lowWhisker, ...summary.outliers]));
  const high = Math.max(...summaries.flatMap((summary) => [summary.highWhisker, ...summary.outliers]));
  const padding = Math.max((high - low) * 0.05, display === "parse" ? 1 : high * 0.01);
  const domainLow = display === "parse" ? Math.max(0, low - padding) : low - padding;
  const domainHigh = display === "parse" ? Math.min(100, high + padding) : high + padding;
  const position = (value: number) => ((value - domainLow) / (domainHigh - domainLow)) * 100;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => domainLow + (domainHigh - domainLow) * step);

  return (
    <div className="space-y-1 px-3 py-3">
      {rows.map(({ player, summary }) => (
        <div key={player.id} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <PlayerName player={player} />
          {summary ? (
            <BoxPlotRow player={player} summary={summary} display={display} position={position} />
          ) : (
            <span className="text-xs text-muted-foreground">No runs match these filters.</span>
          )}
        </div>
      ))}
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <span />
        <div className="relative h-4 border-t border-border/60">
          {ticks.map((tick, index) => (
            <span
              key={tick}
              className={cn(
                "absolute top-0.5 font-mono text-[10px] text-muted-foreground tabular-nums",
                index === 0 ? "" : index === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${position(tick)}%` }}
            >
              {display === "parse" ? Math.round(tick) : Math.round(tick).toLocaleString()}
            </span>
          ))}
        </div>
      </div>
      <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground/80">
        Box: the middle half of runs. Line in the box: Typical (median). Whiskers: the usual range.
        Hollow dots: outliers, runs far outside the usual range. Hover a row for its numbers.
      </p>
    </div>
  );
}

function BoxPlotRow({
  player,
  summary,
  display,
  position,
}: {
  player: PerformanceSummaryPlayer;
  summary: PerformanceSummary;
  display: PerformanceDisplayMode;
  position: (value: number) => number;
}) {
  const lowSample = summary.runCount < MIN_COMPARABLE_RUNS;
  const boxLeft = position(summary.lowerQuartile);
  const boxWidth = position(summary.upperQuartile) - boxLeft;
  const whiskerLeft = position(summary.lowWhisker);
  const whiskerRight = position(summary.highWhisker);

  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className={cn("relative h-7 cursor-help rounded hover:bg-white/5", lowSample && "opacity-50")}
          aria-label={`${player.name}: typical ${formatStat(summary.typical, display)}, middle half ${formatStat(summary.lowerQuartile, display)} to ${formatStat(summary.upperQuartile, display)}`}
        >
          <span
            className="absolute top-1/2 h-px -translate-y-1/2"
            style={{ left: `${whiskerLeft}%`, width: `${whiskerRight - whiskerLeft}%`, backgroundColor: player.color }}
          />
          <span className="absolute top-2 bottom-2 w-px" style={{ left: `${whiskerLeft}%`, backgroundColor: player.color }} />
          <span className="absolute top-2 bottom-2 w-px" style={{ left: `${whiskerRight}%`, backgroundColor: player.color }} />
          <span
            className="absolute top-1 bottom-1 rounded-sm border"
            style={{
              left: `${boxLeft}%`,
              width: `max(${boxWidth}%, 2px)`,
              borderColor: player.color,
              backgroundColor: `color-mix(in srgb, ${player.color} 25%, transparent)`,
            }}
          />
          <span className="absolute top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${position(summary.typical)}%` }} />
          {summary.outliers.map((outlier, index) => (
            <span
              key={`${outlier}-${index}`}
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ left: `${position(outlier)}%`, borderColor: player.color }}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-left">
        <div className="mb-1 font-semibold">{player.name} · {summary.runCount} runs</div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 font-mono tabular-nums">
          <dt className="font-sans text-zinc-400">Best</dt><dd className="text-right">{formatStat(summary.best, display)}</dd>
          <dt className="font-sans text-zinc-400">Top of box (75th pct)</dt><dd className="text-right">{formatStat(summary.upperQuartile, display)}</dd>
          <dt className="font-sans text-zinc-400">Typical (median)</dt><dd className="text-right">{formatStat(summary.typical, display)}</dd>
          <dt className="font-sans text-zinc-400">Bottom of box (25th pct)</dt><dd className="text-right">{formatStat(summary.lowerQuartile, display)}</dd>
          <dt className="font-sans text-zinc-400">Usual range</dt><dd className="text-right">{formatStat(summary.lowWhisker, display)}–{formatStat(summary.highWhisker, display)}</dd>
          <dt className="font-sans text-zinc-400">Outliers</dt><dd className="text-right">{summary.outliers.length === 0 ? "none" : summary.outliers.map((value) => formatStat(value, display)).join(", ")}</dd>
        </dl>
        {lowSample && <div className="mt-1 text-amber-300">Fewer than {MIN_COMPARABLE_RUNS} runs, so treat this with caution.</div>}
      </TooltipContent>
    </HintTooltip>
  );
}

function columnLeaders(summaries: readonly (PerformanceSummary | null)[]): Partial<Record<StatKey, number>> {
  const eligible = summaries.filter((summary): summary is PerformanceSummary => (
    summary !== null && summary.runCount >= MIN_COMPARABLE_RUNS
  ));
  if (eligible.length < 2) return {};

  const leaders: Partial<Record<StatKey, number>> = {};
  for (const column of STAT_COLUMNS) {
    const values = eligible.flatMap((summary) => summary[column.key] ?? []);
    if (values.length < 2) continue;
    leaders[column.key] = column.higherIsBetter ? Math.max(...values) : Math.min(...values);
  }
  return leaders;
}

function formatStat(value: number, display: PerformanceDisplayMode) {
  return display === "parse" ? value.toFixed(1) : Math.round(value).toLocaleString();
}
