import { useMemo, useRef, type PointerEvent } from "react";
import { Pause, Play, RotateCcw, Skull } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import type { StripRenderProps } from "./types";
import type { ReplayControllerResult } from "./replayController.processor";
import {
  formatReplayClock,
  replayControllerBars,
  replayControllerMarkers,
  replayControllerTicks,
  type ReplayBounds,
} from "./replayControllerModel";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

const controlButtonClass = "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-popover text-foreground hover:bg-muted disabled:opacity-40";

/**
 * Replay transport over a bar chart of party damage: play, restart, speed,
 * and drag anywhere on the bars to scrub. Played bars fill in as the cursor
 * passes; deaths and boss casts mark the top.
 */
export function ReplayControllerStrip({ result, context }: StripRenderProps<ReplayControllerResult>) {
  const sync = useSyncModeContextOptional();
  const trackRef = useRef<HTMLDivElement>(null);
  const boundsDates = sync?.encounterBounds ?? null;
  const bounds = useMemo((): ReplayBounds | null =>
    boundsDates ? { startMs: boundsDates.start.getTime(), endMs: boundsDates.end.getTime() } : null,
  [boundsDates]);
  const enabled = Boolean(sync?.enabled);
  const cursorMs = enabled && sync?.currentTimestamp ? sync.currentTimestamp.getTime() : null;
  const youtubeActive = sync?.externalDriver === "youtube";
  const disabled = !sync || !bounds || youtubeActive;

  const bossGuids = useMemo(() => new Set(context.instance.encounters
    .flatMap((encounter) => encounter.enemies?.filter((enemy) => enemy.boss).map((enemy) => enemy.id) ?? [])),
  [context.instance.encounters]);
  const bars = useMemo(() => bounds ? replayControllerBars(result, bounds, cursorMs) : [], [bounds, cursorMs, result]);
  const markers = useMemo(() => bounds
    ? replayControllerMarkers(result, bounds, cursorMs, bossGuids, (guid) => context.instance.units?.[guid]?.name ?? context.instance.players?.[guid]?.name ?? "Boss")
    : [],
  [bossGuids, bounds, context.instance.players, context.instance.units, cursorMs, result]);
  const ticks = useMemo(() => bounds ? replayControllerTicks(bounds) : [], [bounds]);

  const durationMs = bounds ? Math.max(0, bounds.endMs - bounds.startMs) : 0;
  const elapsedMs = bounds && cursorMs !== null ? Math.min(durationMs, Math.max(0, cursorMs - bounds.startMs)) : durationMs;
  const headPercent = durationMs > 0 ? (elapsedMs / durationMs) * 100 : 0;
  const playing = enabled && Boolean(sync?.isPlaying);

  // Replay turns on with the first play or scrub, like the design: no separate enable step.
  const seek = (timestampMs: number) => {
    if (!sync) return;
    if (!sync.enabled) sync.enable();
    sync.setTimestamp(new Date(timestampMs));
  };

  const togglePlay = () => {
    if (!sync || !bounds) return;
    if (playing) {
      sync.pause();
      return;
    }
    if (!sync.enabled || cursorMs === null || cursorMs >= bounds.endMs) seek(bounds.startMs);
    sync.play();
  };

  const restart = () => {
    if (!sync || !bounds) return;
    seek(bounds.startMs);
    sync.play();
  };

  const scrubTo = (clientX: number) => {
    const track = trackRef.current;
    if (!track || !bounds) return;
    const rect = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
    seek(bounds.startMs + fraction * durationMs);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubTo(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubTo(event.clientX);
  };

  return (
    <div className="flex h-full min-h-0 items-center gap-4 bg-card px-3">
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={togglePlay} disabled={disabled} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"} className={controlButtonClass}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button type="button" onClick={restart} disabled={disabled} title="Restart" aria-label="Restart" className={controlButtonClass}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <span className="min-w-[4.5rem] pl-1 font-mono text-sm tabular-nums text-[var(--color-class-warrior)]">
          {formatReplayClock(elapsedMs)}
          <span className="text-xs text-muted-foreground"> / {formatReplayClock(durationMs)}</span>
        </span>
        <div className="flex gap-0.5 rounded-md border border-border bg-popover p-0.5">
          {SPEEDS.map((speed) => {
            const active = (sync?.playbackSpeed ?? 1) === speed;
            return (
              <button
                key={speed}
                type="button"
                disabled={disabled}
                onClick={() => sync?.setPlaybackSpeed(speed)}
                aria-pressed={active}
                className={cn(
                  "rounded-sm px-2 py-1 font-mono text-[11px] disabled:opacity-40",
                  active ? "bg-primary-darker text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {speed}×
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex h-full min-w-0 flex-1 flex-col justify-center py-1.5">
        <div
          ref={trackRef}
          role="slider"
          aria-label="Replay position"
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs / 1000)}
          aria-valuenow={Math.round(elapsedMs / 1000)}
          aria-valuetext={formatReplayClock(elapsedMs)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          className={cn("relative h-[60px] select-none touch-none", disabled ? "cursor-default opacity-50" : "cursor-pointer")}
        >
          <div className="absolute inset-x-0 bottom-[18px] top-[14px] flex items-stretch gap-px">
            {bars.map((bar) => (
              <div key={bar.startMs} className="relative min-w-0 flex-1" title={`${formatReplayClock(bar.startMs - (bounds?.startMs ?? 0))} · ${Math.round(bar.value).toLocaleString()} damage`}>
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t-[1px]"
                  style={{ height: `${bar.height}%`, background: bar.state === "current" ? "rgba(255,255,255,.22)" : bar.state === "future" ? "rgba(255,255,255,.08)" : "transparent" }}
                />
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t-[1px]"
                  style={{ height: `${bar.fill}%`, background: bar.state === "current" ? "var(--chart-5)" : "var(--chart-3)" }}
                />
              </div>
            ))}
          </div>
          {markers.map((marker, index) => (
            <div
              key={`${marker.kind}-${index}`}
              title={marker.title}
              className="absolute top-0 flex h-3 -translate-x-1/2 items-center"
              style={{ left: `${marker.left}%`, opacity: marker.past ? 1 : 0.3 }}
            >
              {marker.kind === "death"
                ? <Skull className="h-3 w-3 text-red-400" />
                : <span className="h-[7px] w-[7px] rotate-45 bg-[var(--color-class-enemy)] shadow-[0_0_0_1px_#000]" />}
            </div>
          ))}
          <div className="pointer-events-none absolute bottom-[16px] top-[12px] w-px bg-white/55" style={{ left: `${headPercent}%` }} />
          <div className="pointer-events-none absolute inset-x-0 bottom-[6px] h-1 overflow-hidden rounded-sm bg-[#3a3a3a]">
            <div className="h-full bg-[var(--color-class-warrior)]" style={{ width: `${headPercent}%` }} />
          </div>
          <div
            className="pointer-events-none absolute bottom-[1px] -ml-[7px] h-3.5 w-3.5 rounded-full bg-[var(--color-class-warrior)] shadow-[0_0_0_2px_var(--card),0_1px_4px_rgba(0,0,0,.6)]"
            style={{ left: `${headPercent}%` }}
          />
        </div>
        <div className="relative h-3.5">
          {ticks.map((tick) => (
            <span
              key={tick.label}
              className={cn(
                "absolute top-0 whitespace-nowrap font-mono text-[10px] text-muted-foreground",
                tick.align === "center" && "-translate-x-1/2",
                tick.align === "end" && "-translate-x-full",
              )}
              style={{ left: `${tick.left}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom-aligned so the strip's hover bar (selector, Filters, Edit) never covers it. */}
      <div className="hidden shrink-0 flex-col gap-1 self-end pb-2 text-[11px] text-muted-foreground xl:flex">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-[var(--chart-3)]" />Party damage / 2s</span>
        <span className="flex items-center gap-1.5"><span className="h-[7px] w-[7px] rotate-45 bg-[var(--color-class-enemy)]" />Boss cast</span>
        <span className="flex items-center gap-1.5"><Skull className="h-2.5 w-2.5 text-red-400" />Death</span>
      </div>
    </div>
  );
}
