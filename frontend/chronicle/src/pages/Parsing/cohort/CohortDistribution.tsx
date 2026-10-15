import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseHexColor } from "@/pages/Instance/parseColors";
import { buildHistogram, PARSE_TIERS, type CohortDirection, type HistogramBin, type ScoredValue } from "./cohortStats";

const HEIGHT = 200;
const MARGIN = { top: 16, right: 12, bottom: 28, left: 36 };
const MAX_BAR_WIDTH = 24;
const SEGMENT_GAP = 2;
const RADIUS = 4;

/** Path for a rect with rounded top corners and a square base. */
function topRoundedRect(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function niceCeil(value: number): number {
  if (value <= 4) return Math.max(1, Math.ceil(value));
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (factor * magnitude >= value) return factor * magnitude;
  }
  return 10 * magnitude;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Pointer travel (px) before a press counts as a zoom drag, not a click. */
const MIN_DRAG_PX = 6;

/**
 * Histogram of a cohort with each bar stacked by parse tier (worst at the
 * base). An optional highlighted value draws a marker for one run. Dragging
 * across the plot zooms into that range and re-bins it, so a few far
 * outliers don't squash the bulk of the cohort into one wide bar.
 */
export function CohortDistribution({
  values,
  time,
  direction,
  formatValue,
  formatTick = formatValue,
  unitLabel,
  highlight,
}: {
  values: readonly ScoredValue[];
  time: boolean;
  direction: CohortDirection;
  formatValue: (value: number) => string;
  /** Axis tick format; defaults to formatValue. */
  formatTick?: (value: number) => string;
  /** Plural noun for counts, e.g. "kills". */
  unitLabel: string;
  highlight?: { value: number; label: string };
}) {
  const [containerRef, width] = useWidth();
  const [hovered, setHovered] = useState<number | null>(null);

  // Zoom is tied to the values it was made on, so new data starts unzoomed.
  const [zoomState, setZoomState] = useState<{ values: readonly ScoredValue[]; lo: number; hi: number } | null>(null);
  const zoom = zoomState?.values === values ? zoomState : null;
  const shown = useMemo(
    () => (zoom ? values.filter((v) => v.value >= zoom.lo && v.value <= zoom.hi) : values),
    [values, zoom],
  );
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  const targetBins = width > 0 && width < 520 ? 14 : 28;
  const bins = useMemo(() => buildHistogram(shown, { time, targetBins }), [shown, time, targetBins]);

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const yMax = niceCeil(Math.max(1, ...bins.map((bin) => bin.total)));
  const domainStart = bins[0]?.start ?? 0;
  const domainEnd = bins[bins.length - 1]?.end ?? 1;
  const x = (value: number) => MARGIN.left + ((value - domainStart) / (domainEnd - domainStart)) * plotWidth;
  const y = (count: number) => MARGIN.top + plotHeight - (count / yMax) * plotHeight;
  const slot = bins.length > 0 ? plotWidth / bins.length : 0;
  const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, slot - SEGMENT_GAP));
  const labelEvery = Math.max(1, Math.ceil(56 / Math.max(slot, 1)));
  const presentTiers = PARSE_TIERS.map((tier, index) => ({ ...tier, index })).filter((tier) =>
    bins.some((bin) => bin.tierCounts[tier.index] > 0),
  );

  const hoveredBin = hovered === null ? null : bins[hovered];

  const plotX = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.min(MARGIN.left + plotWidth, Math.max(MARGIN.left, event.clientX - rect.left));
  };
  const valueAt = (px: number) => domainStart + ((px - MARGIN.left) / Math.max(plotWidth, 1)) * (domainEnd - domainStart);
  const finishDrag = () => {
    if (drag && Math.abs(drag.to - drag.from) >= MIN_DRAG_PX) {
      // Ends released near a plot edge snap to it, so nothing is clipped by a pixel.
      const left = Math.min(drag.from, drag.to);
      const right = Math.max(drag.from, drag.to);
      const lo = left - MARGIN.left < MIN_DRAG_PX ? domainStart : valueAt(left);
      const hi = MARGIN.left + plotWidth - right < MIN_DRAG_PX ? domainEnd : valueAt(right);
      // Zoom only when the range holds enough kills to be worth a histogram.
      if (shown.filter((v) => v.value >= lo && v.value <= hi).length >= 2) {
        setZoomState({ values, lo, hi });
        setHovered(null);
      }
    }
    setDrag(null);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium text-foreground">Distribution</span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          {zoom ? (
            <>
              <span className="tabular-nums">
                {formatValue(zoom.lo)} – {formatValue(zoom.hi)}
                {values.length > shown.length && ` · ${values.length - shown.length} ${unitLabel} outside`}
              </span>
              <button
                type="button"
                onClick={() => setZoomState(null)}
                className="rounded border border-white/10 px-1.5 py-0.5 text-foreground hover:bg-white/5"
              >
                Reset zoom
              </button>
            </>
          ) : (
            <span>
              {direction === "lower" ? "Faster runs on the left" : "Higher values on the right"}
              <span className="hidden sm:inline"> · drag to zoom</span>
            </span>
          )}
        </span>
      </div>
      <div ref={containerRef} className="relative" onPointerLeave={() => setHovered(null)}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Distribution of ${shown.length} ${unitLabel} by parse tier`}
            className="cursor-crosshair touch-pan-y select-none"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              const px = plotX(event);
              setDrag({ from: px, to: px });
            }}
            onPointerMove={(event) => drag && setDrag({ ...drag, to: plotX(event) })}
            onPointerUp={finishDrag}
            onPointerCancel={() => setDrag(null)}
          >
            {[0, yMax / 2, yMax].map((tick) => (
              <g key={tick}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
                <text x={MARGIN.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                  {Number.isInteger(tick) ? tick : tick.toFixed(1)}
                </text>
              </g>
            ))}

            {bins.map((bin, binIndex) => (
              <BinBar
                key={bin.start}
                bin={bin}
                x={MARGIN.left + binIndex * slot + (slot - barWidth) / 2}
                width={barWidth}
                y={y}
                dimmed={hovered !== null && hovered !== binIndex}
              />
            ))}

            {bins.map((bin, binIndex) =>
              binIndex % labelEvery === 0 ? (
                <text
                  key={bin.start}
                  x={MARGIN.left + binIndex * slot}
                  y={HEIGHT - MARGIN.bottom + 16}
                  textAnchor={binIndex === 0 ? "start" : "middle"}
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {formatTick(bin.start)}
                </text>
              ) : null,
            )}

            {highlight && highlight.value >= domainStart && highlight.value <= domainEnd && (
              <g pointerEvents="none">
                <line
                  x1={x(highlight.value)}
                  x2={x(highlight.value)}
                  y1={MARGIN.top - 4}
                  y2={MARGIN.top + plotHeight}
                  className="stroke-foreground"
                  strokeWidth={1.5}
                />
                <text
                  x={x(highlight.value)}
                  y={MARGIN.top - 6}
                  textAnchor={x(highlight.value) > width - 80 ? "end" : "middle"}
                  className="fill-foreground text-[10px] font-semibold"
                >
                  {highlight.label}
                </text>
              </g>
            )}

            {drag && Math.abs(drag.to - drag.from) >= MIN_DRAG_PX && (
              <rect
                x={Math.min(drag.from, drag.to)}
                y={MARGIN.top}
                width={Math.abs(drag.to - drag.from)}
                height={plotHeight}
                className="fill-primary/15 stroke-primary/60"
                strokeWidth={1}
                pointerEvents="none"
              />
            )}

            {bins.map((bin, binIndex) => (
              <rect
                key={bin.start}
                x={MARGIN.left + binIndex * slot}
                y={MARGIN.top}
                width={slot}
                height={plotHeight}
                fill="transparent"
                tabIndex={bin.total > 0 ? 0 : -1}
                aria-label={`${formatValue(bin.start)} to ${formatValue(bin.end)}: ${bin.total} ${unitLabel}`}
                className="focus:outline-none"
                onPointerEnter={() => !drag && setHovered(binIndex)}
                onFocus={() => setHovered(binIndex)}
                onBlur={() => setHovered(null)}
              />
            ))}
          </svg>
        )}

        {!drag && hoveredBin && hovered !== null && hoveredBin.total > 0 && (
          <BinTooltip
            bin={hoveredBin}
            left={MARGIN.left + hovered * slot + slot / 2}
            containerWidth={width}
            formatValue={formatValue}
            unitLabel={unitLabel}
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Parse</span>
        {presentTiers.map((tier) => (
          <span key={tier.floor} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: parseHexColor(tier.floor) }} aria-hidden />
            {tier.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BinBar({
  bin,
  x,
  width,
  y,
  dimmed,
}: {
  bin: HistogramBin;
  x: number;
  width: number;
  y: (count: number) => number;
  dimmed: boolean;
}) {
  if (bin.total === 0) return null;
  const segments: { index: number; from: number; to: number }[] = [];
  let running = 0;
  // Worst tier sits on the baseline, best tier on top.
  for (let index = PARSE_TIERS.length - 1; index >= 0; index--) {
    const count = bin.tierCounts[index];
    if (count === 0) continue;
    segments.push({ index, from: running, to: running + count });
    running += count;
  }
  return (
    <g opacity={dimmed ? 0.45 : 1} className="transition-opacity">
      {segments.map((segment, i) => {
        const isTop = i === segments.length - 1;
        const top = y(segment.to);
        const bottom = y(segment.from) - (i === 0 ? 0 : SEGMENT_GAP);
        const height = Math.max(1, bottom - top);
        const fill = parseHexColor(PARSE_TIERS[segment.index].floor);
        return isTop ? (
          <path key={segment.index} d={topRoundedRect(x, top, width, height, RADIUS)} fill={fill} />
        ) : (
          <rect key={segment.index} x={x} y={top} width={width} height={height} fill={fill} />
        );
      })}
    </g>
  );
}

function BinTooltip({
  bin,
  left,
  containerWidth,
  formatValue,
  unitLabel,
}: {
  bin: HistogramBin;
  left: number;
  containerWidth: number;
  formatValue: (value: number) => string;
  unitLabel: string;
}) {
  const tooltipWidth = 168;
  const clampedLeft = Math.min(Math.max(left - tooltipWidth / 2, 0), Math.max(0, containerWidth - tooltipWidth));
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 rounded-lg border border-white/10 bg-popover p-2.5 text-foreground shadow-lg"
      style={{ left: clampedLeft, width: tooltipWidth }}
    >
      <div className="text-sm font-semibold tabular-nums">
        {bin.total} {unitLabel}
      </div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        {formatValue(bin.start)} – {formatValue(bin.end)}
      </div>
      <div className="mt-1.5 space-y-0.5">
        {PARSE_TIERS.map((tier, index) =>
          bin.tierCounts[index] > 0 ? (
            <div key={tier.floor} className="flex items-center gap-2 text-[11px]">
              <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: parseHexColor(tier.floor) }} aria-hidden />
              <span className="flex-1 text-muted-foreground">{tier.label}</span>
              <span className="font-medium tabular-nums">{bin.tierCounts[index]}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
