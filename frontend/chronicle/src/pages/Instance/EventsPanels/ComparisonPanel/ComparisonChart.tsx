/**
 * ComparisonChart – Full-width stacked horizontal bars comparing values from
 * multiple source panels per player.
 */

import { useMemo } from "react";
import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { HintTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Default palette when a source panel has no border color. */
const FALLBACK_COLORS = [
  "#60a5fa", // blue-400
  "#f87171", // red-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#a78bfa", // violet-400
  "#fb923c", // orange-400
  "#2dd4bf", // teal-400
  "#f472b6", // pink-400
];

export interface ComparisonSource {
  label: string;
  borderColor: string | null;
  data: PlayerMetricChartData[];
}

export interface ComparisonChartProps {
  sources: ComparisonSource[];
}

interface PlayerRow {
  playerID: string;
  playerName: string;
  className: string;
  /** Value per source (aligned with sources array). */
  values: number[];
  total: number;
}

export function ComparisonChart({ sources }: ComparisonChartProps) {
  const { rows, sourceTotals, grandTotal, sourceColors } = useMemo(() => {
    // Assign colors
    const colors = sources.map(
      (s, i) => s.borderColor || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    );

    // Build per-player map: playerID → { name, class, values[] }
    const playerMap = new Map<
      string,
      { playerName: string; className: string; values: number[] }
    >();

    for (let si = 0; si < sources.length; si++) {
      for (const d of sources[si].data) {
        let entry = playerMap.get(d.playerID);
        if (!entry) {
          entry = {
            playerName: d.playerName,
            className: d.className,
            values: new Array(sources.length).fill(0) as number[],
          };
          playerMap.set(d.playerID, entry);
        }
        entry.values[si] += d.value;
      }
    }

    // Build sorted rows
    const built: PlayerRow[] = [];
    for (const [playerID, entry] of playerMap) {
      const total = entry.values.reduce((a, b) => a + b, 0);
      if (total === 0) continue;
      built.push({ playerID, playerName: entry.playerName, className: entry.className, values: entry.values, total });
    }
    built.sort((a, b) => b.total - a.total);

    // Source totals
    const sTotals = sources.map((_, si) =>
      built.reduce((sum, r) => sum + r.values[si], 0),
    );
    const gTotal = sTotals.reduce((a, b) => a + b, 0);

    return { rows: built, sourceTotals: sTotals, grandTotal: gTotal, sourceColors: colors };
  }, [sources]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No data to compare
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 px-1">
        {sources.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: sourceColors[i] }}
            />
            <span className="truncate max-w-[140px]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Grand total row */}
      <TotalRow
        sourceColors={sourceColors}
        sourceTotals={sourceTotals}
        grandTotal={grandTotal}
        sources={sources}
      />

      {/* Divider */}
      <div className="border-b border-border/50 my-1" />

      {/* Player rows */}
      <div className="flex flex-col">
        {rows.map((row) => (
          <ComparisonRow
            key={row.playerID}
            row={row}
            maxTotal={rows[0].total}
            sourceColors={sourceColors}
            sources={sources}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Total row
// ---------------------------------------------------------------------------

function TotalRow({
  sourceColors,
  sourceTotals,
  grandTotal,
  sources,
}: {
  sourceColors: string[];
  sourceTotals: number[];
  grandTotal: number;
  sources: ComparisonSource[];
}) {
  if (grandTotal === 0) return null;

  return (
    <div className="relative flex items-center h-10 rounded-md overflow-hidden bg-muted/30">
      {/* Stacked bar */}
      <div className="absolute inset-0 flex">
        {sourceTotals.map((val, i) => {
          const pct = (val / grandTotal) * 100;
          if (pct === 0) return null;
          return (
            <HintTooltip key={i}>
              <TooltipTrigger asChild>
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(to right, oklch(0 0 0 / 0.2), oklch(0 0 0 / 0.08)), ${sourceColors[i]}`,
                    opacity: 0.85,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {sources[i].label}: {formatNumber(val)} ({pct.toFixed(1)}%)
              </TooltipContent>
            </HintTooltip>
          );
        })}
      </div>

      {/* Overlay text */}
      <div className="relative z-10 flex items-center justify-between w-full px-2">
        <span className="text-sm font-semibold" style={{ color: "var(--class-foreground)" }}>
          Total
        </span>
        <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--class-foreground)" }}>
          {formatNumber(grandTotal)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player row
// ---------------------------------------------------------------------------

function ComparisonRow({
  row,
  maxTotal,
  sourceColors,
  sources,
}: {
  row: PlayerRow;
  maxTotal: number;
  sourceColors: string[];
  sources: ComparisonSource[];
}) {
  const barWidth = maxTotal > 0 ? (row.total / maxTotal) * 100 : 0;

  return (
    <div className={cn("relative flex items-center rounded-sm overflow-hidden")} style={{ height: 30 }}>
      {/* Background bar container — scaled to player's proportion of max */}
      <div className="absolute inset-y-0 left-0 flex" style={{ width: `${barWidth}%` }}>
        {row.values.map((val, i) => {
          const pct = row.total > 0 ? (val / row.total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <HintTooltip key={i}>
              <TooltipTrigger asChild>
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(to right, oklch(0 0 0 / 0.25), oklch(0 0 0 / 0.1)), ${sourceColors[i]}`,
                    opacity: 0.8,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {sources[i].label}: {formatNumber(val)} ({pct.toFixed(1)}%)
              </TooltipContent>
            </HintTooltip>
          );
        })}
      </div>

      {/* Overlay text */}
      <div className="relative z-10 flex items-center justify-between w-full px-2">
        <span className="text-xs truncate max-w-[60%]" style={{ color: `var(--class-${row.className.toLowerCase()})` }}>
          {row.playerName}
        </span>
        <span className="text-xs tabular-nums" style={{ color: "var(--class-foreground)" }}>
          {formatNumber(row.total)}
        </span>
      </div>
    </div>
  );
}
