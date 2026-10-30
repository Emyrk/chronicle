import { useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveDateAxis } from "@/pages/ArmoryPage/overview/PerformanceExplorer";
import { performanceParseColor, performanceTrendValue } from "@/pages/ArmoryPage/overview/performanceExplorerModel";
import type { GuildSpeedrunRun } from "@/api/typesGenerated";
import type { GuildHistoryDisplay, GuildHistoryTiming } from "./guildHistoryState";
import {
  focusLabel,
  formatClearTime,
  formatGuildValue,
  GUILD_HISTORY_MAX_TIME_HOURS,
  guildHistoryValueIsShown,
  guildRunValue,
  NO_FOCUS,
  summarizeClearTimes,
  type GuildFocus,
} from "./guildHistoryModel";

const TREND_COLOR = "#34d399";
const TYPICAL_COLOR = "#94a3b8";

export interface ClearTimeSeries {
  id: string;
  name: string;
  color: string;
  runs: readonly GuildSpeedrunRun[];
}

/** Clear time (lower is faster) or time parse (higher is better) per raid night, one line per guild. */
export function ClearTimeChart({
  series,
  timing,
  focus = NO_FOCUS,
  display = "time",
  loading,
  includeUnqualified,
  unqualifiedRunCount,
  onIncludeUnqualifiedChange,
}: {
  series: readonly ClearTimeSeries[];
  timing: GuildHistoryTiming;
  /** Chart one part of each clear, or one boss's kill times, instead of whole clears. */
  focus?: GuildFocus;
  display?: GuildHistoryDisplay;
  loading: boolean;
  includeUnqualified: boolean;
  unqualifiedRunCount: number;
  onIncludeUnqualifiedChange: (value: boolean) => void;
}) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const parse = display === "parse";

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading clears…</div>;

  const allPoints = series.flatMap((item) => item.runs.flatMap((run) => {
    const value = guildRunValue(run, timing, focus, display);
    if (value === null) return [];
    const timestamp = Date.parse(run.completion_time);
    return [{ id: `${item.id}-${run.slug}`, guild: item, run, value, timestamp, day: startOfLocalDay(timestamp) }];
  }));
  const omittedLongValues = allPoints.filter((point) => !guildHistoryValueIsShown(point.value, display)).length;
  const points = allPoints.filter((point) => guildHistoryValueIsShown(point.value, display));
  if (points.length === 0) {
    const hiddenUnqualified = !includeUnqualified && unqualifiedRunCount > 0 && !focus.boss && !focus.part && !parse;
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
        <span>
          {hiddenUnqualified
            ? "No full qualified clears."
            : omittedLongValues > 0
              ? `${omittedLongValues} ${omittedLongValues === 1 ? "clear" : "clears"} over ${GUILD_HISTORY_MAX_TIME_HOURS} hours not shown.`
              : parse
                ? "No time parses for these clears yet. Parses need enough comparable clears on the server."
                : focus.boss ? `No ${focus.boss} kills match these filters.` : "No clears match these filters."}
        </span>
        {hiddenUnqualified && (
          <button
            type="button"
            onClick={() => onIncludeUnqualifiedChange(true)}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20"
          >
            <span className="size-2.5 rounded-full border-2 border-amber-300" aria-hidden="true" />
            Show {unqualifiedRunCount} unqualified {unqualifiedRunCount === 1 ? "clear" : "clears"}
          </button>
        )}
      </div>
    );
  }

  const incompleteRunCount = points.filter((point) => !point.run.complete).length;
  const values = points.map((point) => point.value);
  const format = (value: number) => formatGuildValue(value, parse);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, max * 0.1, parse ? 5 : focus.boss ? 5_000 : 60_000);
  const floor = Math.max(0, min - spread * 0.2);
  const ceiling = parse ? Math.min(100, max + spread * 0.2) : max + spread * 0.2;
  const minTime = Math.min(...points.map((point) => point.day));
  const maxTime = Math.max(...points.map((point) => point.day));
  const x = (timestamp: number) => minTime === maxTime ? 50 : 6 + ((timestamp - minTime) / (maxTime - minTime)) * 88;
  const y = (value: number) => 90 - ((value - floor) / (ceiling - floor)) * 76;
  const yAxisTicks = [20, 40, 60, 80].map((position) => ({
    position,
    value: floor + ((90 - position) / 76) * (ceiling - floor),
  }));
  // With one guild, draw its typical clear and trend so improvement is visible.
  const single = series.length === 1 ? summarizeClearTimes(series[0].runs, timing, focus, display) : null;
  const trendLine = single?.trend && minTime !== maxTime
    ? {
        start: performanceTrendValue(single.trend, minTime),
        end: performanceTrendValue(single.trend, maxTime),
        perWeek: single.trend.slope * 7,
      }
    : null;
  const activeDay = hoverDay !== null && points.some((point) => point.day === hoverDay) ? hoverDay : null;
  const hovered = activeDay === null
    ? []
    : points.filter((point) => point.day === activeDay).sort((a, b) => a.value - b.value);
  const hoverX = activeDay === null ? null : x(activeDay);

  const updateHoverDay = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const days = [...new Set(points.map((point) => point.day))];
    const distance = (day: number) => Math.abs((x(day) / 100) * bounds.width - pointerX);
    const nearest = days.reduce((best, day) => distance(day) < distance(best) ? day : best, days[0]);
    setHoverDay(distance(nearest) <= 12 ? nearest : null);
  };

  return (
    <div
      className="relative h-72 cursor-crosshair overflow-visible rounded-lg border border-border/70 bg-black/10"
      onPointerMove={updateHoverDay}
      onPointerLeave={() => setHoverDay(null)}
    >
      <div className="pointer-events-none absolute top-1.5 right-2 left-2 z-10 flex flex-wrap justify-end gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {omittedLongValues > 0 && (
          <span className="rounded border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 font-medium text-amber-200">
            {omittedLongValues} {omittedLongValues === 1 ? "clear" : "clears"} over {GUILD_HISTORY_MAX_TIME_HOURS} hours not shown
          </span>
        )}
        {(focus.boss || focus.part) && (
          <span className="font-medium text-sky-300">
            {focus.boss ? `${focus.boss} kill ${parse ? "parse" : "time"}` : focusLabel(focus)}
          </span>
        )}
        {unqualifiedRunCount > 0 && (
          <button
            type="button"
            onClick={() => onIncludeUnqualifiedChange(!includeUnqualified)}
            aria-pressed={includeUnqualified}
            className={`pointer-events-auto inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${includeUnqualified ? "bg-amber-500/15 text-amber-200" : "hover:bg-white/5 hover:text-foreground"}`}
          >
            <span className="size-2.5 rounded-full border-2 border-amber-300" aria-hidden="true" />
            Unqualified ({unqualifiedRunCount})
          </button>
        )}
        {incompleteRunCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-amber-200">
            <span className="size-2.5 rounded-sm border-2 border-amber-300" aria-hidden="true" />
            Incomplete ({incompleteRunCount})
          </span>
        )}
        <span>{parse ? "Higher is better" : "Lower is faster"}</span>
        {single && (
          <div className="flex items-center gap-2">
            <span className="w-6 border-t-2 border-dashed" style={{ borderColor: TYPICAL_COLOR }} aria-hidden="true" />
            <span>Typical</span>
            <span className="font-mono font-medium tabular-nums text-foreground">{format(single.typical)}</span>
          </div>
        )}
        {trendLine && (
          <div className="flex items-center gap-2">
            <span className="w-6 border-t-2" style={{ borderColor: TREND_COLOR }} aria-hidden="true" />
            <span>Trend</span>
            <span className="font-mono font-medium tabular-nums" style={{ color: TREND_COLOR }}>
              {trendLine.perWeek < 0 ? "−" : "+"}{format(Math.abs(trendLine.perWeek))}/wk
            </span>
          </div>
        )}
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none h-full w-full" aria-hidden="true">
        {yAxisTicks.map((tick) => (
          <line key={tick.position} x1="4" x2="96" y1={tick.position} y2={tick.position} stroke="currentColor" strokeWidth="0.25" className="text-border" vectorEffect="non-scaling-stroke" />
        ))}
        {single && (
          <line x1="4" x2="96" y1={y(single.typical)} y2={y(single.typical)} stroke={TYPICAL_COLOR} strokeWidth="1" strokeDasharray="7 5" opacity="0.7" vectorEffect="non-scaling-stroke" />
        )}
        {trendLine && (
          <line
            x1={x(minTime)}
            x2={x(maxTime)}
            y1={y(trendLine.start)}
            y2={y(trendLine.end)}
            stroke={TREND_COLOR}
            strokeWidth="1.5"
            opacity="0.9"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {hoverX !== null && (
          <line x1={hoverX} x2={hoverX} y1="14" y2="90" stroke="rgb(148 163 184)" strokeWidth="1" opacity="0.8" vectorEffect="non-scaling-stroke" />
        )}
        {series.map((item) => {
          // Several groups can clear on one night; the line follows each night's fastest clear.
          const fastestByDay = new Map<number, number>();
          for (const point of points) {
            if (point.guild.id !== item.id) continue;
            fastestByDay.set(point.day, Math.min(fastestByDay.get(point.day) ?? Infinity, point.value));
          }
          const line = [...fastestByDay.entries()].sort(([a], [b]) => a - b);
          if (line.length < 2) return null;
          return (
            <polyline
              key={item.id}
              points={line.map(([day, value]) => `${x(day)},${y(value)}`).join(" ")}
              fill="none"
              stroke={item.color}
              strokeWidth="1.4"
              opacity="0.8"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {yAxisTicks.map((tick) => (
        <span
          key={tick.position}
          className="pointer-events-none absolute left-2 z-[2] -translate-y-1/2 rounded bg-zinc-950/75 px-1 font-mono text-[10px] tabular-nums text-muted-foreground backdrop-blur-sm"
          style={{ top: `${tick.position}%` }}
        >
          {parse
            ? Math.round(tick.value)
            : focus.boss || tick.value < 10 * 60_000 ? formatClearTime(tick.value) : `${Math.round(tick.value / 60_000)}m`}
        </span>
      ))}
      {points.map(({ id, guild, run, value, day }) => (
        <Link
          key={id}
          to={`/instances/${run.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2"
          style={{ left: `${x(day)}%`, top: `${y(value)}%`, "--tw-ring-color": guild.color } as React.CSSProperties}
          aria-label={`${guild.name}, ${new Date(run.completion_time).toLocaleDateString()}, ${format(value)}${parse ? " parse" : ""}${!run.complete ? ", incomplete" : !run.qualified ? ", unqualified" : ""}`}
        >
          <span
            className={`size-2.5 border-2 transition-transform ${run.complete ? "rounded-full" : "rounded-sm"}`}
            style={{
              borderColor: run.complete ? guild.color : "rgb(252 211 77)",
              backgroundColor: run.qualified ? guild.color : "transparent",
              boxShadow: run.complete ? undefined : "0 0 0 2px rgb(245 158 11 / 0.18)",
              transform: activeDay === day ? "scale(1.35)" : undefined,
            }}
          />
        </Link>
      ))}
      {hoverX !== null && hovered.length > 0 && (
        <div
          className="pointer-events-none absolute top-3 z-30 min-w-56 rounded-md border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-xl shadow-black/40 backdrop-blur-sm"
          style={hoverX > 68 ? { right: `${100 - hoverX + 1}%` } : { left: `${hoverX + 1}%` }}
        >
          <div className="mb-1.5 border-b border-white/10 pb-1.5 font-medium text-muted-foreground">
            {new Date(activeDay!).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </div>
          <div className="space-y-1.5">
            {hovered.map(({ id, guild, run, value }) => (
              <div key={id}>
                <div className="flex items-center justify-between gap-5">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: guild.color }} />
                    <span className="truncate">{guild.name}</span>
                  </span>
                  <span className="shrink-0 font-mono font-semibold tabular-nums" style={{ color: parse ? performanceParseColor(value) : guild.color }}>
                    {format(value)}
                  </span>
                </div>
                <div className="ml-4 mt-0.5 text-[10px] text-muted-foreground">
                  {run.player_count} players
                  {parse && focus.boss && ` · kill ${formatClearTime(run.bosses.find((kill) => kill.encounter_name === focus.boss)?.duration_ms ?? 0)}`}
                  {focus.boss || focus.part || parse
                    ? ` · clear ${formatClearTime(run.duration_ms)}`
                    : timing === "full" && run.boss_to_boss_duration_ms > 0 && ` · boss to boss ${formatClearTime(run.boss_to_boss_duration_ms)}`}
                  {!run.complete ? " · incomplete" : !run.qualified && " · unqualified"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ResponsiveDateAxis minTime={minTime} maxTime={maxTime} />
    </div>
  );
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
