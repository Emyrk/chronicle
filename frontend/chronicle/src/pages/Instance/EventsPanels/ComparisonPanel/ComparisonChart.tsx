/**
 * ComparisonChart – Full-width stacked horizontal bars comparing values from
 * multiple source panels per player.
 *
 * Visual styling matches PlayerMetricChart rows (same gradient, radius,
 * font sizes, spec icon, percentage column, etc.).
 */

import { useMemo } from "react";
import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { HintTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { formatNumber } from "@/lib/format";

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

const ROW_HEIGHT = 30;
const TOTAL_ROW_HEIGHT = 38;

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
  specialization: string;
  /** Value per source (aligned with sources array). */
  values: number[];
  total: number;
}

export function ComparisonChart({ sources }: ComparisonChartProps) {
  const { rows, sourceTotals, grandTotal, sourceColors, summedTotal } = useMemo(() => {
    const colors = sources.map(
      (s, i) => s.borderColor || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    );

    // Build per-player map
    const playerMap = new Map<
      string,
      { playerName: string; className: string; specialization: string; values: number[] }
    >();

    for (let si = 0; si < sources.length; si++) {
      for (const d of sources[si].data) {
        let entry = playerMap.get(d.playerID);
        if (!entry) {
          entry = {
            playerName: d.playerName,
            className: d.className,
            specialization: d.specialization,
            values: new Array(sources.length).fill(0) as number[],
          };
          playerMap.set(d.playerID, entry);
        }
        entry.values[si] += d.value;
      }
    }

    const built: PlayerRow[] = [];
    for (const [playerID, entry] of playerMap) {
      const total = entry.values.reduce((a, b) => a + b, 0);
      if (total === 0) continue;
      built.push({ playerID, playerName: entry.playerName, className: entry.className, specialization: entry.specialization, values: entry.values, total });
    }
    built.sort((a, b) => b.total - a.total);

    const sTotals = sources.map((_, si) =>
      built.reduce((sum, r) => sum + r.values[si], 0),
    );
    const gTotal = sTotals.reduce((a, b) => a + b, 0);

    // Scale so the max row fills ~75% of width (matching PlayerMetricChart)
    const maxRow = built[0]?.total ?? 1;
    const scaled = maxRow ? maxRow / 0.75 : 1;

    return { rows: built, sourceTotals: sTotals, grandTotal: gTotal, sourceColors: colors, summedTotal: scaled };
  }, [sources]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No data to compare
      </div>
    );
  }

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "4px" }}>
        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", padding: "0 12px 4px" }}>
          {sources.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--class-muted-foreground)" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: sourceColors[i],
                  flexShrink: 0,
                }}
              />
              {s.label}
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
        <div style={{ borderBottom: "1px solid oklch(0.5 0 0 / 0.15)", margin: "2px 0" }} />

        {/* Player rows */}
        {rows.map((row) => (
          <ComparisonRow
            key={row.playerID}
            row={row}
            maximumValue={summedTotal}
            grandTotal={grandTotal}
            sourceColors={sourceColors}
            sources={sources}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Stacked bar segments (shared between total and player rows)
// ---------------------------------------------------------------------------

interface SegmentLayout {
  index: number;
  leftPct: number;
  widthPct: number;
  value: number;
  sharePct: number;
}

function computeSegmentLayouts(values: number[], total: number, maximumValue: number): SegmentLayout[] {
  const segments: SegmentLayout[] = [];
  let offset = 0;
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const widthPct = (val / maximumValue) * 100;
    if (val > 0) {
      segments.push({
        index: i,
        leftPct: offset,
        widthPct,
        value: val,
        sharePct: total > 0 ? (val / total) * 100 : 0,
      });
    }
    offset += widthPct;
  }
  return segments;
}

function StackedBarSegments({
  values,
  total,
  maximumValue,
  sourceColors,
  sources,
}: {
  values: number[];
  total: number;
  maximumValue: number;
  sourceColors: string[];
  sources: ComparisonSource[];
}) {
  const segments = useMemo(
    () => computeSegmentLayouts(values, total, maximumValue),
    [values, total, maximumValue],
  );

  return (
    <>
      {segments.map((seg) => (
        <HintTooltip key={seg.index}>
          <TooltipTrigger asChild>
            <div
              style={{
                position: "absolute",
                left: `${seg.leftPct}%`,
                top: 0,
                bottom: 0,
                width: `${seg.widthPct}%`,
                background: `linear-gradient(to right, oklch(0 0 0 / 0.3), oklch(0 0 0 / 0.15)), ${sourceColors[seg.index]}`,
                opacity: 0.85,
                transition: "width 0.3s ease, left 0.3s ease",
              }}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {sources[seg.index].label}: {formatNumber(seg.value)} ({seg.sharePct.toFixed(1)}%)
          </TooltipContent>
        </HintTooltip>
      ))}
    </>
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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: TOTAL_ROW_HEIGHT,
        position: "relative",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        color: "var(--class-foreground)",
      }}
    >
      {/* Stacked bar segments */}
      <StackedBarSegments
        values={sourceTotals}
        total={grandTotal}
        maximumValue={grandTotal}
        sourceColors={sourceColors}
        sources={sources}
      />

      {/* Content overlay */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          width: "100%",
          padding: "0 12px",
          zIndex: 1,
        }}
      >
        <span style={{ flex: 1, fontSize: "13px", fontWeight: 600 }}>
          Total
        </span>

        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
          }}
        >
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
  maximumValue,
  grandTotal,
  sourceColors,
  sources,
}: {
  row: PlayerRow;
  maximumValue: number;
  grandTotal: number;
  sourceColors: string[];
  sources: ComparisonSource[];
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: ROW_HEIGHT,
        position: "relative",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        color: "var(--class-foreground)",
      }}
    >
      {/* Stacked bar segments */}
      <StackedBarSegments
        values={row.values}
        total={row.total}
        maximumValue={maximumValue}
        sourceColors={sourceColors}
        sources={sources}
      />

      {/* Content overlay (matches PlayerMetricRow layout) */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          width: "100%",
          padding: "0 12px",
          zIndex: 1,
        }}
      >
        {/* Spec icon */}
        <img
          src={`/icons/spec_${row.className.toLowerCase()}_${row.specialization.toLowerCase().replace(/\s+/g, "")}.png`}
          alt={row.specialization}
          style={{
            width: 20,
            height: 20,
            marginRight: 8,
            borderRadius: 2,
          }}
          onError={(e) => {
            const target = e.currentTarget;
            const classIcon = `/icons/class_${row.className.toLowerCase()}.png`;
            const unknownIcon = "/icons/class_unknown.png";
            if (target.src.endsWith(unknownIcon)) {
              target.style.display = "none";
            } else if (target.src.includes("/icons/class_")) {
              target.src = unknownIcon;
            } else {
              target.src = classIcon;
            }
          }}
        />

        {/* Player name */}
        <span
          style={{
            flex: 1,
            fontSize: "13px",
            fontWeight: 500,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.playerName}
        </span>

        {/* Total value */}
        <span
          style={{
            fontSize: "13px",
            fontWeight: 500,
            fontFamily: "var(--font-mono)",
          }}
        >
          {formatNumber(row.total)}
        </span>

        {/* Percentage of grand total */}
        <span
          style={{
            width: 50,
            textAlign: "right",
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--class-muted-foreground)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {((row.total / grandTotal) * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
