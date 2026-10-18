import { useCallback, useMemo, useRef, type PointerEvent } from "react";
import { Pause, Play, PowerOff, RotateCcw, Skull } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { useReplayToggleKey } from "../../replayToggleKey";
import type { PanelContext, PanelDefinition } from "../types";
import { usePanelAggregation } from "../usePanelAggregation";
import { usePlayerLifeState } from "../usePlayerLifeState";
import { statusProcessor, type StatusProcessorEvent, type StatusResult } from "../Status/status.processor";
import { createStatusRaidHealthModel, statusRaidHealthAt, type StatusRaidHealthModel } from "../Status/statusRaidHealth";
import { useActualRaidDurabilityModel } from "../Status/useRaidDurabilityModel";
import type { StripRenderProps } from "./types";
import type { ReplayControllerResult } from "./replayController.processor";
import { raidHealthColor } from "./raidHealthColor";
import {
  formatBucket,
  formatReplayClock,
  replayBucketMs,
  replayControllerMarkers,
  replayControllerTicks,
  replayDamageBars,
  replayDurabilityBars,
  type ReplayBounds,
} from "./replayControllerModel";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

const DURABILITY_PANEL: PanelDefinition<StatusResult, StatusProcessorEvent> = {
  ...statusProcessor,
  label: "Replay Durability",
  icon: null,
  keybinds: [],
  syncDataMode: "full",
  render: () => null,
};

/**
 * Raid durability (0–100) at a time, for the controller's bars: one selected
 * encounter uses sampled health when the log has it (else the estimate), as
 * the Raid Durability strip does; several use each encounter's estimate.
 * Null outside every selected encounter.
 */
function useReplayDurability(context: PanelContext, enabled: boolean): (timestampMs: number) => number | null {
  const status = usePanelAggregation<StatusResult>({ panel: DURABILITY_PANEL, context, enabled });
  const playerLife = usePlayerLifeState(context);
  const encounters = useMemo(() => context.selectedEncounterIds
    .flatMap((id) => {
      const encounter = status.result.encounters.get(id);
      return encounter ? [encounter] : [];
    }), [context.selectedEncounterIds, status.result.encounters]);
  const single = encounters.length === 1 ? encounters[0] : null;
  const actual = useActualRaidDurabilityModel(context, single?.encounterId ?? null, single !== null);
  const players = context.instance.players;
  const segments = useMemo(() => encounters.map((encounter): { startMs: number; endMs: number; model: StatusRaidHealthModel } => {
    if (single && actual.supported && actual.available) return { startMs: encounter.startMilli, endMs: encounter.endMilli, model: actual.model };
    const transitions = playerLife.loading || playerLife.error
      ? undefined
      : new Map(Object.keys(players ?? {}).map((playerId) => [playerId, playerLife.state.transitions(encounter.encounterId, playerId)]));
    return {
      startMs: encounter.startMilli,
      endMs: encounter.endMilli,
      model: createStatusRaidHealthModel(Array.from(encounter.units.values()).filter((unit) => unit.kind === "player"), transitions),
    };
  }), [actual.available, actual.model, actual.supported, encounters, playerLife.error, playerLife.loading, playerLife.state, players, single]);
  return useCallback((timestampMs: number) => {
    const segment = segments.find((candidate) => timestampMs >= candidate.startMs && timestampMs <= candidate.endMs);
    return segment && segment.model.unitCount > 0 ? statusRaidHealthAt(segment.model, timestampMs).percent : null;
  }, [segments]);
}

const controlButtonClass = "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-popover text-foreground hover:bg-muted disabled:opacity-40";

/**
 * Replay transport over a bar chart of raid durability or party damage (the
 * Replay strip's variants): play, restart, speed, disable, and drag anywhere
 * on the bars to scrub. Played bars colour in as the cursor passes; player
 * deaths mark the top.
 */
export function ReplayControllerStrip({ result, context, bars: barKind }: StripRenderProps<ReplayControllerResult> & { bars: "durability" | "damage" }) {
  const damage = barKind === "damage";
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

  const bucketMs = bounds ? replayBucketMs(bounds.endMs - bounds.startMs) : 0;
  const durabilityAt = useReplayDurability(context, !damage);
  const bars = useMemo(() => {
    if (!bounds) return [];
    return damage ? replayDamageBars(result, bounds, cursorMs, bucketMs) : replayDurabilityBars(durabilityAt, bounds, cursorMs, bucketMs);
  }, [bounds, bucketMs, cursorMs, damage, durabilityAt, result]);
  const markers = useMemo(() => bounds ? replayControllerMarkers(result, bounds, cursorMs) : [], [bounds, cursorMs, result]);
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

  // X plays and pauses from anywhere on the page, as the Replay overlay's does.
  useReplayToggleKey(() => {
    if (disabled) return null;
    togglePlay();
    return playing ? "pause" : "play";
  });

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
    <div className="flex h-full min-h-0 items-center gap-3 bg-card px-3">
      {/* Stacked in a narrow column so the bars get the width: transport and clock, speeds, legend. */}
      <div className="flex shrink-0 flex-col gap-1">
        <div className="flex items-center gap-1">
          <button type="button" onClick={togglePlay} disabled={disabled} title={playing ? "Pause (X)" : "Play (X)"} aria-label={playing ? "Pause" : "Play"} className={controlButtonClass}>
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={restart} disabled={disabled} title="Restart" aria-label="Restart" className={controlButtonClass}>
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          {/* Replay turns on with the first play or scrub; this turns it back off.
              Always there (greyed while off) so the bars don't shift. */}
          <button
            type="button"
            onClick={() => sync?.disable()}
            disabled={!enabled || youtubeActive}
            title="Disable Replay"
            aria-label="Disable Replay"
            className={controlButtonClass}
          >
            <PowerOff className="h-3.5 w-3.5" />
          </button>
          <span className="pl-1 font-mono text-sm tabular-nums text-[var(--color-class-warrior)]">
            {formatReplayClock(elapsedMs)}
            <span className="text-[10px] text-muted-foreground"> / {formatReplayClock(durationMs)}</span>
          </span>
        </div>
        <div className="flex gap-px rounded-md border border-border bg-popover p-px">
          {SPEEDS.map((speed) => {
            const active = (sync?.playbackSpeed ?? 1) === speed;
            return (
              <button
                key={speed}
                type="button"
                disabled={disabled}
                onClick={() => sync?.setPlaybackSpeed(speed)}
                aria-pressed={active}
                aria-label={`${speed}×`}
                className={cn(
                  "flex-1 rounded-sm px-1 py-0.5 font-mono text-[10px] disabled:opacity-40",
                  active ? "bg-primary-darker text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {speed === 0.25 ? "¼" : speed === 0.5 ? "½" : speed}×
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
          {damage ? (
            <span className="flex items-center gap-1" title={`Party damage per ${formatBucket(bucketMs)}`}><span className="h-1.5 w-1.5 bg-[var(--chart-3)]" />Dmg/{formatBucket(bucketMs)}</span>
          ) : (
            <span className="flex items-center gap-1" title={`Lowest raid durability per ${formatBucket(bucketMs)}`}><span className="h-1.5 w-1.5 bg-emerald-500/60" />Durability</span>
          )}
          <span className="flex items-center gap-1"><Skull className="h-2 w-2 text-red-400" />Death</span>
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
              <div
                key={bar.startMs}
                className="relative min-w-0 flex-1"
                title={`${formatReplayClock(bar.startMs - (bounds?.startMs ?? 0))} · ${damage ? `${Math.round(bar.value).toLocaleString()} damage` : `${Math.round(bar.value)}% durability`}`}
              >
                {/* The unplayed outline; for damage also the current bar's rest. */}
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t-[1px]"
                  style={{
                    height: `${bar.height}%`,
                    background: bar.state === "future" ? "rgba(255,255,255,.08)" : damage && bar.state === "current" ? "rgba(255,255,255,.22)" : "transparent",
                  }}
                />
                {damage ? (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-[1px]"
                    style={{ height: `${bar.fill}%`, background: bar.state === "current" ? "var(--chart-5)" : "var(--chart-3)" }}
                  />
                ) : (
                  <div
                    className={cn("absolute inset-x-0 bottom-0 rounded-t-[1px]", raidHealthColor(bar.value), bar.state === "current" && "brightness-150")}
                    style={{ height: `${bar.fill}%` }}
                  />
                )}
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
              <Skull className="h-3 w-3 text-red-400" />
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
    </div>
  );
}
