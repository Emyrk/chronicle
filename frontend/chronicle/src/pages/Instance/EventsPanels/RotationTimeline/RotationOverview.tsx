import { useMemo, useRef, useState, type PointerEvent } from "react";
import { formatNumber } from "@/lib/format";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { DPS_SMOOTHING_BINS } from "./derive";
import { DAMAGE_BIN_MS } from "./rotationTimeline.processor";
import { formatClock, SLOT_COLORS } from "./format";
import { IndicatorLine } from "./IndicatorLine";
import type { RotationView } from "./useRotationView";

export interface OverviewSeries {
  name: string;
  dps: readonly number[];
}

interface RotationOverviewProps {
  series: readonly OverviewSeries[];
  /** Cumulative damage of series[0] minus series[1], per bin. */
  lead: readonly number[] | null;
  view: RotationView;
}

const W = 1000;
const H = 60;
const LEAD_BARS = 60;

function linePath(values: readonly number[], max: number, bins: number): string {
  if (values.length === 0 || max <= 0) return "";
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${((i + 0.5) / bins) * W},${H - (v / max) * (H - 4)}`)
    .join("");
}

/**
 * Whole-encounter DPS strip with the damage lead behind it. Drag to zoom the
 * timeline to a range; click to center the current zoom on a point.
 */
export function RotationOverview({ series, lead, view }: RotationOverviewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const { durationMs } = view;
  const bins = Math.max(1, Math.ceil(durationMs / DAMAGE_BIN_MS));

  const paths = useMemo(() => {
    const max = Math.max(1, ...series.flatMap((s) => s.dps));
    return series.map((s) => {
      const line = linePath(s.dps, max, bins);
      return { line, area: line ? `${line}L${W},${H}L0,${H}Z` : "" };
    });
  }, [series, bins]);

  const leadBars = useMemo(() => {
    if (!lead || lead.length === 0) return [];
    const maxAbs = Math.max(1, ...lead.map(Math.abs));
    const step = Math.max(1, Math.floor(lead.length / LEAD_BARS));
    const bars: { pos: number; w: number; h: number; ahead: boolean }[] = [];
    for (let i = 0; i < lead.length; i += step) {
      const v = lead[Math.min(lead.length - 1, i + step - 1)];
      bars.push({ pos: (i / bins) * 100, w: (step / bins) * 100, h: (Math.abs(v) / maxAbs) * 50, ahead: v >= 0 });
    }
    return bars;
  }, [lead, bins]);

  const fracAt = (e: PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = fracAt(e);
    setBrush([f, f]);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const f = fracAt(e);
    // Overview time is pull time, which matches the lanes when aligned to pull.
    view.setCursorMs(f * durationMs);
    if (brush) setBrush([brush[0], f]);
  };
  const onPointerUp = () => {
    if (!brush) return;
    const a = Math.min(...brush) * durationMs;
    const b = Math.max(...brush) * durationMs;
    if (b - a > 1500) view.setWindow(a, b);
    else {
      const span = view.endMs - view.startMs;
      view.setWindow(a - span / 2, a + span / 2);
    }
    setBrush(null);
  };

  const pct = (ms: number) => (ms / Math.max(1, durationMs)) * 100;
  const indicator = view.indicatorMs;
  const indicatorBin = indicator != null ? Math.min(bins - 1, Math.max(0, Math.floor(indicator / DAMAGE_BIN_MS))) : null;

  return (
    <div className="border-b border-border px-4 py-2.5">
      <div className="mb-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-3">
          <HintTooltip>
            <TooltipTrigger asChild>
              <span className="flex cursor-help items-center gap-1.5 decoration-dotted underline-offset-2 hover:underline">
                <span className="h-0.5 w-3 bg-muted-foreground" />
                DPS
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="max-w-80 p-3 text-left">
              <DpsLegendHint />
            </TooltipContent>
          </HintTooltip>
          {lead && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2 bg-muted-foreground/50" />
              Total damage lead
            </span>
          )}
        </span>
        <span className="flex gap-3.5">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3" style={{ background: SLOT_COLORS[i] }} />
              {s.name}
            </span>
          ))}
        </span>
      </div>
      <div
        ref={ref}
        className="relative h-[76px] cursor-crosshair touch-none select-none rounded-sm border border-border bg-background"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => view.setCursorMs(null)}
      >
        {lead && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border" />
            {leadBars.map((bar, i) => (
              <div
                key={i}
                className="pointer-events-none absolute opacity-30"
                style={{
                  left: `${bar.pos}%`,
                  width: `${bar.w}%`,
                  top: bar.ahead ? `${50 - bar.h}%` : "50%",
                  height: `${bar.h}%`,
                  background: SLOT_COLORS[bar.ahead ? 0 : 1],
                }}
              />
            ))}
          </>
        )}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          {paths.map((p, i) => (
            <path key={`a${i}`} d={p.area} style={{ fill: `color-mix(in oklab, ${SLOT_COLORS[i]} 16%, transparent)` }} />
          ))}
          {paths.map((p, i) => (
            <path
              key={`l${i}`}
              d={p.line}
              fill="none"
              stroke={SLOT_COLORS[i]}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        <div
          className="pointer-events-none absolute inset-y-0 border-x border-foreground bg-foreground/10"
          style={{ left: `${pct(view.startMs)}%`, width: `${pct(view.endMs - view.startMs)}%` }}
        />
        {indicator != null && <IndicatorLine leftPct={pct(indicator)} />}
        {brush && (
          <div
            className="pointer-events-none absolute inset-y-0 border border-dashed border-school-holy bg-school-holy/20"
            style={{ left: `${Math.min(...brush) * 100}%`, width: `${Math.abs(brush[1] - brush[0]) * 100}%` }}
          />
        )}
        {indicator != null && indicatorBin != null && (
          <span
            className="pointer-events-none absolute top-0.5 z-10 -translate-x-1/2 whitespace-nowrap rounded-sm border border-border bg-popover px-1.5 font-mono text-[10px]"
            style={{ left: `${Math.min(92, Math.max(8, pct(indicator)))}%` }}
          >
            {formatClock(indicator)}
            {series.map((s, i) => (
              <span key={s.name} className="ml-2" style={{ color: SLOT_COLORS[i] }}>
                {formatNumber(Math.round(s.dps[indicatorBin] ?? 0))}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function DpsLegendHint() {
  const windowS = (DPS_SMOOTHING_BINS * DAMAGE_BIN_MS) / 1000;
  return (
    <div className="flex flex-col gap-2 text-xs leading-relaxed">
      <div className="text-sm font-semibold">DPS · {windowS}s trailing average</div>
      <p className="text-zinc-300">
        Each point is the player&apos;s damage (pets and procs included) over the previous {windowS} seconds,
        divided by {windowS}. At 1:20 the line shows damage dealt from 1:15 to 1:20.
      </p>
      <ul className="list-disc space-y-1 pl-4 text-zinc-400">
        <li>Smoothing hides single big hits, so bursts show up as humps rather than spikes.</li>
        <li>A trailing window lags: a burst appears about {windowS / 2}s after it happened.</li>
        <li>The first {windowS - 1} seconds average over fewer seconds so the line does not start low.</li>
        <li>The DPS next to each name is total damage over the whole fight, so it will not match any one point.</li>
      </ul>
    </div>
  );
}
