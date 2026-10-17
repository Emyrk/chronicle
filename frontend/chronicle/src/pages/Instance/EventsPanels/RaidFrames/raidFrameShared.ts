import { useEffect, useState } from "react";
import { useSyncModeContextOptional } from "../../SyncModeContext";

export const POWER_COLORS: Record<string, string> = {
  mana: "#3187e8",
  rage: "#d94a4a",
  energy: "#e8c83a",
  focus: "#e88731",
  runicpower: "#32c8d9",
  lunar: "#62a7ff",
  insanity: "#8f57d9",
  maelstrom: "#315bd9",
  fury: "#b23bd9",
  pain: "#d98b31",
};

export const INCOMING_HEAL_WINDOW_MS = 1_500;

export function percent(current: number, maximum: number): number {
  if (maximum <= 0) return 0;
  return Math.min(100, Math.max(0, (current / maximum) * 100));
}

// Sync playback only advances the timestamp every ~100ms, so extrapolate
// between ticks to keep cast bars moving smoothly.
const MAX_EXTRAPOLATION_MS = 500;

function useInterpolatedTimestamp(timestampMs: number, playing: boolean, speed: number): number {
  const [frame, setFrame] = useState<{ baseMs: number; valueMs: number } | null>(null);

  useEffect(() => {
    if (!playing) return;
    const anchoredAt = performance.now();
    let handle = 0;
    const tick = () => {
      const advancedMs = Math.min(MAX_EXTRAPOLATION_MS, (performance.now() - anchoredAt) * speed);
      setFrame({ baseMs: timestampMs, valueMs: timestampMs + advancedMs });
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [timestampMs, playing, speed]);

  return playing && frame?.baseMs === timestampMs ? frame.valueMs : timestampMs;
}

/** The Sync timestamp, extrapolated between playback ticks while playing. */
export function useDisplayTimestamp(timestampMs: number): number {
  const sync = useSyncModeContextOptional();
  return useInterpolatedTimestamp(
    timestampMs,
    Boolean(sync?.enabled && sync.isPlaying),
    sync?.playbackSpeed ?? 1,
  );
}
