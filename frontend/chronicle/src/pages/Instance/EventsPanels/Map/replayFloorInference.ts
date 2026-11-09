import { inferFloorTrack, inferredFloorAt, type FloorEstimate, type FloorObservation } from "./floorInference";
import type { FloorSupportIndex } from "./floorSupport";
import type { MapEncounterPositions } from "./map.processor";

/** Replay permits five seconds of lookahead, never across an encounter boundary.
 * Live callers use inferFloorTrack without lookahead. These are party/display estimates. */
export const REPLAY_FLOOR_OPTIONS = { evidenceWindowMs: 2000, continuityMs: 15000, lookaheadMs: 5000 };

export function replayFloorTracks(
  encounters: ReadonlyMap<string, MapEncounterPositions>,
  encounterMaps: ReadonlyMap<string, number>,
  players: ReadonlySet<string>,
  mapID: number,
  support: FloorSupportIndex,
): Map<string, FloorEstimate[]> {
  const tracks = new Map<string, FloorEstimate[]>();
  for (const [id, encounter] of encounters) {
    if (encounterMaps.get(id) !== mapID) continue;
    const observations: FloorObservation[] = [];
    for (const [unit, samples] of encounter.positionsByUnit) {
      if (!players.has(unit)) continue;
      for (const sample of samples) {
        if (sample.mapId !== 0 && sample.mapId !== mapID) continue;
        observations.push({ timestampMs: sample.timestampMs, unit,
          candidates: sample.synthetic ? [] : support.candidates(sample.x, sample.y, sample.z),
          floor: sample.floor, synthetic: sample.synthetic });
      }
    }
    tracks.set(id, inferFloorTrack(observations, REPLAY_FLOOR_OPTIONS));
  }
  return tracks;
}

export function replayFloorAt(
  tracks: ReadonlyMap<string, readonly FloorEstimate[]>,
  encounters: ReadonlyMap<string, MapEncounterPositions>,
  timestampMs: number | null,
): FloorEstimate | null {
  if (timestampMs === null) return null;
  // Do not carry a displayed floor through unobserved travel between encounters.
  const encounter = [...encounters.values()].filter(e => e.startMs <= timestampMs && timestampMs <= e.endMs)
    .sort((a, b) => b.startMs - a.startMs || a.encounterId.localeCompare(b.encounterId))[0];
  return encounter ? inferredFloorAt(tracks.get(encounter.encounterId) ?? [], timestampMs, REPLAY_FLOOR_OPTIONS.evidenceWindowMs) : null;
}
