import { PARTY_DAMAGE_SERIES_ID, REPLAY_CONTROLLER_BIN_MS, type ReplayControllerResult } from "./replayController.processor";

export interface ReplayBounds {
  startMs: number;
  endMs: number;
}

export type ReplayBarState = "past" | "current" | "future";

export interface ReplayBar {
  /** Full bar height, % of the tallest bar. */
  height: number;
  /** Played part, % of the tallest bar: all of a past bar, the elapsed share of the current one. */
  fill: number;
  state: ReplayBarState;
  startMs: number;
  value: number;
}

export interface ReplayMarker {
  kind: "death" | "boss_cast";
  /** Position along the track, 0–100. */
  left: number;
  title: string;
  /** At or before the cursor; later markers are dimmed. */
  past: boolean;
}

export interface ReplayTick {
  left: number;
  label: string;
  align: "start" | "center" | "end";
}

export function formatReplayClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function trackPercent(timestampMs: number, bounds: ReplayBounds): number {
  return ((timestampMs - bounds.startMs) / Math.max(1, bounds.endMs - bounds.startMs)) * 100;
}

/**
 * One bar per 2s of the replay bounds. With no cursor (replay off) every bar
 * reads as played.
 */
export function replayControllerBars(result: ReplayControllerResult, bounds: ReplayBounds, cursorMs: number | null): ReplayBar[] {
  const bins = result.timeline.series.get(PARTY_DAMAGE_SERIES_ID) ?? [];
  const binMs = result.timeline.binMs || REPLAY_CONTROLLER_BIN_MS;
  const count = Math.max(0, Math.ceil((bounds.endMs - bounds.startMs) / binMs));
  const values = Array.from({ length: count }, (_, index) => {
    if (result.baseMs === null) return 0;
    const bin = Math.floor((bounds.startMs + index * binMs - result.baseMs) / binMs);
    return bins[bin] ?? 0;
  });
  const max = Math.max(1, ...values);
  return values.map((value, index) => {
    const startMs = bounds.startMs + index * binMs;
    const height = (value / max) * 100;
    if (cursorMs === null || cursorMs >= startMs + binMs) return { height, fill: height, state: "past", startMs, value };
    if (cursorMs < startMs) return { height, fill: 0, state: "future", startMs, value };
    return { height, fill: height * ((cursorMs - startMs) / binMs), state: "current", startMs, value };
  });
}

/** Player deaths and boss cast starts inside the bounds. */
export function replayControllerMarkers(
  result: ReplayControllerResult,
  bounds: ReplayBounds,
  cursorMs: number | null,
  bossGuids: ReadonlySet<string>,
  unitName: (guid: string) => string,
): ReplayMarker[] {
  const inBounds = (timestampMs: number) => timestampMs >= bounds.startMs && timestampMs <= bounds.endMs;
  const marker = (kind: ReplayMarker["kind"], timestampMs: number, label: string): ReplayMarker => ({
    kind,
    left: trackPercent(timestampMs, bounds),
    title: `${formatReplayClock(timestampMs - bounds.startMs)} ${label}`,
    past: cursorMs === null || timestampMs <= cursorMs,
  });
  const markers: ReplayMarker[] = [];
  if (result.baseMs !== null) {
    for (const death of result.timeline.playerDeaths) {
      const timestampMs = result.baseMs + death.offsetMs;
      if (inBounds(timestampMs)) markers.push(marker("death", timestampMs, `${death.playerName} died`));
    }
  }
  for (const cast of result.enemyCasts) {
    if (bossGuids.has(cast.caster) && inBounds(cast.timestampMs)) {
      markers.push(marker("boss_cast", cast.timestampMs, `${unitName(cast.caster)} casts ${cast.spellName}`));
    }
  }
  return markers.sort((left, right) => left.left - right.left);
}

const TICK_STEPS_MS = [15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000];
const MAX_TICKS = 8;

/** Elapsed-time labels under the track, at a step that keeps at most MAX_TICKS. */
export function replayControllerTicks(bounds: ReplayBounds): ReplayTick[] {
  const duration = Math.max(0, bounds.endMs - bounds.startMs);
  const step = TICK_STEPS_MS.find((candidate) => duration / candidate <= MAX_TICKS - 1) ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
  const ticks: ReplayTick[] = [];
  for (let elapsed = 0; elapsed <= duration; elapsed += step) {
    ticks.push({ left: (elapsed / Math.max(1, duration)) * 100, label: formatReplayClock(elapsed), align: elapsed === 0 ? "start" : "center" });
  }
  const last = ticks[ticks.length - 1];
  if (last && last.left > 92 && ticks.length > 1) last.align = "end";
  return ticks;
}
