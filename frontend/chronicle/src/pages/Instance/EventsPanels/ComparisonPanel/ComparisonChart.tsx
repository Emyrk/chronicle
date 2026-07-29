/**
 * ComparisonChart – Full-width stacked horizontal bars comparing values from
 * multiple source panels per player.
 *
 * Each row fills the full width; stacked segments show proportional split.
 * Hovering a row reveals a breakout with per-source value + percentage.
 * Clicking a row pins the breakout as a draggable panel (desktop) or modal (mobile).
 * Visual styling matches PlayerMetricChart (gradient, radius, font, icons).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { usePortalContainer } from "@/components/ui/PortalContainerContext";
import { GripHorizontal, X } from "lucide-react";
import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { useIsMobile } from "@/hooks/useIsMobile";
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
  matchedOnly?: boolean;
  perSecond?: boolean;
  durationMs?: number;
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

export function ComparisonChart({ sources, matchedOnly, perSecond, durationMs }: ComparisonChartProps) {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const handleTogglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
      if (matchedOnly && entry.values.some((v) => v === 0)) continue;
      built.push({ playerID, playerName: entry.playerName, className: entry.className, specialization: entry.specialization, values: entry.values, total });
    }
    built.sort((a, b) => b.total - a.total);

    // Apply per-second conversion when enabled
    const durationSecs = perSecond && durationMs ? durationMs / 1000 : 0;
    if (durationSecs > 0) {
      for (const row of built) {
        for (let i = 0; i < row.values.length; i++) {
          row.values[i] /= durationSecs;
        }
        row.total /= durationSecs;
      }
    }

    const sTotals = sources.map((_, si) =>
      built.reduce((sum, r) => sum + r.values[si], 0),
    );
    const gTotal = sTotals.reduce((a, b) => a + b, 0);

    return { rows: built, sourceTotals: sTotals, grandTotal: gTotal, sourceColors: colors };
  }, [sources, matchedOnly, perSecond, durationMs]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No data to compare
      </div>
    );
  }

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "4px 10px 4px 4px" }}>
        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", padding: "0 12px 4px" }}>
          {sources.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--color-class-muted-foreground)" }}>
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
          isPinned={pinnedIds.has("__total__")}
          onTogglePin={() => handleTogglePin("__total__")}
          showMidLine={sources.length === 2}
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
            isPinned={pinnedIds.has(row.playerID)}
            onTogglePin={() => handleTogglePin(row.playerID)}
            showMidLine={sources.length === 2}
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

/** Thin vertical line at 50% — only shown when comparing exactly 2 sources. */
function MidLine() {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: 0,
        bottom: 0,
        width: 1,
        background: "oklch(1 0 0 / 0.25)",
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
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
  // Default baseline is the first non-zero source; hover changes it.
  const firstNonZeroIdx = values.findIndex((v) => v > 0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const baselineIdx = hoveredIdx ?? firstNonZeroIdx;
  const baselineVal = baselineIdx >= 0 ? values[baselineIdx] : 0;

  // Show diff column only when 2+ sources have data
  const nonZeroCount = values.filter((v) => v > 0).length;
  const showDiff = nonZeroCount >= 2;

  // Fixed-width column styles to prevent layout shift on hover-rebase.
  // Sized for: value up to -999.9M, share up to 100.0%, abs diff up to -999.9M, rel diff up to -9999.9%
  const COL_VALUE: CSSProperties = { textAlign: "right", fontFamily: "var(--font-mono)", paddingRight: 8, minWidth: 58 };
  const COL_SHARE: CSSProperties = { textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--color-class-muted-foreground)", minWidth: 52 };
  const diffCol = (diff: number): CSSProperties => ({
    textAlign: "right",
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    paddingLeft: 8,
    minWidth: 62,
    color: diff > 0 ? "oklch(0.65 0.15 145)" : diff < 0 ? "oklch(0.65 0.15 25)" : "var(--color-class-muted-foreground)",
  });

  return (
    <div style={{ padding: "8px 12px", minWidth: 220 }}>
      <table style={{ borderCollapse: "collapse", fontSize: "12px", tableLayout: "auto" }}>
        <tbody>
          {values.map((val, i) => {
            if (val === 0) return null;
            const pct = total > 0 ? (val / total) * 100 : 0;
            const isBaseline = i === baselineIdx;
            const absDiff = val - baselineVal;
            const relDiff = baselineVal > 0 ? ((val - baselineVal) / baselineVal) * 100 : 0;
            return (
              <tr
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  cursor: showDiff ? "default" : undefined,
                  background: isBaseline && showDiff ? "oklch(0.5 0 0 / 0.06)" : undefined,
                  borderRadius: 2,
                }}
              >
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
                <td style={COL_VALUE}>
                  {formatNumber(val)}
                </td>
                <td style={COL_SHARE}>
                  {pct.toFixed(1)}%
                </td>
                {showDiff && (
                  <td style={diffCol(isBaseline ? 0 : absDiff)}>
                    {isBaseline ? "—" : `${absDiff >= 0 ? "+" : ""}${formatNumber(absDiff)}`}
                  </td>
                )}
                {showDiff && (
                  <td style={diffCol(isBaseline ? 0 : relDiff)}>
                    {isBaseline ? "—" : `${relDiff >= 0 ? "+" : ""}${relDiff.toFixed(1)}%`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "1px solid oklch(0.5 0 0 / 0.15)" }}>
            <td style={{ paddingTop: 4, fontWeight: 600 }}>Total</td>
            <td style={{ ...COL_VALUE, fontWeight: 600, paddingTop: 4 }}>
              {formatNumber(total)}
            </td>
            <td />
            {showDiff && <td />}
            {showDiff && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breakout content for pinned tooltips (player row version)
// ---------------------------------------------------------------------------

function PlayerBreakoutContent({
  row,
  sourceColors,
  sources,
}: {
  row: PlayerRow;
  sourceColors: string[];
  sources: ComparisonSource[];
}) {
  return (
    <>
      {/* Header */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img
            src={`/c/icons/spec_${row.className.toLowerCase()}_${row.specialization.toLowerCase().replace(/\s+/g, "")}.png`}
            alt={row.specialization}
            style={{ width: 16, height: 16, borderRadius: 2 }}
            onError={(e) => {
              const target = e.currentTarget;
              target.src = `/c/icons/class_${row.className.toLowerCase()}.png`;
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Draggable pinned breakout (click-to-pin, desktop drag, mobile modal)
// ---------------------------------------------------------------------------

interface DraggableComparisonBreakoutProps {
  initialPosition: { x: number; y: number };
  onClose: () => void;
  sourceColors: string[];
  sources: ComparisonSource[];
  children: React.ReactNode;
  title: string;
}

function DraggableComparisonBreakout({
  initialPosition,
  onClose,
  children,
  title,
}: DraggableComparisonBreakoutProps) {
  const isMobile = useIsMobile();
  const portalContainer = usePortalContainer();
  const portalDocument = portalContainer?.ownerDocument;
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isMobile && (e.target as HTMLElement).closest("[data-drag-handle]")) {
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          posX: position.x,
          posY: position.y,
        };
      }
    },
    [position, isMobile],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    if (!portalDocument) return;
    portalDocument.addEventListener("mousemove", handleMouseMove);
    portalDocument.addEventListener("mouseup", handleMouseUp);
    return () => {
      portalDocument.removeEventListener("mousemove", handleMouseMove);
      portalDocument.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, portalDocument]);

  if (!portalContainer) return null;

  // Mobile: centered modal
  if (isMobile) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[200] bg-black/50" onClick={onClose} />
        <div
          className="fixed inset-x-2 top-1/2 -translate-y-1/2 z-[200] flex flex-col bg-background rounded-lg max-h-[85vh] shadow-xl"
          style={{ border: "2px solid oklch(0.5 0 0 / 0.3)" }}
        >
          <div className="flex items-center gap-2 p-4 border-b border-border shrink-0">
            <span className="font-medium">{title}</span>
            <button
              onClick={onClose}
              className="ml-auto p-2 rounded bg-destructive/5 text-destructive/75 hover:bg-destructive/25 hover:text-destructive cursor-pointer transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 styled-scrollbar" style={{ overflow: "auto" }}>
            {children}
          </div>
        </div>
      </>,
      portalContainer,
    );
  }

  // Desktop: draggable panel
  return createPortal(
    <div
      data-breakout-panel
      className="bg-popover text-foreground fixed z-[200] min-w-[280px] max-w-[90vw] rounded-md shadow-md"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? "grabbing" : "default",
        border: "2px solid oklch(0.5 0 0 / 0.3)",
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        className="flex items-center gap-2 p-3 border-b border-border"
        data-drag-handle
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        <GripHorizontal className="h-4 w-4 flex-shrink-0" />
        <span className="font-medium text-sm">{title}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-auto p-1 rounded bg-destructive/5 text-destructive/75 hover:bg-destructive/25 hover:text-destructive cursor-pointer transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div>{children}</div>
    </div>,
    portalContainer,
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
  isPinned,
  onTogglePin,
  showMidLine,
}: {
  sourceColors: string[];
  sourceTotals: number[];
  grandTotal: number;
  sources: ComparisonSource[];
  isPinned: boolean;
  onTogglePin: () => void;
  showMidLine: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [pinnedPosition, setPinnedPosition] = useState<{ x: number; y: number } | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!isPinned && rowRef.current) {
        const rect = rowRef.current.getBoundingClientRect();
        setPinnedPosition({ x: rect.left, y: rect.bottom + 5 });
      }
      onTogglePin();
    },
    [isPinned, onTogglePin],
  );

  if (grandTotal === 0) return null;

  const rowContent = (
    <div
      ref={rowRef}
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        height: TOTAL_ROW_HEIGHT,
        position: "relative",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        color: "var(--color-class-foreground)",
        cursor: "pointer",
      }}
    >
      <StackedBarSegments values={sourceTotals} total={grandTotal} sourceColors={sourceColors} />
      {showMidLine && <MidLine />}

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
    <>
      <TooltipProvider>
        <Tooltip
          delayDuration={0}
          disableHoverableContent
          open={isPinned ? false : tooltipOpen}
          onOpenChange={setTooltipOpen}
        >
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

      {isPinned && pinnedPosition && (
        <DraggableComparisonBreakout
          initialPosition={pinnedPosition}
          onClose={onTogglePin}
          sourceColors={sourceColors}
          sources={sources}
          title="Total"
        >
          <BreakoutTable
            values={sourceTotals}
            total={grandTotal}
            sourceColors={sourceColors}
            sources={sources}
          />
        </DraggableComparisonBreakout>
      )}
    </>
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
  isPinned,
  onTogglePin,
  showMidLine,
}: {
  row: PlayerRow;
  grandTotal: number;
  sourceColors: string[];
  sources: ComparisonSource[];
  isPinned: boolean;
  onTogglePin: () => void;
  showMidLine: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [pinnedPosition, setPinnedPosition] = useState<{ x: number; y: number } | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!isPinned && rowRef.current) {
        const rect = rowRef.current.getBoundingClientRect();
        setPinnedPosition({ x: rect.left, y: rect.bottom + 5 });
      }
      onTogglePin();
    },
    [isPinned, onTogglePin],
  );

  const rowContent = (
    <div
      ref={rowRef}
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        height: ROW_HEIGHT,
        position: "relative",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        color: "var(--color-class-foreground)",
        cursor: "pointer",
      }}
    >
      {/* Full-width stacked segments (proportional to player's own total) */}
      <StackedBarSegments values={row.values} total={row.total} sourceColors={sourceColors} />
      {showMidLine && <MidLine />}

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
          src={`/c/icons/spec_${row.className.toLowerCase()}_${row.specialization.toLowerCase().replace(/\s+/g, "")}.png`}
          alt={row.specialization}
          style={{
            width: 20,
            height: 20,
            marginRight: 8,
            borderRadius: 2,
          }}
          onError={(e) => {
            const target = e.currentTarget;
            const classIcon = `/c/icons/class_${row.className.toLowerCase()}.png`;
            const unknownIcon = "/c/icons/class_unknown.png";
            if (target.src.endsWith(unknownIcon)) {
              target.style.display = "none";
            } else if (target.src.includes("/c/icons/class_")) {
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
            color: "var(--color-class-muted-foreground)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {((row.total / grandTotal) * 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );

  return (
    <>
      <TooltipProvider>
        <Tooltip
          delayDuration={0}
          disableHoverableContent
          open={isPinned ? false : tooltipOpen}
          onOpenChange={setTooltipOpen}
        >
          <TooltipTrigger asChild>
            {rowContent}
          </TooltipTrigger>
          <TooltipContent
            align="start"
            hideArrow
            className="p-0 bg-popover text-foreground border"
          >
            <PlayerBreakoutContent row={row} sourceColors={sourceColors} sources={sources} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isPinned && pinnedPosition && (
        <DraggableComparisonBreakout
          initialPosition={pinnedPosition}
          onClose={onTogglePin}
          sourceColors={sourceColors}
          sources={sources}
          title={row.playerName}
        >
          <PlayerBreakoutContent row={row} sourceColors={sourceColors} sources={sources} />
        </DraggableComparisonBreakout>
      )}
    </>
  );
}
