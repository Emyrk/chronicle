import type { MapEncounterPositions } from "./map.processor";
import type { FloorSupportIndex } from "./floorSupport";

export interface FloorEncounter { id: string; start_time: string; mapId: number }
export interface EncounterFloorEstimate {
  floor: number | null;
  source: "telemetry" | "geometry" | "previous" | "fallback";
  uncertain: boolean;
  freshSamples: number;
  candidateCounts: Record<number, number>;
}

/** Selection order and playback time never change the view's anchor. Whole-run
 * uses the same earliest selection (or earliest instance encounter if none selected). */
export function firstFloorEncounter<T extends FloorEncounter>(encounters: readonly T[], selectedIDs: readonly string[]): T | null {
  const selected = new Set(selectedIDs);
  return encounters.filter(e => selected.size === 0 || selected.has(e.id))
    .slice().sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time) || a.id.localeCompare(b.id))[0] ?? null;
}

export function encounterFloorScope(datasetID: string | undefined, instanceID: string, mapID: number, revision: string): string {
  return JSON.stringify([datasetID ?? "", instanceID, mapID, revision]);
}

/** Best effort for display, not individual floor truth. Missing support is visible
 * uncertainty, never a reason to hide the manual picker. */
export function estimateEncounterFloor(
  encounter: MapEncounterPositions | undefined,
  mapID: number,
  floors: readonly number[],
  players: ReadonlySet<string>,
  support: FloorSupportIndex | undefined,
  previousFloor: number | null,
): EncounterFloorEstimate {
  const available = [...new Set(floors)].sort((a, b) => a - b);
  const counts: Record<number, number> = {};
  const scores = new Map<number, number>();
  const explicit = new Map<number, number>();
  const singleton = new Map<number, number>();
  let freshSamples = 0;
  for (const [unit, samples] of encounter?.positionsByUnit ?? []) {
    if (!players.has(unit)) continue;
    const seen = new Set<string>();
    for (const sample of samples) {
      if (sample.synthetic || (sample.mapId !== 0 && sample.mapId !== mapID)) continue;
      const key = JSON.stringify([sample.timestampMs, sample.x, sample.y, sample.z, sample.floor]);
      if (seen.has(key)) continue;
      seen.add(key);
      freshSamples++;
      if (sample.floor !== undefined && available.includes(sample.floor)) explicit.set(sample.floor, (explicit.get(sample.floor) ?? 0) + 1);
      const candidates = [...new Set(support?.candidates(sample.x, sample.y, sample.z) ?? [])].filter(floor => available.includes(floor));
      if (candidates.length === 1) singleton.set(candidates[0], (singleton.get(candidates[0]) ?? 0) + 1);
      for (const floor of candidates) {
        counts[floor] = (counts[floor] ?? 0) + 1;
        scores.set(floor, (scores.get(floor) ?? 0) + 1 / candidates.length);
      }
    }
  }
  const votes = explicit.size ? explicit : scores;
  const best = Math.max(0, ...votes.values());
  const tied = available.filter(floor => Math.abs((votes.get(floor) ?? 0) - best) < 1e-9);
  const previous = previousFloor !== null && tied.includes(previousFloor) ? previousFloor : null;
  const floor = previous ?? tied[0] ?? available[0] ?? null;
  return { floor,
    source: explicit.size ? "telemetry" : best > 0 ? previous !== null && tied.length > 1 ? "previous" : "geometry" : previous !== null ? "previous" : "fallback",
    uncertain: floor === null || best === 0 || tied.length !== 1 || (!explicit.size && (singleton.get(floor) ?? 0) <= freshSamples / 2),
    freshSamples, candidateCounts: counts };
}

/** One memory per dataset/instance/map/support revision. Freeze the first completed
 * aggregation; later streaming or seeks cannot change the encounter's floor. */
export class EncounterFloorMemory {
  private estimates = new Map<string, { startMs: number; value: EncounterFloorEstimate }>();
  private manual = new Map<string, number>();

  has(id: string): boolean { return this.estimates.has(id); }
  correction(id: string): number | null { return this.manual.get(id) ?? null; }
  correct(id: string, floor: number | null): void {
    if (floor === null) this.manual.delete(id);
    else this.manual.set(id, floor);
  }
  choose(id: string, startMs: number, compute: (previous: number | null) => EncounterFloorEstimate, ready: boolean): EncounterFloorEstimate {
    const cached = this.estimates.get(id);
    if (cached) return cached.value;
    const previous = [...this.estimates.entries()].filter(([, value]) => value.startMs < startMs)
      .sort(([a, av], [b, bv]) => bv.startMs - av.startMs || a.localeCompare(b))[0];
    const previousFloor = previous ? this.manual.get(previous[0]) ?? previous[1].value.floor : null;
    const value = compute(previousFloor);
    if (ready) this.estimates.set(id, { startMs, value });
    return value;
  }
}
