import { useMemo, useRef, useState, type PointerEvent } from "react";
import { Pin, X } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { DPS_SMOOTHING_BINS } from "./derive";
import { DAMAGE_BIN_MS } from "./rotationTimeline.processor";
import { formatClock, SLOT_COLORS, SLOT_TEXT_COLORS } from "./format";
import { IndicatorLine } from "./IndicatorLine";
import type { RotationView } from "./useRotationView";

export interface OverviewSeries {
  name: string;
  dps: readonly number[];
  /** Whole-fight average DPS, shown when nothing is under the indicator. */
  avgDps: number;
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

  const maxDps = useMemo(() => Math.max(1, ...series.flatMap((s) => s.dps)), [series]);
  const paths = useMemo(() => {
    return series.map((s) => {
      const line = linePath(s.dps, maxDps, bins);
      return { line, area: line ? `${line}L${W},${H}L0,${H}Z` : "" };
    });
  }, [series, bins, maxDps]);

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
    if (e.shiftKey) return; // Shift+click flips the page.
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = fracAt(e);
    setBrush([f, f]);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const f = fracAt(e);
    // Overview time is pull time, which matches the lanes when aligned to pull.
    view.setCursorMs(f * durationMs, "overview");
    if (brush) setBrush([brush[0], f]);
  };
  const onPointerUp = () => {
    if (!brush) return;
    const a = Math.min(...brush) * durationMs;
    const b = Math.max(...brush) * durationMs;
    if (b - a > 1500) view.setWindow(a, b);
    else {
      // A click pins the indicator (and scrolls the lanes to it).
      const width = ref.current?.getBoundingClientRect().width ?? 0;
      view.pinAt(a, width > 0 ? (6 / width) * durationMs : 0);
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
            <HintTooltip>
              <TooltipTrigger asChild>
                <span className="flex cursor-help items-center gap-1.5 decoration-dotted underline-offset-2 hover:underline">
                  <span className="h-2.5 w-2 bg-muted-foreground/50" />
                  Damage lead
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-80 p-3 text-left">
                <LeadLegendHint names={series.map((s) => s.name)} />
              </TooltipContent>
            </HintTooltip>
          )}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_176px] gap-2.5">
        <div
          ref={ref}
          className="relative min-h-[76px] cursor-crosshair touch-none select-none rounded-sm border border-border bg-background"
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
          {view.pinnedMs != null && (
            <button
              type="button"
              // Keep the chart from treating this click as a brush or a new pin.
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={view.unpin}
              title="Unpin (Esc)"
              className="absolute left-1.5 top-1 z-20 cursor-pointer select-none rounded border border-red-500/30 bg-red-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-red-400 transition-colors hover:border-red-400/50 hover:bg-red-950/60 hover:text-red-300"
            >
              Unpin
            </button>
          )}
          {indicator != null && pct(indicator) >= 0 && pct(indicator) <= 100 && (
            <span
              className="pointer-events-none absolute top-0.5 z-10 -translate-x-1/2 rounded-sm bg-school-holy px-1 font-mono text-[10px] font-semibold text-background"
              style={{ left: `${Math.min(96, Math.max(4, pct(indicator)))}%` }}
            >
              {formatClock(indicator)}
            </span>
          )}
          {brush && (
            <div
              className="pointer-events-none absolute inset-y-0 border border-dashed border-school-holy bg-school-holy/20"
              style={{ left: `${Math.min(...brush) * 100}%`, width: `${Math.abs(brush[1] - brush[0]) * 100}%` }}
            />
          )}
        </div>
        <Scoreboard
          series={series}
          lead={lead}
          bin={indicatorBin}
          timeMs={indicator}
          maxDps={maxDps}
          pinned={view.pinnedMs != null}
          onUnpin={view.unpin}
        />
      </div>
    </div>
  );
}

function LeadLegendHint({ names }: { names: string[] }) {
  return (
    <div className="flex flex-col gap-2 text-xs leading-relaxed">
      <div className="text-sm font-semibold">Damage lead</div>
      <p className="text-zinc-300">
        Total damage so far, {names[0] ?? "A"} minus {names[1] ?? "B"}.
      </p>
      <ul className="list-disc space-y-0.5 pl-4 text-zinc-400">
        <li>
          Above the line: <span style={{ color: SLOT_TEXT_COLORS[0] }}>{names[0] ?? "A"}</span> is ahead. Below:{" "}
          <span style={{ color: SLOT_TEXT_COLORS[1] }}>{names[1] ?? "B"}</span> is ahead.
        </li>
        <li>Bars are scaled to the biggest lead in the fight.</li>
      </ul>
    </div>
  );
}

function DpsLegendHint() {
  const windowS = (DPS_SMOOTHING_BINS * DAMAGE_BIN_MS) / 1000;
  return (
    <div className="flex flex-col gap-2 text-xs leading-relaxed">
      <div className="text-sm font-semibold">DPS · {windowS}s trailing average</div>
      <p className="text-zinc-300">Damage over the last {windowS}s, divided by {windowS}. Pets included.</p>
      <ul className="list-disc space-y-0.5 pl-4 text-zinc-400">
        <li>Bursts lag by about {windowS / 2}s.</li>
        <li>Smoothing turns single big hits into humps, not spikes.</li>
      </ul>
    </div>
  );
}

/** Signed "+1.2K" / "−1.2K" in the leader's color (A when ≥ 0). */
function signed(value: number): { text: string; color: string } {
  const v = Math.round(value);
  return {
    text: `${v >= 0 ? "+" : "−"}${formatNumber(Math.abs(v))}`,
    color: SLOT_TEXT_COLORS[v >= 0 ? 0 : 1],
  };
}

interface ScoreboardProps {
  series: readonly OverviewSeries[];
  lead: readonly number[] | null;
  /** Bin under the indicator, or null to show whole-fight figures. */
  bin: number | null;
  timeMs: number | null;
  maxDps: number;
  pinned: boolean;
  onUnpin: () => void;
}

/**
 * Fixed readout beside the chart (design: Crosshair Readout 1c). Shows values
 * at the indicator, or whole-fight figures when there is no indicator.
 */
function Scoreboard({ series, lead, bin, timeMs, maxDps, pinned, onUnpin }: ScoreboardProps) {
  const dps = series.map((s) => (bin != null ? (s.dps[bin] ?? 0) : s.avgDps));
  const leadValue = lead && lead.length > 0 ? (bin != null ? (lead[bin] ?? 0) : lead[lead.length - 1]) : null;
  const gap = series.length === 2 ? signed(dps[0] - dps[1]) : null;
  const leadText = leadValue != null ? signed(leadValue) : null;
  return (
    <div className="flex flex-col justify-between gap-1 rounded-sm border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <div className="flex items-center justify-between">
        {pinned ? (
          <button
            type="button"
            onClick={onUnpin}
            title="Unpin (Esc)"
            className="flex items-center gap-1 rounded-sm text-foreground hover:text-destructive"
          >
            <Pin className="size-3" />
            Pinned
            <X className="size-3" />
          </button>
        ) : (
          <span>{bin != null ? "At" : "Whole fight"}</span>
        )}
        {timeMs != null && bin != null && (
          <span className="rounded-sm bg-school-holy px-1.5 font-mono font-semibold text-background">{formatClock(timeMs)}</span>
        )}
      </div>
      {series.map((s, i) => (
        <div key={s.name} className="flex flex-col gap-0.5">
          <div className="flex justify-between gap-2">
            <span className="truncate">{s.name}</span>
            <span className="font-mono font-semibold text-foreground">{formatNumber(Math.round(dps[i]))}</span>
          </div>
          <div className="h-1 rounded-sm bg-muted">
            <div
              className="h-full rounded-sm"
              style={{ width: `${Math.min(100, (dps[i] / maxDps) * 100)}%`, background: SLOT_COLORS[i] }}
            />
          </div>
        </div>
      ))}
      {(gap || leadText) && <div className="h-px bg-border" />}
      {gap && (
        <div className="flex justify-between" title="DPS difference at this second (A minus B)">
          <span>Gap</span>
          <span className="font-mono font-semibold" style={{ color: gap.color }}>
            {gap.text}
          </span>
        </div>
      )}
      {leadText && (
        <div className="flex justify-between" title="Damage difference so far (A minus B)">
          <span>Total lead</span>
          <span className="font-mono font-semibold" style={{ color: leadText.color }}>
            {leadText.text}
          </span>
        </div>
      )}
    </div>
  );
}
