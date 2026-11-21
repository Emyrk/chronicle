import { useState } from "react";
import { Line, type LineSeries, type SliceTooltipProps } from "@nivo/line";
import { formatChartValue, type LineChartFormat } from "./lineChartFormat";
import type { SceneNode } from "./types";

/** Series colors used when Lua does not set one; picked to read on the dark panel background. */
const PALETTE = ["#60a5fa", "#f97316", "#34d399", "#f472b6", "#facc15", "#a78bfa", "#2dd4bf", "#f87171", "#a3e635", "#38bdf8", "#fb923c", "#c084fc"];
const AXIS_TEXT = "#a1a1aa";

interface LuaSeries { name: string; color?: string; points: Array<{ x: number; y: number }> }
interface LuaMarker { x: number; label?: string; color?: string }
interface ChartSeries extends LineSeries { id: string; color: string; data: Array<{ x: number; y: number }> }

function asFormat(value: unknown, fallback: LineChartFormat): LineChartFormat {
  return value === "number" || value === "compact" || value === "seconds" || value === "duration" || value === "percent" ? value : fallback;
}

function asCurve(value: unknown): "linear" | "monotoneX" | "step" | "natural" | "basis" {
  return value === "linear" || value === "step" || value === "natural" || value === "basis" ? value : "monotoneX";
}

function asBound(value: unknown): number | "auto" {
  return typeof value === "number" && Number.isFinite(value) ? value : "auto";
}

function label(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function LineChartSliceTooltip({ slice, xFormat, yFormat }: SliceTooltipProps<ChartSeries> & { xFormat: LineChartFormat; yFormat: LineChartFormat }) {
  const rows = [...slice.points].sort((left, right) => Number(right.data.y) - Number(left.data.y));
  return (
    <div className="min-w-[140px] max-w-[240px] rounded-md border border-zinc-700 bg-zinc-900/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm">
      <div className="mb-1 font-medium text-zinc-400">{formatChartValue(Number(rows[0]?.data.x ?? 0), xFormat)}</div>
      {rows.map((point) => (
        <div key={point.id} className="flex items-center gap-1.5 py-px">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: point.seriesColor }} />
          <span className="min-w-0 flex-1 truncate text-zinc-300">{String(point.seriesId)}</span>
          <span className="ml-2 font-medium tabular-nums text-zinc-100">{formatChartValue(Number(point.data.y), yFormat)}</span>
        </div>
      ))}
    </div>
  );
}

/** A Nivo line chart driven by Lua: series, markers and an allowlisted set of options. */
export function LuaLineChart({ node }: { node: SceneNode }) {
  const props = node.props;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const width = typeof props.width === "number" ? props.width : 480;
  const height = typeof props.height === "number" ? props.height : 240;
  const xFormat = asFormat(props.xFormat, "number");
  const yFormat = asFormat(props.yFormat, "compact");
  const xLabel = label(props.xLabel);
  const yLabel = label(props.yLabel);
  const showLegend = props.legend !== false;

  const all: ChartSeries[] = (Array.isArray(props.series) ? props.series as LuaSeries[] : []).map((series, index) => ({
    id: series.name,
    color: series.color ?? PALETTE[index % PALETTE.length],
    data: series.points,
  }));
  const visible = all.filter((series) => !hidden.has(series.id));
  const markers = (Array.isArray(props.markers) ? props.markers as LuaMarker[] : []).map((marker) => ({
    axis: "x" as const,
    value: marker.x,
    lineStyle: { stroke: marker.color ?? "#71717a", strokeWidth: 1, strokeDasharray: "4 3" },
    legend: marker.label,
    legendPosition: "top-right" as const,
    textStyle: { fill: marker.color ?? AXIS_TEXT, fontSize: 10 },
  }));
  const margin = { top: 12, right: 16, bottom: xLabel ? 44 : 32, left: yLabel ? 64 : 52 };

  const toggle = (id: string) => setHidden((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div className="relative h-full w-full" data-line-chart>
      <Line<ChartSeries>
        width={width}
        height={height}
        data={visible}
        colors={(series) => series.color}
        margin={margin}
        xScale={{ type: "linear", min: asBound(props.xMin), max: asBound(props.xMax) }}
        yScale={{ type: "linear", min: asBound(props.yMin ?? 0), max: asBound(props.yMax), stacked: props.stacked === true }}
        curve={asCurve(props.curve)}
        axisBottom={{ tickSize: 5, tickPadding: 5, tickValues: 6, format: (value) => formatChartValue(Number(value), xFormat), legend: xLabel, legendOffset: 36, legendPosition: "middle" }}
        axisLeft={{ tickSize: 5, tickPadding: 5, tickValues: 5, format: (value) => formatChartValue(Number(value), yFormat), legend: yLabel, legendOffset: -54, legendPosition: "middle" }}
        enableGridX={false}
        enablePoints={props.showPoints === true}
        pointSize={5}
        enableArea={props.area === true || props.stacked === true}
        areaOpacity={0.15}
        markers={markers}
        enableSlices="x"
        sliceTooltip={(tooltip) => <LineChartSliceTooltip {...tooltip} xFormat={xFormat} yFormat={yFormat} />}
        animate={false}
        theme={{
          background: "transparent",
          text: { fill: AXIS_TEXT },
          grid: { line: { stroke: "rgba(255,255,255,0.06)" } },
          axis: { ticks: { text: { fill: AXIS_TEXT, fontSize: 11 } }, legend: { text: { fill: AXIS_TEXT, fontSize: 11 } } },
          crosshair: { line: { stroke: "#71717a" } },
        }}
      />
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
