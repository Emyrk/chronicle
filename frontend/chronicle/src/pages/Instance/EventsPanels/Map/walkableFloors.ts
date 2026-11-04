/**
 * Floors for units the log gives no height (chronicle-1597). WoW Forever and
 * WotLK logs carry no Z, and the highest surface under a unit is often a roof,
 * an arch or a bridge. Units cannot climb walls, so each unit's floor is
 * decided once for the whole fight from its recorded path: the path is
 * stepped about a yard at a time, every walkable surface under each step is a
 * candidate, and one candidate per step is chosen by least total cost
 * (Viterbi): climbing more than CLIMB_LIMIT_YARDS in a step is impossible,
 * dropping costs a little, staying level is free. A fresh start (the first
 * sample, a long gap, a teleport) takes the candidate nearest a reference
 * height: the median of the highest floors under every unit's samples, since
 * most of a fight is not under an overhang.
 *
 * Built in slices off the frame loop, like the follow camera's track, so a
 * seek or a scrub reads the same floor every time and a frame only looks up.
 *
 * Pure maths only — no three.js, no DOM.
 */

/** The path is stepped about this often (yards) between samples, so a ramp is followed and a wall is not. */
export const FLOOR_STEP_YARDS = 1;
/** No step climbs more than this (yards). */
export const CLIMB_LIMIT_YARDS = 2;
/** A drop this small (yards) is still level: a ramp or a stair down. */
export const LEVEL_YARDS = 0.5;
/** A larger drop costs this, plus DROP_COST_PER_YARD per yard, so the nearest floor below wins a fall. */
export const DROP_COST = 1;
export const DROP_COST_PER_YARD = 0.1;
/** A climb within the limit costs almost nothing: it only breaks a tie toward staying level. */
export const CLIMB_COST_PER_YARD = 0.01;
/** A fresh start costs this per yard away from the reference height. */
export const SEED_COST_PER_YARD = 1;
/** Samples further apart than this restart the path when the unit also moved RESTART_GAP_YARDS. */
export const RESTART_GAP_MS = 5_000;
export const RESTART_GAP_YARDS = 5;
/** A jump of more than TELEPORT_YARDS faster than TELEPORT_YARDS_PER_S is not walked (a teleport, a res). */
export const TELEPORT_YARDS = 10;
export const TELEPORT_YARDS_PER_S = 30;
/** A track only answers for a unit within this many yards of the path it was built from. */
export const FLOOR_TRACK_TOLERANCE_YARDS = 0.75;
/** How many steps a build slice casts between clock checks. */
const STEPS_PER_CHECK = 64;
/** A build slice's default budget (ms), as the follow track's. */
export const FLOOR_SLICE_MS = 6;

/** A recorded position, in scene units, at replay time `ms`. */
export interface FloorSample {
  ms: number;
  x: number;
  z: number;
}

export interface FloorTrackUnit {
  guid: string;
  /** In replay order. */
  samples: readonly FloorSample[];
}

export interface FloorTrackOptions {
  units: readonly FloorTrackUnit[];
  /** Scene units per yard. */
  scale: number;
  /** Every walkable surface height (scene units) under (x, z), walls already left out; any order. */
  candidatesAt: (x: number, z: number) => readonly number[];
}

/** One unit's chosen floor (`y`, scene units; NaN where there is none) at each step of its path. */
export interface FloorTrack {
  ms: Float64Array;
  x: Float64Array;
  z: Float64Array;
  y: Float64Array;
}

export interface FloorTracks {
  units: Map<string, FloorTrack>;
  /** The fresh-start reference height (scene units), undefined when no sample had a floor. */
  reference: number | undefined;
}

export interface FloorTrackBuild {
  /** Builds for up to `budgetMs`; true once the result is ready. */
  step(budgetMs?: number): boolean;
  readonly result: FloorTracks | null;
}

/** A unit's stepped path: nodes, where segments restart, and which nodes are recorded samples. */
interface UnitPath {
  guid: string;
  ms: number[];
  x: number[];
  z: number[];
  /** The node starts a fresh segment. */
  restart: boolean[];
  /** The node is a recorded sample (not a step between two). */
  sample: boolean[];
  /** Candidate floors per node, highest first; filled while casting. */
  candidates: Float64Array[];
}

const NO_FLOORS = new Float64Array(0);
const EMPTY_PATH: UnitPath = { guid: "", ms: [], x: [], z: [], restart: [], sample: [], candidates: [] };

/** Whether the unit can have walked from `a` to `b`, or the path restarts at `b`. */
function restartsAt(a: FloorSample, b: FloorSample, scale: number): boolean {
  const yards = Math.hypot(b.x - a.x, b.z - a.z) / scale;
  const dt = b.ms - a.ms;
  if (dt > RESTART_GAP_MS && yards > RESTART_GAP_YARDS) return true;
  return yards > TELEPORT_YARDS && yards > (Math.max(0, dt) / 1000) * TELEPORT_YARDS_PER_S;
}

function unitPath(unit: FloorTrackUnit, scale: number): UnitPath {
  const path: UnitPath = { guid: unit.guid, ms: [], x: [], z: [], restart: [], sample: [], candidates: [] };
  const step = FLOOR_STEP_YARDS * scale;
  const push = (ms: number, x: number, z: number, restart: boolean, sample: boolean) => {
    path.ms.push(ms);
    path.x.push(x);
    path.z.push(z);
    path.restart.push(restart);
    path.sample.push(sample);
  };
  let previous: FloorSample | null = null;
  for (const sample of unit.samples) {
    if (previous && sample.ms < previous.ms) continue;
    const restart = previous === null || restartsAt(previous, sample, scale);
    if (previous && !restart) {
      const steps = Math.ceil(Math.hypot(sample.x - previous.x, sample.z - previous.z) / step);
      for (let index = 1; index < steps; index++) {
        const t = index / steps;
        push(previous.ms + (sample.ms - previous.ms) * t, previous.x + (sample.x - previous.x) * t, previous.z + (sample.z - previous.z) * t, false, false);
      }
    }
    push(sample.ms, sample.x, sample.z, restart, true);
    previous = sample;
  }
  return path;
}

/** The median of `values` (sorted in place), or undefined when empty. */
function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  values.sort((a, b) => a - b);
  const middle = values.length >> 1;
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1]! + values[middle]!) / 2;
}

/** The cost (yards-scaled) of stepping from floor `from` to floor `to`, Infinity when it climbs too far. */
function stepCost(from: number, to: number, scale: number): number {
  const rise = (to - from) / scale;
  if (rise > CLIMB_LIMIT_YARDS) return Number.POSITIVE_INFINITY;
  if (rise >= 0) return rise * CLIMB_COST_PER_YARD;
  if (rise >= -LEVEL_YARDS) return 0;
  return DROP_COST - rise * DROP_COST_PER_YARD;
}

/**
 * Chooses one floor per node of `path` (least total cost per segment, see the
 * file comment) into `y`; nodes without any candidate stay NaN and restart
 * the path after them, as does a step every candidate of which is out of reach.
 */
function chooseFloors(path: UnitPath, reference: number | undefined, scale: number): Float64Array {
  const count = path.ms.length;
  const y = new Float64Array(count).fill(Number.NaN);
  // Each node's candidates' costs and back-pointers, flat (no allocation per node).
  const offset = new Int32Array(count + 1);
  for (let i = 0; i < count; i++) offset[i + 1] = offset[i]! + path.candidates[i]!.length;
  const cost = new Float64Array(offset[count]!);
  const back = new Int32Array(offset[count]!);
  let start = -1;

  // Walks the cheapest path of the segment [start, end) back from its end.
  const settle = (end: number) => {
    if (start < 0 || end <= start) return;
    const last = end - 1;
    let pick = 0;
    for (let k = 1; k < path.candidates[last]!.length; k++) if (cost[offset[last]! + k]! < cost[offset[last]! + pick]!) pick = k;
    for (let i = last; i >= start; i--) {
      y[i] = path.candidates[i]![pick]!;
      if (i > start) pick = back[offset[i]! + pick]!;
    }
    start = -1;
  };
  const seed = (i: number) => {
    const floors = path.candidates[i]!;
    for (let k = 0; k < floors.length; k++) {
      cost[offset[i]! + k] = reference === undefined ? 0 : Math.abs(floors[k]! - reference) / scale * SEED_COST_PER_YARD;
    }
    start = i;
  };

  for (let i = 0; i < count; i++) {
    const floors = path.candidates[i]!;
    if (floors.length === 0) {
      settle(i);
      continue;
    }
    if (start < 0 || path.restart[i]) {
      settle(i);
      seed(i);
      continue;
    }
    const before = path.candidates[i - 1]!;
    const from = offset[i - 1]!;
    const at = offset[i]!;
    let reachable = false;
    for (let k = 0; k < floors.length; k++) {
      let best = Number.POSITIVE_INFINITY;
      let bestFrom = 0;
      for (let j = 0; j < before.length; j++) {
        const total = cost[from + j]! + stepCost(before[j]!, floors[k]!, scale);
        if (total < best) {
          best = total;
          bestFrom = j;
        }
      }
      cost[at + k] = best;
      back[at + k] = bestFrom;
      if (best < Number.POSITIVE_INFINITY) reachable = true;
    }
    if (!reachable) {
      settle(i);
      seed(i);
    }
  }
  settle(count);
  return y;
}

/**
 * Starts the floor-track build for `options`. Each `step` works for a time
 * budget (stepping one unit's path, casting, or choosing one unit's floors at
 * a time), so even a long run builds in slices off the frame loop.
 */
export function startFloorTrackBuild(options: FloorTrackOptions, now: () => number = () => performance.now()): FloorTrackBuild {
  const { units, scale, candidatesAt } = options;
  const paths: UnitPath[] = [];
  // Stationary units repeat their samples; one cast serves them all.
  const sampleCasts = new Map<string, Float64Array>();
  let unitIndex = 0;
  let nodeIndex = 0;
  let reference: number | undefined;
  let chosen = -1;
  const tracks = new Map<string, FloorTrack>();
  let result: FloorTracks | null = null;

  const cast = (x: number, z: number): Float64Array => {
    const heights = candidatesAt(x, z);
    return heights.length === 0 ? NO_FLOORS : Float64Array.from(heights).sort().reverse();
  };
  const sampleCast = (x: number, z: number): Float64Array => {
    const key = `${x},${z}`;
    let floors = sampleCasts.get(key);
    if (!floors) {
      floors = cast(x, z);
      sampleCasts.set(key, floors);
    }
    return floors;
  };

  // The fresh-start reference: the median highest floor under every sample.
  const measureReference = () => {
    const highest: number[] = [];
    for (const path of paths) {
      for (let i = 0; i < path.ms.length; i++) {
        const floors = path.candidates[i]!;
        if (path.sample[i] && floors.length > 0) highest.push(floors[0]!);
      }
    }
    reference = median(highest);
    sampleCasts.clear();
  };

  return {
    step(budgetMs = FLOOR_SLICE_MS) {
      if (result) return true;
      const deadline = now() + budgetMs;
      while (unitIndex < units.length) {
        const path = paths[unitIndex] ?? (paths[unitIndex] = unitPath(units[unitIndex]!, scale));
        const end = Math.min(path.ms.length, nodeIndex + STEPS_PER_CHECK);
        for (; nodeIndex < end; nodeIndex++) {
          const x = path.x[nodeIndex]!;
          const z = path.z[nodeIndex]!;
          path.candidates.push(path.sample[nodeIndex] ? sampleCast(x, z) : cast(x, z));
        }
        if (nodeIndex >= path.ms.length) {
          unitIndex++;
          nodeIndex = 0;
        }
        if (now() >= deadline) return false;
      }
      if (chosen < 0) {
        measureReference();
        chosen = 0;
        if (now() >= deadline) return false;
      }
      for (; chosen < paths.length; chosen++) {
        const path = paths[chosen]!;
        if (path.ms.length > 0) {
          tracks.set(path.guid, {
            ms: Float64Array.from(path.ms),
            x: Float64Array.from(path.x),
            z: Float64Array.from(path.z),
            y: chooseFloors(path, reference, scale),
          });
        }
        // The path is done with: let its candidates go.
        paths[chosen] = EMPTY_PATH;
        if (now() >= deadline) {
          chosen++;
          return false;
        }
      }
      result = { units: tracks, reference };
      return true;
    },
    get result() {
      return result;
    },
  };
}

/** Builds every track at once (tests, small inputs); see startFloorTrackBuild. */
export function buildFloorTracks(options: FloorTrackOptions): FloorTracks {
  const build = startFloorTrackBuild(options);
  while (!build.step(Number.POSITIVE_INFINITY));
  return build.result!;
}

/**
 * The track's floor (scene units) at replay time `ms` for a unit drawn at
 * (x, z): between steps it follows the path as the replay interpolates it.
 * Null when the track has no floor there, or the unit is further than
 * `tolerance` from the path it was built from (other data: the caller falls
 * back to probing).
 */
export function floorTrackAt(track: FloorTrack, ms: number, x: number, z: number, tolerance: number): number | null {
  const last = track.ms.length - 1;
  if (last < 0) return null;
  // The last step at or before `ms`.
  let low = 0;
  let high = last;
  if (ms < track.ms[0]!) high = 0;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (track.ms[middle]! <= ms) low = middle;
    else high = middle - 1;
  }
  const near = (i: number) => Math.hypot(track.x[i]! - x, track.z[i]! - z) <= tolerance;
  const floorOf = (i: number) => (Number.isNaN(track.y[i]!) ? null : track.y[i]!);
  if (low < last) {
    const next = low + 1;
    const span = track.ms[next]! - track.ms[low]!;
    const t = span > 0 ? Math.min(1, Math.max(0, (ms - track.ms[low]!) / span)) : 1;
    const px = track.x[low]! + (track.x[next]! - track.x[low]!) * t;
    const pz = track.z[low]! + (track.z[next]! - track.z[low]!) * t;
    if (Math.hypot(px - x, pz - z) <= tolerance) {
      const a = floorOf(low);
      const b = floorOf(next);
      if (a === null || b === null) return a ?? b;
      return a + (b - a) * t;
    }
    if (near(next)) return floorOf(next);
  }
  // Samples logged at the same time: any of their steps.
  for (let i = low; i >= 0 && track.ms[i] === track.ms[low]; i--) if (near(i)) return floorOf(i);
  return null;
}
