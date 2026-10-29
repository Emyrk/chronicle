import type { ReactNode } from "react";
import type { CharacterPerformanceRun } from "@/api/typesGenerated";
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

// Players with fewer runs are shown but never marked as a column leader.
const MIN_COMPARABLE_RUNS = 3;

type StatKey = "best" | "typical" | "recent" | "floor" | "spread" | "averageDeaths";

interface StatColumn {
  key: StatKey;
  label: string;
  description: string;
  higherIsBetter: boolean;
}

const STAT_COLUMNS: readonly StatColumn[] = [
  { key: "best", label: "Best", description: "Highest run in range", higherIsBetter: true },
  { key: "typical", label: "Typical", description: "Median run", higherIsBetter: true },
  { key: "recent", label: "Recent", description: `Median of the latest ${PERFORMANCE_RECENT_RUN_COUNT} runs`, higherIsBetter: true },
  { key: "floor", label: "Floor", description: "10th percentile run, a typical bad night", higherIsBetter: true },
  { key: "spread", label: "Spread", description: "Range of the middle half of runs. Lower is more consistent.", higherIsBetter: false },
  { key: "averageDeaths", label: "Deaths", description: "Average deaths per run, and average time alive", higherIsBetter: false },
];

/** Headline stats for the runs currently charted: a strip for one player, a table when comparing. */
export function PerformanceSummaryPanel({
  players,
  metric,
  display,
}: {
  players: readonly PerformanceSummaryPlayer[];
  metric: ParseMetric;
  display: PerformanceDisplayMode;
}) {
  const rows = players.map((player) => ({ player, summary: summarizePerformanceRuns(player.runs, metric, display) }));
  if (rows.every((row) => row.summary === null)) return null;

  if (rows.length === 1) {
    return <SummaryStrip summary={rows[0].summary!} display={display} />;
  }
  return <SummaryTable rows={rows} display={display} />;
}

function SummaryStrip({ summary, display }: { summary: PerformanceSummary; display: PerformanceDisplayMode }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-lg border border-border/60 bg-black/10 px-4 py-3 sm:grid-cols-4 xl:grid-cols-7">
      <SummaryTile label="Runs" description="Runs matching the current filters">
        <span className="text-foreground">{summary.runCount}</span>
      </SummaryTile>
      {STAT_COLUMNS.map((column) => (
        <SummaryTile key={column.key} label={column.label} description={column.description}>
          <StatValue summary={summary} column={column} display={display} showRecentDelta />
        </SummaryTile>
      ))}
    </div>
  );
}

function SummaryTile({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="min-w-0" title={description}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-mono text-lg font-semibold tabular-nums">{children}</div>
    </div>
  );
}

function SummaryTable({
  rows,
  display,
}: {
  rows: readonly { player: PerformanceSummaryPlayer; summary: PerformanceSummary | null }[];
  display: PerformanceDisplayMode;
}) {
  const leaders = columnLeaders(rows.map((row) => row.summary));

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 bg-black/10 styled-scrollbar">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-3 py-2 text-left font-medium">Player</th>
            <th className="px-3 py-2 text-right font-medium" title="Runs matching the current filters">Runs</th>
            {STAT_COLUMNS.map((column) => (
              <th key={column.key} className="px-3 py-2 text-right font-medium" title={column.description}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ player, summary }) => {
            const lowSample = !summary || summary.runCount < MIN_COMPARABLE_RUNS;
            return (
              <tr key={player.id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: player.color }} />
                    <span className="font-medium" style={{ color: getClassColorVar(player.className) }}>{player.name}</span>
                  </span>
                </td>
                <td
                  className={cn("px-3 py-1.5 text-right font-mono tabular-nums", lowSample && "text-muted-foreground")}
                  title={lowSample ? `Fewer than ${MIN_COMPARABLE_RUNS} runs, so this player is not highlighted` : undefined}
                >
                  {summary?.runCount ?? 0}
                </td>
                {STAT_COLUMNS.map((column) => (
                  <td key={column.key} className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {summary ? (
                      <span
                        className={cn(
                          leaders[column.key] !== undefined
                            && summary[column.key] === leaders[column.key]
                            && summary.runCount >= MIN_COMPARABLE_RUNS
                            && "font-semibold underline decoration-sky-400 decoration-2 underline-offset-4",
                        )}
                      >
                        <StatValue summary={summary} column={column} display={display} />
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
      {showRecentDelta && Math.abs(delta) >= deltaThreshold && (
        <span className={cn("ml-1.5 text-xs font-normal", delta > 0 ? "text-emerald-400" : "text-rose-400")}>
          {delta > 0 ? "▲" : "▼"} {formatStat(Math.abs(delta), display)}
        </span>
      )}
    </>
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
