/**
 * Deterministic Timeline (Line Chart) demo harness for explainer videos.
 *
 * Renders the REAL Nivo ResponsiveLine with the panel's exact theme, margins,
 * axes, and curve — but from synthetic bins, with every interactive state
 * (drag rect, saved time range, hidden series, slice tooltip, card-back
 * editor, durability background) controllable frame-by-frame. Animations are
 * disabled so remotion scrubbing is deterministic.
 */

import { ChevronDown, HelpCircle, MoreVertical, Plus, Settings, TrendingUp } from 'lucide-react'
import { Line, type LineSeries } from '@nivo/line'
import { applyAggregation, AGGREGATIONS } from './aggregations'
import type { AggregationType } from './timelineTypes'
import {
  DEMO_DAMAGE_SERIES,
  DURABILITY_BARS,
  RAW_BINS,
  TOTAL_SEC,
  BIN_MS,
  type DemoTimelineSeries,
} from './timelineDemoData'

interface ColoredSeries extends LineSeries {
  color: string
}

const CHART_MARGIN = { top: 10, right: 20, bottom: 36, left: 50 } as const

function formatValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return v.toFixed(0)
}

export function TimelineDemo({
  series = [DEMO_DAMAGE_SERIES],
  hiddenSeries = [],
  dragRect,
  timeRange,
  tooltipSec,
  durability,
}: {
  /** Series to plot (aggregation applied via the panel's real registry). */
  series?: DemoTimelineSeries[]
  /** Series hidden via the legend (struck-through label, no line). */
  hiddenSeries?: string[]
  /** Ephemeral drag-selection rectangle, in seconds. */
  dragRect?: { startSec: number; endSec: number }
  /** Saved time range: highlight band + Reset Selection pill. */
  timeRange?: { startSec: number; endSec: number }
  /** Show the slice crosshair + tooltip at this second. */
  tooltipSec?: number
  /** Render the raid-durability background bars. */
  durability?: boolean
}) {
  const data: ColoredSeries[] = series
    .filter((s) => !hiddenSeries.includes(s.id))
    .map((s) => {
      const displayBins = applyAggregation(RAW_BINS[s.id], BIN_MS, s.aggregation)
      const points = [{ x: 0, y: 0 }]
      for (let b = 0; b < TOTAL_SEC; b++) points.push({ x: b + 1, y: displayBins[b] ?? 0 })
      return { id: s.id, data: points, color: s.color }
    })

  // Pixel math for overlays. The Nivo <Line> is a FIXED size (no
  // ResizeObserver) so this math is exact and deterministic.
  const bodyW = 620
  const bodyH = 352
  const plotW = bodyW - CHART_MARGIN.left - CHART_MARGIN.right
  const plotH = bodyH - CHART_MARGIN.top - CHART_MARGIN.bottom
  const secToPx = (sec: number) => CHART_MARGIN.left + (sec / TOTAL_SEC) * plotW

  const tooltipRows = tooltipSec !== undefined
    ? series
        .filter((s) => !hiddenSeries.includes(s.id))
        .map((s) => ({
          ...s,
          value: applyAggregation(RAW_BINS[s.id], BIN_MS, s.aggregation)[Math.min(tooltipSec, TOTAL_SEC - 1)] ?? 0,
        }))
        .sort((a, b) => b.value - a.value)
    : []

  return (
    <section className="relative flex h-[430px] w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
      {/* Mirrors the real EventsPanel header chrome. */}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <TrendingUp className="h-4 w-4" />
        <span className="text-sm font-medium">Line Chart</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
      </header>

      <div className="relative min-h-0 flex-1" style={{ cursor: 'crosshair' }}>
        <Line
          width={bodyW}
          height={bodyH}
          data={data}
          colors={(d) => (d as ColoredSeries).color ?? '#888'}
          margin={CHART_MARGIN}
          xScale={{ type: 'linear', min: 0, max: TOTAL_SEC }}
          yScale={{ type: 'linear', min: 0, stacked: false }}
          axisBottom={{ tickSize: 5, tickPadding: 5, format: (v) => `${v}s`, tickValues: 8 }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 5,
            format: (v) => (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : String(v)),
            tickValues: 5,
          }}
          enablePoints={false}
          enableGridX={false}
          curve="monotoneX"
          animate={false}
          isInteractive={false}
          theme={{
            background: 'transparent',
            text: { fill: '#a1a1aa' },
            grid: { line: { stroke: 'rgba(255,255,255,0.06)' } },
            axis: { ticks: { text: { fill: '#a1a1aa', fontSize: 11 } } },
          }}
        />

        {/* Durability background bars (mirrors the panel's durability layer). */}
        {durability && (
          <div className="pointer-events-none absolute inset-0">
            {DURABILITY_BARS.map((bar, i) => {
              const x1 = secToPx(bar.startSec)
              const x2 = secToPx(bar.endSec)
              const h = (plotH * bar.percent) / 100
              return (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left: x1,
                    width: Math.max(0, x2 - x1 - 1),
                    top: CHART_MARGIN.top + plotH - h,
                    height: h,
                    background: bar.color,
                    opacity: 0.18,
                  }}
                />
              )
            })}
            <span
              className="absolute font-semibold tracking-[0.08em]"
              style={{ right: CHART_MARGIN.right + 6, top: CHART_MARGIN.top + plotH - 16, fontSize: 9, color: 'rgba(161,161,170,0.8)' }}
            >
              RAID DURABILITY
            </span>
          </div>
        )}

        {/* Saved time-range highlight (mirrors the panel's overlay layer). */}
        {timeRange && (
          <div
            className="pointer-events-none absolute"
            style={{
              left: secToPx(timeRange.startSec),
              width: secToPx(timeRange.endSec) - secToPx(timeRange.startSec),
              top: CHART_MARGIN.top,
              height: plotH,
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
            }}
          />
        )}

        {/* Ephemeral drag rectangle. */}
        {dragRect && dragRect.endSec > dragRect.startSec && (
          <div
            className="pointer-events-none absolute"
            style={{
              left: secToPx(dragRect.startSec),
              width: secToPx(dragRect.endSec) - secToPx(dragRect.startSec),
              top: CHART_MARGIN.top,
              height: plotH,
              background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.5)',
            }}
          />
        )}

        {/* Slice crosshair + tooltip (mirrors TimelineSliceTooltip). */}
        {tooltipSec !== undefined && (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute"
              style={{
                left: secToPx(tooltipSec),
                top: CHART_MARGIN.top,
                height: plotH,
                width: 1,
                background: '#71717a',
              }}
            />
            <div
              className="absolute min-w-[120px] rounded-md border border-zinc-700 bg-zinc-900/95 px-2.5 py-1.5 text-xs shadow-lg"
              style={{ left: Math.min(secToPx(tooltipSec) + 10, bodyW - 150), top: 40 }}
              data-demo-tooltip
            >
              <div className="mb-1 font-medium text-zinc-400">{tooltipSec}s</div>
              {tooltipRows.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5 py-px">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="max-w-[100px] truncate text-zinc-300">{row.name}</span>
                  <span className="ml-auto font-medium tabular-nums text-zinc-100">
                    {formatValue(row.value)}
                    {row.aggregation === 'per_second' ? '/s' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clickable legend (mirrors the panel's legend). */}
        <div className="absolute right-2 top-2 flex select-none flex-col gap-0.5">
          {series.map((s) => {
            const hidden = hiddenSeries.includes(s.id)
            return (
              <span
                key={s.id}
                className="flex items-center gap-1.5 rounded px-1 py-px text-[11px] leading-4"
                data-demo-legend={s.id}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: hidden ? 'transparent' : s.color,
                    border: hidden ? `1.5px solid ${s.color}` : 'none',
                  }}
                />
                <span
                  className="max-w-[90px] truncate"
                  style={{ color: hidden ? '#52525b' : '#a1a1aa', textDecoration: hidden ? 'line-through' : 'none' }}
                >
                  {s.name}
                </span>
              </span>
            )
          })}
        </div>

        {/* Reset Selection pill when a time range is active. */}
        {timeRange && (
          <span
            className="absolute left-14 top-1 rounded border border-red-500/30 bg-red-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-red-400"
            data-demo-reset
          >
            Reset Selection
          </span>
        )}
      </div>

      {/* Mirrors the GenericPanel footer diagnostics. */}
      <footer className="flex h-8 shrink-0 items-center border-t border-border px-3 font-mono text-2xs text-muted-foreground">
        <span>52.4K events (612.1K/s)</span>
        <span className="ml-auto text-chart-1">38ms</span>
      </footer>
    </section>
  )
}

/**
 * Mock of the Timeline card-back editor (Settings | Series tabs) for the
 * build-a-series lesson. Frame-driven: which tab is active, whether the new
 * series tab exists yet, and which stream/aggregation/color are selected.
 */
export function TimelineEditorDemo({
  activeTab = 0,
  hasNewSeries = false,
  newStream,
  newAggregation,
  newColor,
}: {
  /** 0 = Series 1, 1 = the new Series 2 (when it exists). */
  activeTab?: number
  hasNewSeries?: boolean
  newStream?: string
  newAggregation?: AggregationType
  newColor?: string
}) {
  const STREAMS = ['damage', 'heal', 'resource_change', 'cast']
  const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7']
  const tabClass = (active: boolean) =>
    active
      ? 'rounded-t border-b-2 border-primary px-3 py-1.5 text-xs font-medium text-foreground'
      : 'rounded-t px-3 py-1.5 text-xs text-muted-foreground'

  return (
    <section className="relative flex h-[430px] w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-2 pt-2" data-demo-timeline-editor>
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <TrendingUp className="h-4 w-4" />
            Line Chart
          </h4>
          <div className="flex items-center gap-2">
            <span className="rounded-md px-3 py-1.5 text-xs font-medium">Reset</span>
            <span className="rounded-md px-3 py-1.5 text-xs font-medium">Back</span>
          </div>
        </div>
        {/* Tab strip: ⚙ | Series 1 | (Series 2) | + */}
        <div className="flex items-center border-b border-border">
          <span className="px-2 py-1.5 text-muted-foreground">
            <Settings className="h-3.5 w-3.5" />
          </span>
          <span className={tabClass(activeTab === 0)}>Damage</span>
          {hasNewSeries && <span className={tabClass(activeTab === 1)}>Series 2</span>}
          <span className="px-2 py-1.5 text-muted-foreground" data-demo-add-series>
            <Plus className="h-3.5 w-3.5" />
          </span>
        </div>
        {/* Series form */}
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">Name</span>
            <span className="flex-1 rounded border border-input bg-background/60 px-2 py-1">
              {activeTab === 1 ? 'Series 2' : 'Damage'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">Stream</span>
            <div className="flex gap-1" data-demo-streams>
              {STREAMS.map((st) => {
                const selected = activeTab === 1 ? newStream === st : st === 'damage'
                return (
                  <span
                    key={st}
                    className={
                      selected
                        ? 'rounded bg-primary/20 px-2 py-1 font-medium text-primary'
                        : 'rounded bg-muted/50 px-2 py-1 text-muted-foreground'
                    }
                    data-demo-stream={st}
                  >
                    {st}
                  </span>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">Aggregation</span>
            <div className="flex gap-1" data-demo-aggs>
              {(Object.keys(AGGREGATIONS) as AggregationType[]).map((agg) => {
                const selected = activeTab === 1 ? newAggregation === agg : agg === 'sum'
                return (
                  <span
                    key={agg}
                    className={
                      selected
                        ? 'rounded bg-primary/20 px-2 py-1 font-medium text-primary'
                        : 'rounded bg-muted/50 px-2 py-1 text-muted-foreground'
                    }
                    data-demo-agg={agg}
                  >
                    {AGGREGATIONS[agg].label}
                  </span>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-muted-foreground">Color</span>
            <div className="flex gap-1.5" data-demo-colors>
              {COLORS.map((c) => {
                const selected = activeTab === 1 ? newColor === c : c === '#ef4444'
                return (
                  <span
                    key={c}
                    className="inline-block h-5 w-5 rounded-full"
                    style={{ background: c, outline: selected ? '2px solid white' : 'none', outlineOffset: 1 }}
                    data-demo-color={c}
                  />
                )
              })}
            </div>
          </div>
          <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
            Each series has its own stream, aggregation, color, and filters — build exactly the
            comparison you want.
          </p>
        </div>
      </div>
      <footer className="flex h-8 shrink-0 items-center border-t border-border px-3 font-mono text-2xs text-muted-foreground">
        <span>52.4K events (612.1K/s)</span>
        <span className="ml-auto text-chart-1">38ms</span>
      </footer>
    </section>
  )
}
