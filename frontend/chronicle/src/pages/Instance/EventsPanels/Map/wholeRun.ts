import type { MapEncounterPositions, MapHealthSample, MapPositionSample } from "./map.processor";
import type { MapPoint } from "./mapModel";
import { createEncounterEffects, type ReplayEffectEvent } from "./replayEffects";

export type MapPresentation = "replay-3d" | "overview-2d";

/** The merged run's encounter id. */
export const WHOLE_RUN_ENCOUNTER_ID = "whole-run";

/**
 * 3D for exactly one selected encounter; the 2D route overview otherwise,
 * unless the user asked for the whole run (offered with zero or several).
 */
export function mapPresentationForSelection(selectedEncounterCount: number, wholeRun = false): MapPresentation {
  if (selectedEncounterCount === 1) return "replay-3d";
  return wholeRun ? "replay-3d" : "overview-2d";
}

/** The camera lead-in before an encounter's first sample when jumping to it. */
export const ENCOUNTER_JUMP_LEAD_MS = 5_000;
/** A non-player unit whose latest sample is older than this has left the scene (died, despawned, out of the log). */
export const RUN_UNIT_STALE_MS = 15_000;

function sortedByTime<T>(items: T[], time: (item: T) => number): T[] {
  for (let index = 1; index < items.length; index++) {
    if (time(items[index - 1]) > time(items[index])) return [...items].sort((a, b) => time(a) - time(b));
  }
  return items;
}

function appendAll<T>(target: Map<string, T[]>, source: Map<string, T[]>) {
  for (const [guid, items] of source) {
    const existing = target.get(guid);
    if (existing) existing.push(...items);
    else target.set(guid, [...items]);
  }
}

/**
 * One encounter spanning every processed encounter, so the 3D scene replays the
 * run (trash and travel included) on a single clock. Encounters are time
 * ordered, so tracks concatenate; a track that is out of order is sorted.
 */
export function mergeRunEncounters(encounters: Map<string, MapEncounterPositions>): MapEncounterPositions | null {
  const ordered = [...encounters.values()].sort((left, right) => left.startMs - right.startMs);
  if (ordered.length === 0) return null;
  const positionsByUnit = new Map<string, MapPositionSample[]>();
  const healthByUnit = new Map<string, MapHealthSample[]>();
  const effects = createEncounterEffects();
  const events: ReplayEffectEvent[] = [];
  const heals = new Map<string, ReplayEffectEvent[]>();
  for (const encounter of ordered) {
    appendAll(positionsByUnit, encounter.positionsByUnit);
    appendAll(healthByUnit, encounter.healthByUnit);
    events.push(...encounter.effects.events);
    appendAll(effects.deathsByUnit, encounter.effects.deathsByUnit);
    appendAll(effects.resurrectsByUnit, encounter.effects.resurrectsByUnit);
    appendAll(heals, encounter.effects.healsByUnit);
  }
  for (const [guid, samples] of positionsByUnit) positionsByUnit.set(guid, sortedByTime(samples, (sample) => sample.timestampMs));
  for (const [guid, samples] of healthByUnit) healthByUnit.set(guid, sortedByTime(samples, (sample) => sample.timestampMs));
  effects.events = sortedByTime(events, (event) => event.timestampMs);
  for (const [guid, times] of effects.deathsByUnit) effects.deathsByUnit.set(guid, sortedByTime(times, (time) => time));
  for (const [guid, times] of effects.resurrectsByUnit) effects.resurrectsByUnit.set(guid, sortedByTime(times, (time) => time));
  for (const [guid, list] of heals) effects.healsByUnit.set(guid, sortedByTime(list, (event) => event.timestampMs));
  return {
    encounterId: WHOLE_RUN_ENCOUNTER_ID,
    startMs: ordered[0].startMs,
    endMs: Math.max(...ordered.map((encounter) => encounter.endMs)),
    positionsByUnit,
    healthByUnit,
    effects,
  };
}

/** A cheap change signature of the result: merged runs are cached on it as encounters stream in. */
export function runSignature(encounters: Map<string, MapEncounterPositions>): string {
  let signature = String(encounters.size);
  for (const encounter of encounters.values()) {
    signature += `|${encounter.encounterId}:${encounter.endMs}:${encounter.positionsByUnit.size}:${encounter.effects.events.length}`;
  }
  return signature;
}

export interface RunEncounterRef {
  id: string;
  name: string;
  boss: boolean;
  start_time: string;
  kill_type?: string;
}

export interface EncounterJump {
  id: string;
  name: string;
  /** Where the replay clock goes: the encounter's start less the lead-in, never before the run starts. */
  timestampMs: number;
  /** The encounter's start as a 0..1 fraction of the run, for the boundary marks. */
  fraction: number;
}

/**
 * The boss encounters of the run as clock jumps. Start comes from the
 * processed encounter when it has data, else the instance's own start time.
 */
export function encounterJumps(
  instanceEncounters: RunEncounterRef[],
  processed: Map<string, MapEncounterPositions>,
  runStartMs: number,
  runEndMs: number,
): EncounterJump[] {
  const span = Math.max(1, runEndMs - runStartMs);
  return instanceEncounters
    .filter((encounter) => encounter.boss && encounter.kill_type !== "wipe" && encounter.kill_type !== "reset")
    .flatMap((encounter): EncounterJump[] => {
      const startMs = processed.get(encounter.id)?.startMs ?? Date.parse(encounter.start_time);
      if (!Number.isFinite(startMs)) return [];
      const fraction = Math.min(1, Math.max(0, (startMs - runStartMs) / span));
      return [{
        id: encounter.id,
        name: encounter.name,
        timestampMs: Math.max(runStartMs, startMs - ENCOUNTER_JUMP_LEAD_MS),
        fraction,
      }];
    })
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The party's median position on the artwork, or null with nobody to follow. */
export function groupCentre(points: MapPoint[]): MapPoint | null {
  if (points.length === 0) return null;
  return {
    leftPercent: medianOf(points.map((point) => point.leftPercent)),
    topPercent: medianOf(points.map((point) => point.topPercent)),
  };
}

/** Whether a non-player unit's latest sample is too old for it to still be on the map. */
export function isStaleRunSample(sample: MapPositionSample, cursorMs: number): boolean {
  return cursorMs - sample.timestampMs > RUN_UNIT_STALE_MS;
}
