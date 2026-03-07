/**
 * ComparisonChart – Full-width stacked horizontal bars comparing values from
 * multiple source panels per player.
 *
 * Each row fills the full width; stacked segments show proportional split.
 * Hovering a row reveals a breakout with per-source value + percentage.
 * Visual styling matches PlayerMetricChart (gradient, radius, font, icons).
 */

import { useMemo } from "react";
import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
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
  const { rows, sourceTotals, grandTotal, sourceColors } = useMemo(() => {
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
// Stacked bar segments (full-width — values sum to total which fills 100%)
// ---------------------------------------------------------------------------

interface SegmentLayout {
  index: number;
  leftPct: number;
  widthPct: number;
  value: number;
  sharePct: number;
}

function computeSegmentLayouts(values: number[], total: number): SegmentLayout[] {
  if (total === 0) return [];
  const segments: SegmentLayout[] = [];
  let offset = 0;
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const widthPct = (val / total) * 100;
    if (val > 0) {
      segments.push({
        index: i,
        leftPct: offset,
        widthPct,
        value: val,
        sharePct: (val / total) * 100,
      });
    }
    offset += widthPct;
  }
  return segments;
}

function StackedBarSegments({
  values,
  total,
  sourceColors,
}: {
  values: number[];
  total: number;
  sourceColors: string[];
}) {
  const segments = useMemo(
    () => computeSegmentLayouts(values, total),
    [values, total],
  );

  return (
    <>
      {segments.map((seg) => (
        <div
          key={seg.index}
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
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Breakout content (shown on hover)
// ---------------------------------------------------------------------------

function BreakoutTable({
  values,
  total,
  sourceColors,
  sources,
}: {
  values: number[];
  total: number;
  sourceColors: string[];
  sources: ComparisonSource[];
}) {
  return (
    <div style={{ padding: "8px 12px", minWidth: 220 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <tbody>
          {values.map((val, i) => {
            if (val === 0) return null;
            const pct = total > 0 ? (val / total) * 100 : 0;
            return (
              <tr key={i}>
                <td style={{ paddingRight: 8, paddingTop: 3, paddingBottom: 3 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: sourceColors[i],
                      marginRight: 6,
                      verticalAlign: "middle",
                    }}
                  />
                  {sources[i].label}
                </td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", paddingRight: 8 }}>
                  {formatNumber(val)}
                </td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--class-muted-foreground)" }}>
                  {pct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "1px solid oklch(0.5 0 0 / 0.15)" }}>
            <td style={{ paddingTop: 4, fontWeight: 600 }}>Total</td>
            <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, paddingTop: 4, paddingRight: 8 }}>
              {formatNumber(total)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
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

  const rowContent = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: TOTAL_ROW_HEIGHT,
        position: "relative",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        color: "var(--class-foreground)",
        cursor: "default",
      }}
    >
      <StackedBarSegments values={sourceTotals} total={grandTotal} sourceColors={sourceColors} />

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

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0} disableHoverableContent>
        <TooltipTrigger asChild>
          {rowContent}
        </TooltipTrigger>
        <TooltipContent
          align="start"
          hideArrow
          className="p-0 bg-popover text-foreground border"
        >
          <BreakoutTable
            values={sourceTotals}
            total={grandTotal}
            sourceColors={sourceColors}
            sources={sources}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Player row
// ---------------------------------------------------------------------------

function ComparisonRow({
  row,
  grandTotal,
  sourceColors,
  sources,
}: {
  row: PlayerRow;
  grandTotal: number;
  sourceColors: string[];
  sources: ComparisonSource[];
}) {
  const rowContent = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: ROW_HEIGHT,
        position: "relative",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        color: "var(--class-foreground)",
        cursor: "default",
      }}
    >
      {/* Full-width stacked segments (proportional to player's own total) */}
      <StackedBarSegments values={row.values} total={row.total} sourceColors={sourceColors} />

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

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0} disableHoverableContent>
        <TooltipTrigger asChild>
          {rowContent}
        </TooltipTrigger>
        <TooltipContent
          align="start"
          hideArrow
          className="p-0 bg-popover text-foreground border"
        >
          {/* Header */}
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img
                src={`/icons/spec_${row.className.toLowerCase()}_${row.specialization.toLowerCase().replace(/\s+/g, "")}.png`}
                alt={row.specialization}
                style={{ width: 16, height: 16, borderRadius: 2 }}
                onError={(e) => {
                  const target = e.currentTarget;
                  target.src = `/icons/class_${row.className.toLowerCase()}.png`;
                }}
              />
              <span style={{ fontWeight: 500, fontSize: "13px" }}>{row.playerName}</span>
              <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--muted-foreground)" }}>
                {row.className}
              </span>
            </div>
          </div>
          <BreakoutTable
            values={row.values}
            total={row.total}
            sourceColors={sourceColors}
            sources={sources}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
