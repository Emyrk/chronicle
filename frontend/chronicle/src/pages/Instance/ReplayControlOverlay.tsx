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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstanceEventsContext } from "@/hooks/instanceEvents";
import { createStreamCursor } from "@/api/protodecode/decode";
import { SlainSchema, type Slain } from "@/api/proto/chronicle_pb";
import { isPlayerGuidFast } from "./EventsPanels/processors/guidCache";
import { useSyncModeContext } from "./SyncModeContext";

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
function usePlayerDeathTimes(): Date[] {
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

  return (
    <div className="pointer-events-none absolute inset-x-0 -top-3 h-3">
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

/** Shared transport-button styling (dark chip look). */
const chipButton =
  "inline-flex items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-800/80 text-zinc-200 transition-colors hover:bg-zinc-700/80 disabled:opacity-40 disabled:pointer-events-none";

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
    <div className="flex gap-1.5">
      {SPEEDS.map((speed) => (
        <button
          key={speed}
          type="button"
          onClick={() => onChange(speed)}
          disabled={disabled}
          className={cn(
            "rounded-md font-mono transition-colors disabled:opacity-40 disabled:pointer-events-none",
            size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs",
            value === speed
              ? "bg-amber-300 text-zinc-900 font-semibold"
              : "border border-zinc-700/80 bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80"
          )}
        >
          {speed}x
        </button>
      ))}
    </div>
  );
}

export function ReplayControlOverlay({ initialTimestamp }: ReplayControlOverlayProps) {
  const sync = useSyncModeContext();
  const [showDebug, setShowDebug] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const deaths = usePlayerDeathTimes();

  // Disable time controls when YouTube is driving the timestamp
  const youtubeActive = sync.externalDriver === "youtube";
  const controlsDisabled = !sync.enabled || youtubeActive;

  // Enable replay mode while the overlay is open. Keep refs so the
  // mount/unmount effect doesn't re-run as context values change.
  const syncRef = useRef(sync);
  const initialTimestampRef = useRef(initialTimestamp);
  useEffect(() => {
    syncRef.current = sync;
    initialTimestampRef.current = initialTimestamp;
  }, [sync, initialTimestamp]);

  useEffect(() => {
    const s = syncRef.current;
    if (!s.enabled) {
      s.enable();
      const initial = initialTimestampRef.current ?? s.encounterBounds?.start;
      if (initial) {
        s.setTimestamp(initial);
      }
    }
    return () => {
      // Leave replay mode running if an external driver (YouTube) owns it.
      if (syncRef.current.externalDriver === "none") {
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
        sync.isPlaying ? "bg-red-500 animate-pulse" : "bg-zinc-600"
      )}
    />
  );

  const playPauseButton = (extraClass: string) => (
    <button
      type="button"
      className={cn(chipButton, extraClass)}
      onClick={() => (sync.isPlaying ? sync.pause() : sync.play())}
      disabled={controlsDisabled}
      title={sync.isPlaying ? "Pause" : "Play"}
    >
      {sync.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </button>
  );

  const restartButton = (extraClass: string) => (
    <button
      type="button"
      className={cn(chipButton, extraClass)}
      onClick={handleRestart}
      disabled={controlsDisabled}
      title="Restart from beginning"
    >
      <RotateCcw className="h-4 w-4" />
    </button>
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
        className="w-full cursor-pointer accent-amber-300 disabled:cursor-default"
      />
    </div>
  );

  // Collapsed mini-bar
  if (collapsed) {
    const miniBar = (
      <div className="fixed bottom-4 left-1/2 z-40 w-[52rem] max-w-[calc(100vw-2rem)] -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/95 px-3 py-2 shadow-2xl backdrop-blur">
          {statusDot}
          {playPauseButton("h-8 w-8")}
          {restartButton("h-8 w-8")}
          <span className="font-mono text-sm tabular-nums text-amber-300">
            {formatClockShort(elapsed)}
          </span>
          {scrubber("min-w-0 flex-1")}
          <SpeedChips
            value={sync.playbackSpeed}
            onChange={sync.setPlaybackSpeed}
            disabled={controlsDisabled}
            size="sm"
          />
          <button
            type="button"
            className={cn(chipButton, "h-8 w-8")}
            onClick={() => setCollapsed(false)}
            title="Expand replay controls"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
    return createPortal(miniBar, document.body);
  }

  const content = (
    <div className="fixed bottom-4 left-1/2 z-40 w-[52rem] max-w-[calc(100vw-2rem)] -translate-x-1/2">
      <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/95 text-zinc-200 shadow-2xl backdrop-blur">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            {statusDot}
            <span className="text-sm font-semibold text-zinc-100">Replay Controls</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-zinc-500">{statusText}</span>
            <button
              type="button"
              className={cn(chipButton, "h-7 w-7")}
              onClick={() => setCollapsed(true)}
              title="Collapse replay controls"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Time readouts */}
        <div className="flex items-end justify-between gap-4 px-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Current Time (UTC)
            </div>
            <div className="font-mono text-2xl tabular-nums text-amber-300">
              {formatTimestamp(sync.currentTimestamp)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Encounter Clock
            </div>
            <div className="font-mono text-lg tabular-nums">
              <span className="text-zinc-100">{formatClockShort(elapsed)}</span>
              <span className="text-zinc-600"> / {formatClockFull(totalDuration)}</span>
            </div>
          </div>
        </div>

        {/* Scrubber */}
        <div className="px-4 pb-1 pt-2">
          <div className="mb-1 flex justify-between font-mono text-[11px] text-zinc-500">
            <span>{formatElapsedLabel(elapsed)}</span>
            <span>{formatClockFull(totalDuration)}</span>
          </div>
          {scrubber()}
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-2 px-4 py-3">
          {playPauseButton("h-9 w-9")}
          {restartButton("h-9 w-9")}
          <div className="mx-1 h-6 w-px bg-zinc-800" />
          <button
            type="button"
            className={cn(chipButton, "h-9 w-10")}
            onClick={handleRestart}
            disabled={controlsDisabled}
            title="Jump to start"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(chipButton, "h-9 flex-1 px-3 font-mono text-xs")}
            onClick={() => sync.step(-1000)}
            disabled={controlsDisabled}
            title="Step back 1 second"
          >
            −1s
          </button>
          <button
            type="button"
            className={cn(chipButton, "h-9 flex-1 px-3 font-mono text-xs")}
            onClick={() => sync.step(-100)}
            disabled={controlsDisabled}
            title="Step back 100ms"
          >
            −100ms
          </button>
          <button
            type="button"
            className={cn(chipButton, "h-9 flex-1 px-3 font-mono text-xs")}
            onClick={() => sync.step(100)}
            disabled={controlsDisabled}
            title="Step forward 100ms"
          >
            +100ms
          </button>
          <button
            type="button"
            className={cn(chipButton, "h-9 flex-1 px-3 font-mono text-xs")}
            onClick={() => sync.step(1000)}
            disabled={controlsDisabled}
            title="Step forward 1 second"
          >
            +1s
          </button>
          <button
            type="button"
            className={cn(chipButton, "h-9 w-10")}
            onClick={handleJumpToEnd}
            disabled={controlsDisabled}
            title="Jump to end"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-2.5 border-t border-zinc-800/80 px-4 py-3">
          <Clock className="h-4 w-4 text-zinc-500" />
          <span className="text-sm text-zinc-400">Speed:</span>
          <SpeedChips
            value={sync.playbackSpeed}
            onChange={sync.setPlaybackSpeed}
            disabled={controlsDisabled}
          />
        </div>

        {/* Debug */}
        <div className="border-t border-zinc-800/80 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setShowDebug(!showDebug)}
            className="flex w-full items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showDebug && "rotate-90")} />
            Debug Info
          </button>
          {showDebug && (
            <div className="mt-2 space-y-1 rounded-md bg-zinc-900/80 p-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Events processed:</span>
                <span>{formatNumber(sync.metrics.processedCount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Processing rate:</span>
                <span>{formatNumber(sync.metrics.eventsPerSecond)}/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Last update:</span>
                <span>{sync.metrics.lastUpdateMs.toFixed(1)}ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Status:</span>
                <span className={sync.enabled ? "text-green-500" : "text-zinc-500"}>
                  {sync.enabled ? (sync.isPlaying ? "Playing" : "Paused") : "Disabled"}
                </span>
              </div>
              {sync.encounterBounds && (
                <>
                  <div className="my-1 border-t border-zinc-800" />
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Encounter start:</span>
                    <span>{formatTimestamp(sync.encounterBounds.start)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Encounter end:</span>
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
