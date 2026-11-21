import { useState } from "react";
import { Line, ResponsiveLine, type CommonCustomLayerProps, type LineSeries, type LineSvgLayer, type LineSvgProps, type SliceTooltipProps } from "@nivo/line";
import type { LineBand, LineChartCurve, LineChartFormat, LineMarker, LineSeries as LuaSeries } from "../widgets/lineChart";
import { formatChartValue } from "./lineChartFormat";
import type { SceneNode } from "./types";

/** Series colors used when Lua does not set one; picked to read on the dark panel background. */
const PALETTE = ["#60a5fa", "#f97316", "#34d399", "#f472b6", "#facc15", "#a78bfa", "#2dd4bf", "#f87171", "#a3e635", "#38bdf8", "#fb923c", "#c084fc"];
const AXIS_TEXT = "#a1a1aa";
const BAND_COLOR = "#8b5cf6";
const MARKER_COLOR = "#71717a";
const DASHES = { dashed: "4 3", dotted: "1 3", solid: undefined } as const;
const TOOLTIP_CARD = "min-w-[140px] max-w-[260px] rounded-md border border-zinc-700 bg-zinc-900/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm";

interface ChartSeries extends LineSeries { id: string; color: string; data: Array<{ x: number; y: number }> }
type LayerProps = CommonCustomLayerProps<ChartSeries>;
interface HoveredMarker { marker: LineMarker; x: number; innerWidth: number }

function asFormat(value: unknown, fallback: LineChartFormat): LineChartFormat {
  return value === "number" || value === "compact" || value === "seconds" || value === "duration" || value === "percent" ? value : fallback;
}

function asCurve(value: unknown): LineChartCurve {
  return value === "linear" || value === "step" || value === "natural" || value === "basis" ? value : "monotoneX";
}

function asBound(value: unknown): number | "auto" {
  return typeof value === "number" && Number.isFinite(value) ? value : "auto";
}

function label(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

interface SliceTooltipExtras {
  xFormat: LineChartFormat;
  yFormat: LineChartFormat;
  bands: readonly LineBand[];
  suffixes: ReadonlyMap<string, string>;
}

function LineChartSliceTooltip({ slice, xFormat, yFormat, bands, suffixes }: SliceTooltipProps<ChartSeries> & SliceTooltipExtras) {
  const rows = [...slice.points].sort((left, right) => Number(right.data.y) - Number(left.data.y));
  const x = Number(rows[0]?.data.x ?? 0);
  // Bands under the pointer (phases, background measures) are listed above the values.
  const active = bands.filter((band) => x >= band.from && x <= band.to && (band.label || band.tooltip));
  return (
    <div className={TOOLTIP_CARD}>
      <div className="mb-1 font-medium text-zinc-400">{formatChartValue(x, xFormat)}</div>
      {active.map((band, index) => (
        <div key={index} className="mb-1 whitespace-pre-line text-[11px] leading-snug" style={{ color: band.color ?? "#c4b5fd" }}>
          {[band.label, band.tooltip].filter(Boolean).join("\n")}
        </div>
      ))}
      {rows.map((point) => (
        <div key={point.id} className="flex items-center gap-1.5 py-px">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: point.seriesColor }} />
          <span className="min-w-0 flex-1 truncate text-zinc-300">{String(point.seriesId)}</span>
          <span className="ml-2 font-medium tabular-nums text-zinc-100">
            {formatChartValue(Number(point.data.y), yFormat)}{suffixes.get(String(point.seriesId))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A Nivo line chart driven by Lua: series, bands, markers and an allowlisted set of options. */
export function LuaLineChart({ node }: { node: SceneNode }) {
  const props = node.props;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [hoveredMarker, setHoveredMarker] = useState<HoveredMarker | null>(null);
  const width = typeof props.width === "number" ? props.width : 480;
  const height = typeof props.height === "number" ? props.height : 240;
  const fillParent = props.fillParent === true;
  const compact = !fillParent && width < 400;
  const xFormat = asFormat(props.xFormat, "number");
  const yFormat = asFormat(props.yFormat, "compact");
  const xLabel = label(props.xLabel);
  const yLabel = label(props.yLabel);
  const showLegend = props.legend !== false;
  const bands = Array.isArray(props.bands) ? props.bands as LineBand[] : [];
  const markers = Array.isArray(props.markers) ? props.markers as LineMarker[] : [];
  const luaSeries = Array.isArray(props.series) ? props.series as LuaSeries[] : [];

  const all: ChartSeries[] = luaSeries.map((series, index) => ({
    id: series.name,
    color: series.color ?? PALETTE[index % PALETTE.length],
    data: series.points,
  }));
  const visible = all.filter((series) => !hidden.has(series.id));
  const suffixes = new Map(luaSeries.map((series) => [series.name, series.suffix ?? ""]));
  const margin = compact
    ? { top: 12, right: 8, bottom: xLabel ? 40 : 28, left: yLabel ? 52 : 38 }
    : { top: 12, right: 16, bottom: xLabel ? 44 : 32, left: yLabel ? 64 : 52 };

  const toggle = (id: string) => setHidden((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // Shaded ranges behind the lines, with their labels along the top.
  const bandsLayer = ({ xScale, innerHeight, innerWidth }: LayerProps) => (
    <g key="bands" aria-label="Chart bands">
      {bands.map((band, index) => {
        const x0 = Math.max(0, Math.min(innerWidth, xScale(band.from)));
        const x1 = Math.max(0, Math.min(innerWidth, xScale(band.to)));
        if (!(x1 > x0)) return null;
        const color = band.color ?? BAND_COLOR;
        return (
          <g key={index}>
            <rect x={x0} y={0} width={x1 - x0} height={innerHeight} fill={color} fillOpacity={band.opacity ?? 0.08} />
            {band.label && x1 - x0 > 24 && (
              <text x={x0 + 4} y={11} fill={color} fillOpacity={0.9} fontSize={10} fontWeight={600}>{band.label}</text>
            )}
          </g>
        );
      })}
    </g>
  );

  // Marker lines, icons and labels, drawn above the lines.
  const markersLayer = ({ xScale, innerHeight, innerWidth }: LayerProps) => (
    <g key="markers" aria-label="Chart markers">
      {markers.map((marker, index) => {
        const x = xScale(marker.x);
        if (!(x >= 0 && x <= innerWidth)) return null;
        const color = marker.color ?? MARKER_COLOR;
        const hovered = hoveredMarker?.marker === marker;
        const icon = marker.icon ?? "none";
        return (
          <g key={index}>
            <line x1={x} x2={x} y1={0} y2={innerHeight} stroke={color} strokeOpacity={hovered ? 1 : 0.75} strokeWidth={hovered ? 2 : 1} strokeDasharray={DASHES[marker.style ?? "dashed"]} />
            {icon === "triangle" && <path d={`M${x - 4},0 L${x + 4},0 L${x},7 Z`} fill={color} />}
            {icon === "dot" && <circle cx={x} cy={3} r={3} fill={color} />}
            {marker.label && <text x={x + 4} y={icon === "none" ? 11 : 18} fill={color} fontSize={10}>{marker.label}</text>}
          </g>
        );
      })}
    </g>
  );

  // Narrow hover strips over markers that have tooltips. Drawn after the slice layer so they win the pointer.
  const markerHoverLayer = ({ xScale, innerHeight, innerWidth }: LayerProps) => (
    <g key="marker-hover">
      {markers.map((marker, index) => {
        const x = xScale(marker.x);
        if (!marker.tooltip || !(x >= 0 && x <= innerWidth)) return null;
        return (
          <rect
            key={index}
            data-line-chart-marker
            x={x - 5}
            y={0}
            width={10}
            height={innerHeight}
            fill="transparent"
            style={{ cursor: "help" }}
            onMouseEnter={() => setHoveredMarker({ marker, x, innerWidth })}
            onMouseLeave={() => setHoveredMarker(null)}
          />
        );
      })}
    </g>
  );

  const layers: LineSvgLayer<ChartSeries>[] = ["grid", bandsLayer, "axes", "areas", "crosshair", "lines", markersLayer, "points", "slices", markerHoverLayer];
  const chart: LineSvgProps<ChartSeries> = {
    width,
    height,
    data: visible,
    colors: (series) => series.color,
    margin,
    xScale: { type: "linear", min: asBound(props.xMin), max: asBound(props.xMax) },
    yScale: { type: "linear", min: asBound(props.yMin ?? 0), max: asBound(props.yMax), stacked: props.stacked === true },
    curve: asCurve(props.curve),
    axisBottom: { tickSize: 5, tickPadding: 5, tickValues: compact ? 4 : 6, format: (value) => formatChartValue(Number(value), xFormat), legend: xLabel, legendOffset: compact ? 32 : 36, legendPosition: "middle" },
    axisLeft: { tickSize: 5, tickPadding: 5, tickValues: 5, format: (value) => formatChartValue(Number(value), yFormat), legend: yLabel, legendOffset: compact ? -44 : -54, legendPosition: "middle" },
    enableGridX: false,
    enablePoints: props.showPoints === true,
    pointSize: 5,
    enableArea: props.area === true || props.stacked === true,
    areaOpacity: 0.15,
    layers,
    enableSlices: "x",
    sliceTooltip: (tooltip) => <LineChartSliceTooltip {...tooltip} xFormat={xFormat} yFormat={yFormat} bands={bands} suffixes={suffixes} />,
    animate: false,
    theme: {
      background: "transparent",
      text: { fill: AXIS_TEXT },
      grid: { line: { stroke: "rgba(255,255,255,0.06)" } },
      axis: { ticks: { text: { fill: AXIS_TEXT, fontSize: 11 } }, legend: { text: { fill: AXIS_TEXT, fontSize: 11 } } },
      crosshair: { line: { stroke: "#71717a" } },
    },
  };

  return (
    <div className="relative h-full w-full" data-line-chart>
      {fillParent ? <ResponsiveLine {...chart} /> : <Line {...chart} />}
      {hoveredMarker && (
        <div
          className={`pointer-events-none absolute z-20 whitespace-pre-line ${TOOLTIP_CARD} ${hoveredMarker.x > hoveredMarker.innerWidth / 2 ? "-ml-2 -translate-x-full" : "ml-2"}`}
          style={{ left: margin.left + hoveredMarker.x, top: margin.top + 4 }}
        >
          {hoveredMarker.marker.label && <div className="mb-0.5 font-semibold" style={{ color: hoveredMarker.marker.color ?? AXIS_TEXT }}>{hoveredMarker.marker.label}</div>}
          <div className="text-zinc-200">{hoveredMarker.marker.tooltip}</div>
        </div>
      )}
      {showLegend && all.length > 0 && (
        <div className="absolute right-2 top-1 flex max-w-[45%] flex-wrap justify-end gap-x-2 select-none">
          {all.map((series) => {
            const off = hidden.has(series.id);
            return (
              <button
                key={series.id}
                type="button"
                className="flex items-center gap-1 rounded px-1 text-[11px] leading-4 transition-colors hover:bg-zinc-800/60"
                onClick={() => toggle(series.id)}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: off ? "transparent" : series.color, border: off ? `1.5px solid ${series.color}` : "none" }}
                />
                <span className="max-w-[110px] truncate" style={{ color: off ? "#52525b" : AXIS_TEXT, textDecoration: off ? "line-through" : "none" }}>
                  {series.id}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
