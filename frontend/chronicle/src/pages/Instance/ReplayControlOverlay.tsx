/**
 * Replay Control Overlay - Floating panel for controlling replay mode.
 *
 * Provides manual controls for:
 * - Play/pause automatic playback
 * - Step forward/backward by fixed amounts
 * - Scrubbing to specific timestamps (with player-death markers)
 * - Playback speed
 * - Debug metrics
 *
 * Replay mode is enabled while this overlay is mounted and disabled when it
 * unmounts (unless an external driver such as YouTube owns playback).
 *
 * Desktop-only: the toolbar button that opens this overlay is hidden on mobile.
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  RotateCcw,
  Skull,
  ArrowUpToLine,
  ArrowDownToLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useInstanceEventsContext } from "@/hooks/instanceEvents";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { createStreamCursor } from "@/api/protodecode/decode";
import { SlainSchema, type Slain } from "@/api/proto/chronicle_pb";
import { isPlayerGuidFast } from "./EventsPanels/processors/guidCache";
import { useSyncModeContext, useSyncModeContextOptional } from "./SyncModeContext";

export type ReplayPosition = "top" | "bottom";

/** localStorage key for the pinned position of the replay controls. */
export const REPLAY_POSITION_STORAGE_KEY = "replay-controls-position";

/**
 * Read the user's preferred replay-controls position.
 * Shared with InstancePage, which allows the action bar (spellbook) back
 * when the controls are pinned to the top and no longer occupy its space.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useReplayPosition() {
  return useLocalStorage<ReplayPosition>(REPLAY_POSITION_STORAGE_KEY, "bottom");
}

interface ReplayControlOverlayProps {
  /** Initial timestamp to start at (usually encounter start) */
  initialTimestamp?: Date;
}

/**
 * Format a Date as HH:MM:SS.mmm (UTC)
 */
function formatTimestamp(date: Date | null): string {
  if (!date) return "--:--:--.---";
  const h = date.getUTCHours().toString().padStart(2, "0");
  const m = date.getUTCMinutes().toString().padStart(2, "0");
  const s = date.getUTCSeconds().toString().padStart(2, "0");
  const ms = date.getUTCMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Format milliseconds as m:ss.mmm
 */
function formatClockFull(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = Math.floor(clamped / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const millis = Math.floor(clamped % 1000);
  return `${min}:${sec.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

/**
 * Format milliseconds as m:ss.d (single decimal, compact)
 */
function formatClockShort(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSec = Math.floor(clamped / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const tenths = Math.floor((clamped % 1000) / 100);
  return `${min}:${sec.toString().padStart(2, "0")}.${tenths}`;
}

/**
 * Format elapsed milliseconds as a compact seconds label (e.g. "5.601s"),
 * falling back to m:ss.mmm past one minute.
 */
function formatElapsedLabel(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 60_000) {
    return `${(clamped / 1000).toFixed(3)}s`;
  }
  return formatClockFull(clamped);
}

/**
 * Format a number with commas
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];

/**
 * Load the timestamps of player deaths from the slain stream.
 * Used to render skull markers on the scrubber track.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePlayerDeathTimes(): Date[] {
  const context = useInstanceEventsContext();
  const [deaths, setDeaths] = useState<Date[]>([]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const stream = await context.fetchStream("slain");
        if (cancelled) return;

        const result: Date[] = [];
        const cursor = createStreamCursor(SlainSchema, stream.data);
        while (cursor.currentHeader) {
          const encounterStart = cursor.currentHeader.firstTimestamp.getTime();
          while (cursor.hasMoreInEncounter) {
            const peeked = cursor.peek();
            if (!peeked) break;
            const msg = peeked.message as Slain;
            if (isPlayerGuidFast(msg.target)) {
              result.push(new Date(encounterStart + Number(msg.meta?.offsetMilli ?? 0n)));
            }
            cursor.advance();
          }
          cursor.nextEncounter();
        }
        if (!cancelled) setDeaths(result);
      } catch {
        // Death markers are decorative; ignore fetch/decode failures.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [context]);

  return deaths;
}

/** Skull markers rendered above a scrubber track. */
function DeathMarkers({
  deaths,
  bounds,
}: {
  deaths: Date[];
  bounds: { start: Date; end: Date } | null;
}) {
  const markers = useMemo(() => {
    if (!bounds) return [];
    const start = bounds.start.getTime();
    const total = bounds.end.getTime() - start;
    if (total <= 0) return [];
    return deaths
      .map((d) => (d.getTime() - start) / total)
      .filter((p) => p >= 0 && p <= 1);
  }, [deaths, bounds]);

  if (markers.length === 0) return null;

  // The slider thumb's center travels from thumbRadius to width - thumbRadius,
  // not the full track width. Inset the marker container by half the native
  // thumb width (~16px) on each side so markers align with the thumb position.
  return (
    <div className="pointer-events-none absolute -top-3 left-2 right-2 h-3">
      {markers.map((p, i) => (
        <Skull
          key={i}
          className="absolute h-3 w-3 -translate-x-1/2 text-red-500/90"
          style={{ left: `${p * 100}%` }}
        />
      ))}
    </div>
  );
}

function SpeedChips({
  value,
  onChange,
  disabled,
  size = "md",
}: {
  value: number;
  onChange: (speed: number) => void;
  disabled: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex gap-1">
      {SPEEDS.map((speed) => (
        <Button
          key={speed}
          variant={value === speed ? "default" : "outline"}
          size="sm"
          className={cn("font-mono", size === "sm" ? "h-7 px-2 text-[11px]" : "h-7 px-2.5 text-xs")}
          onClick={() => onChange(speed)}
          disabled={disabled}
        >
          {speed}x
        </Button>
      ))}
    </div>
  );
}

export interface ReplayTransportBarProps {
  initialTimestamp?: Date;
  deaths: Date[];
  actions?: React.ReactNode;
  className?: string;
}

/** Compact replay transport shared by the floating overlay and replay strips. */
export function ReplayTransportBar({
  initialTimestamp,
  deaths,
  actions,
  className,
}: ReplayTransportBarProps) {
  const sync = useSyncModeContextOptional();
  const youtubeActive = sync?.externalDriver === "youtube";
  const controlsDisabled = !sync?.enabled || youtubeActive;

  const progress = useMemo(() => {
    if (!sync?.encounterBounds || !sync.currentTimestamp) return 0;
    const start = sync.encounterBounds.start.getTime();
    const duration = sync.encounterBounds.end.getTime() - start;
    if (duration <= 0) return 0;
    return Math.max(0, Math.min(100, ((sync.currentTimestamp.getTime() - start) / duration) * 100));
  }, [sync]);

  const elapsed = useMemo(() => {
    if (!sync?.encounterBounds || !sync.currentTimestamp) return 0;
    return Math.max(0, sync.currentTimestamp.getTime() - sync.encounterBounds.start.getTime());
  }, [sync]);

  if (!sync) {
    return (
      <div className={cn(
        "relative h-full min-h-[3.5rem] overflow-hidden bg-gradient-to-b from-primary-darker/30 to-black/60",
        className,
      )}>
        <div className="pointer-events-none flex h-full min-w-0 items-center gap-3 px-3 py-2 grayscale opacity-35">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/40" />
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" disabled>
            <Play className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" disabled>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <span className="w-[4.5rem] shrink-0 font-mono text-sm tabular-nums text-primary">0:00.0</span>
          <input type="range" value={0} readOnly disabled className="min-w-16 flex-1" aria-label="Replay position" />
          <SpeedChips value={1} onChange={() => undefined} disabled size="sm" />
          {actions}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-muted/65 backdrop-blur-[1px]">
          <Button type="button" size="sm" className="gap-1.5 shadow-lg" disabled title="Replay is available on instance pages">
            <Play className="h-4 w-4" />
            Enable Replay
          </Button>
        </div>
      </div>
    );
  }

  const handleEnable = () => {
    sync.enable();
    const timestamp = initialTimestamp ?? sync.encounterBounds?.start;
    if (timestamp) sync.setTimestamp(timestamp);
  };

  const handleRestart = () => {
    const timestamp = sync.encounterBounds?.start ?? initialTimestamp;
    if (timestamp) sync.setTimestamp(timestamp);
  };

  const handleSliderChange = (percent: number) => {
    if (!sync.encounterBounds) return;
    const start = sync.encounterBounds.start.getTime();
    const duration = sync.encounterBounds.end.getTime() - start;
    sync.setTimestamp(new Date(start + (duration * percent) / 100));
  };

  return (
    <div
      className={cn(
        "relative h-full min-h-[3.5rem] overflow-hidden bg-gradient-to-b from-primary-darker/30 to-black/60",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-full min-w-0 items-center gap-3 px-3 py-2 transition-[filter,opacity]",
          !sync.enabled && "pointer-events-none grayscale opacity-35",
        )}
        aria-hidden={!sync.enabled}
      >
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full",
            sync.isPlaying ? "animate-pulse bg-red-500" : "bg-muted-foreground/40",
          )}
        />
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => (sync.isPlaying ? sync.pause() : sync.play())}
          disabled={controlsDisabled}
          title={sync.isPlaying ? "Pause" : "Play"}
        >
          {sync.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleRestart}
          disabled={controlsDisabled}
          title="Restart from beginning"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <span className="w-[4.5rem] shrink-0 font-mono text-sm tabular-nums text-primary">
          {formatClockShort(elapsed)}
        </span>
        <div className="relative min-w-16 flex-1">
          <DeathMarkers deaths={deaths} bounds={sync.encounterBounds} />
          <input
            type="range"
            value={progress}
            min={0}
            max={100}
            step={0.1}
            onChange={(event) => handleSliderChange(Number(event.target.value))}
            disabled={controlsDisabled || !sync.encounterBounds}
            className="w-full cursor-pointer accent-primary disabled:cursor-default"
            aria-label="Replay position"
          />
        </div>
        <SpeedChips
          value={sync.playbackSpeed}
          onChange={sync.setPlaybackSpeed}
          disabled={controlsDisabled}
          size="sm"
        />
        {sync.enabled && !youtubeActive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2.5 text-xs"
            onClick={sync.disable}
          >
            Disable Replay
          </Button>
        ) : null}
        {actions}
      </div>

      {!sync.enabled ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/65 backdrop-blur-[1px]">
          <Button
            type="button"
            size="sm"
            className="gap-1.5 shadow-lg"
            onClick={handleEnable}
            disabled={!initialTimestamp && !sync.encounterBounds}
          >
            <Play className="h-4 w-4" />
            Enable Replay
          </Button>
        </div>
      ) : null}

      {youtubeActive ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] text-muted-foreground">
          Video is controlling replay
        </div>
      ) : null}
    </div>
  );
}

export function ReplayControlOverlay({ initialTimestamp }: ReplayControlOverlayProps) {
  const sync = useSyncModeContext();
  const [showDebug, setShowDebug] = useState(false);
  // Start compact; the chevron expands to the full panel.
  const [collapsed, setCollapsed] = useState(true);
  const [position, setPosition] = useReplayPosition();
  const deaths = usePlayerDeathTimes();

  // Disable time controls when YouTube is driving the timestamp
  const youtubeActive = sync.externalDriver === "youtube";
  const controlsDisabled = !sync.enabled || youtubeActive;

  // Enable replay mode while the overlay is open. Keep refs so the
  // mount/unmount effect doesn't re-run as context values change.
  const syncRef = useRef(sync);
  const initialTimestampRef = useRef(initialTimestamp);
  const enabledByOverlayRef = useRef(false);
  useEffect(() => {
    syncRef.current = sync;
    initialTimestampRef.current = initialTimestamp;
  }, [sync, initialTimestamp]);

  useEffect(() => {
    const s = syncRef.current;
    if (!s.enabled) {
      enabledByOverlayRef.current = true;
      s.enable();
      const initial = initialTimestampRef.current ?? s.encounterBounds?.start;
      if (initial) {
        s.setTimestamp(initial);
      }
    }
    return () => {
      // Only tear replay down when this overlay enabled it. If an inline replay
      // strip was already active, closing the floating controls must not stop it.
      if (enabledByOverlayRef.current && syncRef.current.externalDriver === "none") {
        syncRef.current.disable();
      }
    };
  }, []);

  // Calculate progress within encounter bounds
  const progress = useMemo(() => {
    if (!sync.encounterBounds || !sync.currentTimestamp) return 0;
    const { start, end } = sync.encounterBounds;
    const total = end.getTime() - start.getTime();
    if (total <= 0) return 0;
    const current = sync.currentTimestamp.getTime() - start.getTime();
    return Math.max(0, Math.min(100, (current / total) * 100));
  }, [sync.encounterBounds, sync.currentTimestamp]);

  // Calculate elapsed time within encounter
  const elapsed = useMemo(() => {
    if (!sync.encounterBounds || !sync.currentTimestamp) return 0;
    return Math.max(0, sync.currentTimestamp.getTime() - sync.encounterBounds.start.getTime());
  }, [sync.encounterBounds, sync.currentTimestamp]);

  // Calculate total duration
  const totalDuration = useMemo(() => {
    if (!sync.encounterBounds) return 0;
    return sync.encounterBounds.end.getTime() - sync.encounterBounds.start.getTime();
  }, [sync.encounterBounds]);

  // Handle slider change
  const handleSliderChange = (percent: number) => {
    if (!sync.encounterBounds) return;
    const { start, end } = sync.encounterBounds;
    const total = end.getTime() - start.getTime();
    sync.setTimestamp(new Date(start.getTime() + (total * percent) / 100));
  };

  // Restart from encounter start
  const handleRestart = () => {
    const target = sync.encounterBounds?.start ?? initialTimestamp;
    if (target) {
      sync.setTimestamp(target);
    }
  };

  const handleJumpToEnd = () => {
    if (sync.encounterBounds) {
      sync.setTimestamp(sync.encounterBounds.end);
    }
  };

  const statusText = youtubeActive
    ? "youtube driving"
    : sync.isPlaying
      ? `playing · ${sync.playbackSpeed}x`
      : "paused · scrub or step";

  const statusDot = (
    <span
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-full",
        sync.isPlaying ? "bg-red-500 animate-pulse" : "bg-muted-foreground/40"
      )}
    />
  );

  const playPauseButton = (extraClass: string) => (
    <Button
      variant="outline"
      size="icon"
      className={extraClass}
      onClick={() => (sync.isPlaying ? sync.pause() : sync.play())}
      disabled={controlsDisabled}
      title={sync.isPlaying ? "Pause" : "Play"}
    >
      {sync.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </Button>
  );

  const restartButton = (extraClass: string) => (
    <Button
      variant="outline"
      size="icon"
      className={extraClass}
      onClick={handleRestart}
      disabled={controlsDisabled}
      title="Restart from beginning"
    >
      <RotateCcw className="h-4 w-4" />
    </Button>
  );

  const scrubber = (extraClass?: string) => (
    <div className={cn("relative", extraClass)}>
      <DeathMarkers deaths={deaths} bounds={sync.encounterBounds} />
      <input
        type="range"
        value={progress}
        min={0}
        max={100}
        step={0.1}
        onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
        disabled={controlsDisabled || !sync.encounterBounds}
        className="w-full cursor-pointer accent-primary disabled:cursor-default"
      />
    </div>
  );

  const pinnedTop = position === "top";
  const containerClass = cn(
    "fixed left-1/2 z-40 w-[52rem] max-w-[calc(100vw-2rem)] -translate-x-1/2",
    pinnedTop ? "top-4" : "bottom-4"
  );

  const pinButton = (extraClass: string) => (
    <Button
      variant="ghost"
      size="icon"
      className={extraClass}
      onClick={() => setPosition(pinnedTop ? "bottom" : "top")}
      title={pinnedTop ? "Pin to bottom" : "Pin to top"}
    >
      {pinnedTop ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpToLine className="h-4 w-4" />}
    </Button>
  );

  // Collapsed mini-bar
  if (collapsed) {
    const miniBar = (
      <div className={containerClass}>
        <ReplayTransportBar
          initialTimestamp={initialTimestamp}
          deaths={deaths}
          className="animate-replay-pop rounded-lg border border-primary/40 shadow-xl backdrop-blur-md"
          actions={(
            <>
              {pinButton("h-8 w-8 shrink-0")}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setCollapsed(false)}
                title="Expand replay controls"
              >
                {pinnedTop ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </>
          )}
        />
      </div>
    );
    return createPortal(miniBar, document.body);
  }

  const content = (
    <div className={containerClass}>
      <div className="animate-replay-pop flex flex-col overflow-hidden rounded-lg border border-primary/40 bg-gradient-to-b from-primary-darker/30 to-black/60 shadow-xl backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2">
          <div className="flex items-center gap-2.5">
            {statusDot}
            <span className="text-sm font-medium">Replay Controls</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{statusText}</span>
            {pinButton("h-6 w-6")}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCollapsed(true)}
              title="Collapse replay controls"
            >
              {pinnedTop ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Time readouts */}
        <div className="flex items-end justify-between gap-4 px-4 pt-3">
          <div>
            <div className="text-xs text-muted-foreground">Current Time (UTC)</div>
            <div className="font-mono text-2xl tabular-nums text-primary">
              {formatTimestamp(sync.currentTimestamp)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Encounter Clock</div>
            <div className="font-mono text-lg tabular-nums">
              <span>{formatClockShort(elapsed)}</span>
              <span className="text-muted-foreground"> / {formatClockFull(totalDuration)}</span>
            </div>
          </div>
        </div>

        {/* Scrubber */}
        <div className="px-4 pb-1 pt-2">
          <div className="mb-1 flex justify-between font-mono text-[11px] text-muted-foreground">
            <span>{formatElapsedLabel(elapsed)}</span>
            <span>{formatClockFull(totalDuration)}</span>
          </div>
          {scrubber()}
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-2 px-4 py-3">
          {playPauseButton("h-9 w-9")}
          {restartButton("h-9 w-9")}
          <div className="mx-1 h-6 w-px bg-border" />
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-10"
            onClick={handleRestart}
            disabled={controlsDisabled}
            title="Jump to start"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9 flex-1 px-3 font-mono text-xs"
            onClick={() => sync.step(-1000)}
            disabled={controlsDisabled}
            title="Step back 1 second"
          >
            −1s
          </Button>
          <Button
            variant="outline"
            className="h-9 flex-1 px-3 font-mono text-xs"
            onClick={() => sync.step(-100)}
            disabled={controlsDisabled}
            title="Step back 100ms"
          >
            −100ms
          </Button>
          <Button
            variant="outline"
            className="h-9 flex-1 px-3 font-mono text-xs"
            onClick={() => sync.step(100)}
            disabled={controlsDisabled}
            title="Step forward 100ms"
          >
            +100ms
          </Button>
          <Button
            variant="outline"
            className="h-9 flex-1 px-3 font-mono text-xs"
            onClick={() => sync.step(1000)}
            disabled={controlsDisabled}
            title="Step forward 1 second"
          >
            +1s
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-10"
            onClick={handleJumpToEnd}
            disabled={controlsDisabled}
            title="Jump to end"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Speed:</span>
          <SpeedChips
            value={sync.playbackSpeed}
            onChange={sync.setPlaybackSpeed}
            disabled={controlsDisabled}
          />
        </div>

        {/* Debug */}
        <div className="border-t border-border px-4 py-2.5">
          <button
            type="button"
            onClick={() => setShowDebug(!showDebug)}
            className="flex w-full items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showDebug && "rotate-90")} />
            Debug Info
          </button>
          {showDebug && (
            <div className="mt-2 space-y-1 rounded-md bg-muted/50 p-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Events processed:</span>
                <span>{formatNumber(sync.metrics.processedCount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processing rate:</span>
                <span>{formatNumber(sync.metrics.eventsPerSecond)}/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last update:</span>
                <span>{sync.metrics.lastUpdateMs.toFixed(1)}ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className={sync.enabled ? "text-green-500" : "text-muted-foreground"}>
                  {sync.enabled ? (sync.isPlaying ? "Playing" : "Paused") : "Disabled"}
                </span>
              </div>
              {sync.encounterBounds && (
                <>
                  <div className="my-1 border-t border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Encounter start:</span>
                    <span>{formatTimestamp(sync.encounterBounds.start)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Encounter end:</span>
                    <span>{formatTimestamp(sync.encounterBounds.end)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
