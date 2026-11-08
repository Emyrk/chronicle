/**
 * The live cinematic camera's look-ahead (chronicle-1579). The replay is
 * recorded, so instead of chasing the framing of the current frame (which
 * jumps when a straggler leaves, a boss engages or the group walks past a
 * dead zone), the Director follows a framing track built ahead of time from
 * the recorded positions, as the video drone does: the Director's framing is
 * sampled at fixed replay intervals and smoothed over centred windows of
 * replay time, so the shot is a pure function of replay time and starts
 * moving before the group does.
 *
 * The track also carries the yaw the camera looks from (chronicle-1724):
 * behind the group's direction of travel, turned to the nearest clear line
 * where the cave blocks it, smoothed and rate-capped ahead of time.
 *
 * Also here: the hold that keeps the line-of-sight answer from flipping each
 * frame, and the glide across a replay jump (a seek, a skipped gap, a loop).
 *
 * Pure maths only — no three.js, no DOM.
 */
import {
  BOSS_ENGAGE_YARDS,
  CINEMATIC_ELEVATION_DEG,
  directorFrame,
  DISTANCE_SMOOTH_SECONDS,
  type DampedValue,
  smoothDamp,
  MIN_FRAME_RADIUS_YARDS,
  STRAGGLER_CUTOFF_YARDS,
  STRAGGLER_RELEASE_YARDS,
  type DirectorUnit,
} from "./cameraDirector";
import { windowed } from "./droneCamera";

/** How often the framing is sampled (replay time, at 1x). */
export const FOLLOW_SAMPLE_MS = 250;
/** Half-widths of the smoothing windows (replay time at 1x), as the drone's. */
export const FOLLOW_CENTRE_WINDOW_MS = 3_000;
export const FOLLOW_RADIUS_WINDOW_MS = 2_000;
/**
 * The cover radius first takes the largest value within this half-width,
 * then the radius window's mean: a straggler blinking in and out at the
 * cutoff widens the frame a little, not to its widest for the whole window.
 */
export const FOLLOW_RADIUS_PEAK_MS = 500;
/** A followed unit is a single point: a shorter window keeps it centred. */
export const FOLLOW_SUBJECT_WINDOW_MS = 1_000;
/** The springs only smooth what the track leaves over, so they can be quick. */
export const FOLLOW_SMOOTH_SECONDS = 0.3;
/**
 * Fast playback stretches the sample spacing and the centre window, but only
 * up to these factors of the 1x values (so at most 1 s between samples and a
 * 6 s centre window, in replay time): averaging minutes of a winding cave path
 * cuts its bends into the rock (chronicle-1723). The radius windows keep
 * stretching with the speed, which keeps a fast shot calm.
 */
export const FOLLOW_MAX_SAMPLE_STRETCH = 4;
export const FOLLOW_MAX_WINDOW_STRETCH = 2;
/**
 * The smoothed centre never sits further than this from the per-sample
 * framing (the framed units' circle), except where the framing itself jumps
 * (more than twice this between samples: a gap, a teleport), whose slide is
 * left alone.
 */
export const FOLLOW_CENTRE_CLAMP_YARDS = 12;
/**
 * The replay clock moving more than playback explains by this much is a jump,
 * or by FOLLOW_JUMP_REAL_MS of play at a fast speed (a tick re-anchoring the
 * clock can be off by a couple of hundred milliseconds of real time).
 */
export const FOLLOW_JUMP_MS = 1_500;
export const FOLLOW_JUMP_REAL_MS = 400;

/** Below this pace (yd/s of replay) the group counts as standing (a fight): the yaw holds instead of spinning. */
export const FOLLOW_YAW_MOVING_YPS = 2;
/**
 * The yaws tried around the base yaw (degrees, + turns the camera
 * anticlockwise seen from above), nearest first. A track's `yawOpen[i]` has bit
 * k set when candidate k had a clear line at sample i.
 */
export const FOLLOW_YAW_CANDIDATES_DEG: readonly number[] = [0, 30, -30, 60, -60, 90, -90, 135, -135, 180];
/** Half-width of the yaw's smoothing window (replay ms at 1x); it stretches fully with the speed, so the yaw is as calm in real time at 32x. */
export const FOLLOW_YAW_WINDOW_MS = 3_000;
/** The fastest the yaw turns, in real time (radians a second): on the track, and frame to frame. */
export const FOLLOW_YAW_MAX_RATE = (45 * Math.PI) / 180;
/** The yaw spring's smoothing (real seconds); its goal is led by its trail, as the position spring's is. */
export const FOLLOW_YAW_SMOOTH_SECONDS = 0.6;

/** A higher line-of-sight answer only drops back once lower ones have held this long (real time). */
export const SHOT_RELEASE_MS = 1_500;

/** The glide across a replay jump: its speed (yards a second), and its shortest and longest length. */
export const GLIDE_SPEED_YARDS_PER_S = 60;
export const GLIDE_MIN_MS = 900;
export const GLIDE_MAX_MS = 3_000;
/** The most a glide pulls out mid-way, as a fraction of its distance. */
export const GLIDE_PULL_OUT = 0.6;

export interface FollowTrackOptions {
  /** The replay span the track covers. */
  startMs: number;
  endMs: number;
  /** The units at replay time `ms`, in scene units. */
  unitsAt: (ms: number) => readonly DirectorUnit[];
  /** Scene units per yard. */
  scale: number;
  /** Follow this unit instead of the group. */
  subjectGuid?: string | null;
  /** Replay ms per real ms: sampling and windows stretch with it (the centre's only up to FOLLOW_MAX_WINDOW_STRETCH), so a fast replay stays calm. */
  speed?: number;
  sampleMs?: number;
  /** Half-widths of the centre and radius windows (replay ms at 1x); the defaults when left out. */
  centreWindowMs?: number;
  radiusWindowMs?: number;
  /** Half-width of the yaw's window (replay ms at 1x); FOLLOW_YAW_WINDOW_MS when left out. */
  yawWindowMs?: number;
  /** Tells which yaws have a clear line; without one, every yaw counts as clear. */
  probe?: FollowYawProbe | null;
  /** The yaw while the group has not moved yet (and throughout, if it never does). */
  initialYaw?: number;
}

/**
 * The cave mesh, seen by the yaw pass (injected, so this file stays free of
 * three.js, as the drone's `probe.clearShot`).
 */
export interface FollowYawProbe {
  /** Whether the line from the framing at (x, z) to a camera at `yaw`, framing `radius` at the base elevation, is clear. */
  clearYaw(x: number, z: number, radius: number, yaw: number): boolean;
}

/** The smoothed framing over a replay span; sample it with followKeyAt. */
export interface FollowTrack {
  startMs: number;
  endMs: number;
  sampleMs: number;
  subjectGuid: string | null;
  speed: number;
  x: Float64Array;
  z: Float64Array;
  radius: Float64Array;
  /** The yaw the camera looks from (radians, unwrapped: continuous across +-pi), smoothed and rate-capped. */
  yaw: Float64Array;
  /** Per sample: the yaw behind the direction of travel (held while the group stands), unwrapped. */
  baseYaw: Float64Array;
  /** Per sample: bit k set when base + FOLLOW_YAW_CANDIDATES_DEG[k] had a clear line (all set without a probe). */
  yawOpen: Uint16Array;
}

/** The framing at one moment: the circle's centre and the radius that covers everyone framed. */
export interface FollowKey {
  x: number;
  z: number;
  radius: number;
  /** The yaw the camera looks from (radians, unwrapped). */
  yaw: number;
}

/** How long one slice of a track build may block the main thread (ms). */
export const FOLLOW_SLICE_MS = 6;

/**
 * A follow track being built in slices, so a long run never blocks a frame:
 * call `step` until it returns true, then read `result`.
 */
export interface FollowTrackBuild {
  /** Works for about `budgetMs` (at least one sample), then yields; true once the track is done. */
  step(budgetMs?: number): boolean;
  /**
   * The finished track. Null when nobody is ever there to frame, or when the
   * followed unit never appears in the source (frame it frame by frame).
   */
  readonly result: FollowTrack | null;
}

/** How much the centre window (replay time) stretches at `speed`. */
export function followWindowStretch(speed: number): number {
  return Math.min(Math.max(1, speed), FOLLOW_MAX_WINDOW_STRETCH);
}

/** How the Director's springs follow a track. */
export interface FollowSprings {
  /** The position spring's smoothing (real seconds). */
  position: number;
  /** How far ahead (replay ms) the position spring's goal is sampled. */
  leadMs: number;
  /** The distance spring's smoothing (real seconds). */
  distance: number;
  /** How far ahead (replay ms) the radius the distance is fitted to is sampled. */
  distanceLeadMs: number;
  /** The yaw spring's smoothing (real seconds). */
  yaw: number;
  /** How far ahead (replay ms) the yaw spring's goal is sampled. */
  yawLeadMs: number;
}

/**
 * The springs while following a track at `speed`. The track moves on replay
 * time and the springs on real time: a critically damped spring trails a
 * steady move by its smoothing time, which is `speed` times as much replay at
 * a fast speed (tens of yards at 32x). So the springs keep their real-time
 * smoothing (it filters the replay clock's coarse ticks and eases a short
 * seek or a shortened shot), and each goal is sampled that far ahead, which
 * cancels the trail (chronicle-1723). Paused, there is no lead.
 */
export function followSprings(speed: number, playing: boolean): FollowSprings {
  const replayPerSecond = playing ? Math.max(1, speed) * 1_000 : 0;
  return {
    position: FOLLOW_SMOOTH_SECONDS,
    leadMs: replayPerSecond * FOLLOW_SMOOTH_SECONDS,
    distance: DISTANCE_SMOOTH_SECONDS,
    distanceLeadMs: replayPerSecond * DISTANCE_SMOOTH_SECONDS,
    yaw: FOLLOW_YAW_SMOOTH_SECONDS,
    yawLeadMs: replayPerSecond * FOLLOW_YAW_SMOOTH_SECONDS,
  };
}

/**
 * One frame of the yaw spring toward the track's (led) yaw `goal`: the goal
 * is unwrapped to within half a turn of the spring, so it never spins the
 * long way round, and no frame turns more than FOLLOW_YAW_MAX_RATE allows.
 * Mutates `state` and returns its new (unwrapped) value.
 */
export function followYawStep(state: DampedValue, goal: number, smoothSeconds: number, dt: number, maxRate = FOLLOW_YAW_MAX_RATE): number {
  const before = state.value;
  smoothDamp(state, before + wrapAngle(goal - before), smoothSeconds, dt);
  const cap = maxRate * dt;
  const turned = state.value - before;
  if (Math.abs(turned) > cap) state.value = before + Math.sign(turned) * cap;
  state.velocity = Math.min(maxRate, Math.max(-maxRate, state.velocity));
  return state.value;
}

/**
 * The yaw spring's handover after a cut, as handOverFollowSpring: on the
 * track's yaw `at`, turning at the rate that keeps it on the led yaw `led`
 * (capped). Mutates and returns `spring`.
 */
export function handOverFollowYaw(spring: DampedValue, at: number, led: number, springs: FollowSprings, maxRate = FOLLOW_YAW_MAX_RATE): DampedValue {
  spring.value = at;
  spring.velocity = springs.yawLeadMs > 0 ? Math.min(maxRate, Math.max(-maxRate, (led - at) / springs.yaw)) : 0;
  return spring;
}

/**
 * Hands a position spring over to a led goal without a jump: the spring sits
 * on `at` (where the group is) moving at the track's speed, which is where a
 * spring that has been chasing `led` (its goal, `springs.leadMs` ahead) settles.
 * Use it after a cut; a glide that lands on `at` hands over with that velocity
 * already. Mutates and returns `spring`.
 */
export function handOverFollowSpring(spring: DampedValue, at: number, led: number, springs: FollowSprings): DampedValue {
  spring.value = at;
  spring.velocity = springs.leadMs > 0 ? (led - at) / springs.position : 0;
  return spring;
}

// A moving average over `half` samples either side, in O(n) with a running sum.
function movingMean(values: ArrayLike<number>, half: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  let sum = 0;
  let from = 0;
  let to = -1;
  for (let i = 0; i < n; i++) {
    const nextFrom = Math.max(0, i - half);
    const nextTo = Math.min(n - 1, i + half);
    while (to < nextTo) sum += values[++to]!;
    while (from < nextFrom) sum -= values[from++]!;
    out[i] = sum / (to - from + 1);
  }
  return out;
}

/**
 * Starts building the follow track: the Director's framing sampled over the
 * span and smoothed over replay time. `now` is the clock the slices are
 * timed with.
 */
export function startFollowTrackBuild(options: FollowTrackOptions, now: () => number = () => performance.now()): FollowTrackBuild {
  const { startMs, endMs, unitsAt, scale, subjectGuid = null, probe = null } = options;
  const speed = Math.max(1, options.speed ?? 1);
  const baseSampleMs = options.sampleMs ?? FOLLOW_SAMPLE_MS;
  const sampleMs = baseSampleMs * Math.min(speed, FOLLOW_MAX_SAMPLE_STRETCH);
  const span = Math.max(0, endMs - startMs);
  const count = Math.max(1, Math.ceil(span / sampleMs) + 1);
  const frameOptions = {
    stragglerCutoff: STRAGGLER_CUTOFF_YARDS * scale,
    stragglerRelease: STRAGGLER_RELEASE_YARDS * scale,
    bossEngageDistance: BOSS_ENGAGE_YARDS * scale,
    subjectGuid,
  };

  // The Director's framing at each sample (with its straggler hysteresis),
  // and the framed units' positions (x, z pairs, one small array per sample:
  // one huge growing array would stall a slice each time it is copied) so
  // the cover radius can be measured from the smoothed centre.
  const rawX = new Float64Array(count).fill(Number.NaN);
  const rawZ = new Float64Array(count).fill(Number.NaN);
  const NONE = new Float64Array(0);
  const framed = new Array<Float64Array>(count).fill(NONE);
  let inFrame = new Set<string>();
  let subjectSeen = subjectGuid === null;
  let sampled = 0;
  let xs: Float64Array | null = null;
  let zs: Float64Array | null = null;
  let cover: Float64Array | null = null;
  let covered = 0;
  let radii: Float64Array | null = null;
  let baseYaw: Float64Array | null = null;
  let yawOpen: Uint16Array | null = null;
  let probed = 0;
  let done = false;
  let result: FollowTrack | null = null;
  const minRadius = MIN_FRAME_RADIUS_YARDS * scale;
  const clamp = FOLLOW_CENTRE_CLAMP_YARDS * scale;

  // Gaps (nobody to frame) hold the nearest framing on either side, so the
  // centred window glides into the next one before the group appears there.
  // Then the centre: a moving average over replay time, applied twice at half
  // the width (a triangular window), so a jump in the framing becomes a slide
  // that also eases in and out instead of starting at full speed.
  const smoothCentre = (): boolean => {
    let firstValid = -1;
    for (let i = 0; i < count && firstValid < 0; i++) if (!Number.isNaN(rawX[i]!)) firstValid = i;
    if (firstValid < 0 || !subjectSeen) return false;
    for (let i = 0; i < count; i++) {
      if (!Number.isNaN(rawX[i]!)) continue;
      const from = i < firstValid ? firstValid : i - 1;
      rawX[i] = rawX[from]!;
      rawZ[i] = rawZ[from]!;
      framed[i] = framed[from]!;
    }
    const windowMs = (subjectGuid ? FOLLOW_SUBJECT_WINDOW_MS : options.centreWindowMs ?? FOLLOW_CENTRE_WINDOW_MS) * followWindowStretch(speed);
    const half = Math.max(1, Math.round(windowMs / sampleMs / 2));
    xs = movingMean(movingMean(rawX, half), half);
    zs = movingMean(movingMean(rawZ, half), half);
    // Keep the centre near the framing it smooths, so a bend is not cut into
    // the rock; within the window of a jump in the framing, its slide stays.
    const jumps = new Int32Array(count + 1);
    for (let i = 1; i < count; i++) {
      const jumped = Math.hypot(rawX[i]! - rawX[i - 1]!, rawZ[i]! - rawZ[i - 1]!) > 2 * clamp;
      jumps[i + 1] = jumps[i]! + (jumped ? 1 : 0);
    }
    const reach = 2 * half;
    for (let i = 0; i < count; i++) {
      // Any jump into a sample within the window (2 * half either side) leaves it be.
      if (jumps[Math.min(count, i + reach + 1)]! - jumps[Math.max(0, i - reach) + 1]! > 0) continue;
      const dx = xs[i]! - rawX[i]!;
      const dz = zs[i]! - rawZ[i]!;
      const off = Math.hypot(dx, dz);
      if (off <= clamp) continue;
      xs[i] = rawX[i]! + (dx * clamp) / off;
      zs[i] = rawZ[i]! + (dz * clamp) / off;
    }
    cover = new Float64Array(count);
    return true;
  };

  // The radius that covers everyone framed, from the smoothed centre: a short
  // peak hold then a mean, so a straggler leaving or a boss engaging eases
  // the frame instead of jumping it, a long slide to the next fight pulls the
  // camera out on the way, and a straggler hovering at the cutoff does not
  // hold the frame at its widest (chronicle-1579 review: that backed the
  // camera into the cave walls). Then the base yaw, ready for the probe pass.
  const smoothRadius = () => {
    const peakHalf = Math.max(1, Math.round((FOLLOW_RADIUS_PEAK_MS * speed) / sampleMs));
    const meanHalf = Math.max(1, Math.round(((options.radiusWindowMs ?? FOLLOW_RADIUS_WINDOW_MS) * speed) / sampleMs / 2));
    radii = Float64Array.from(movingMean(movingMean(windowed(Array.from(cover!), peakHalf, "max"), meanHalf), meanHalf));
    baseYaw = baseYaws(xs!, zs!, FOLLOW_YAW_MOVING_YPS * scale * (sampleMs / 1_000), options.initialYaw ?? 0);
    yawOpen = new Uint16Array(count);
    if (!probe) yawOpen.fill(ALL_YAWS_OPEN);
  };

  // The yaw: per sample the clear candidate nearest the base, unwrapped, then
  // smoothed over replay time (stretched fully with the speed) and capped at
  // FOLLOW_YAW_MAX_RATE of real time.
  const finish = () => {
    const chosen = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const previous = i > 0 ? chosen[i - 1]! : baseYaw![0]!;
      const yaw = chooseYaw(baseYaw![i]!, yawOpen![i]!, previous);
      chosen[i] = i > 0 ? previous + wrapAngle(yaw - previous) : yaw;
    }
    const half = Math.max(1, Math.round(((options.yawWindowMs ?? FOLLOW_YAW_WINDOW_MS) * speed) / sampleMs / 2));
    const maxStep = (FOLLOW_YAW_MAX_RATE * sampleMs) / (speed * 1_000);
    const yaw = rateLimited(movingMean(movingMean(chosen, half), half), maxStep);
    result = { startMs, endMs: startMs + span, sampleMs, subjectGuid, speed, x: xs!, z: zs!, radius: radii!, yaw, baseYaw: baseYaw!, yawOpen: yawOpen! };
  };

  return {
    get result() {
      return result;
    },
    step(budgetMs = Number.POSITIVE_INFINITY) {
      if (done) return true;
      const until = now() + budgetMs;
      while (sampled < count) {
        const units = unitsAt(startMs + Math.min(span, sampled * sampleMs));
        const frame = directorFrame(units, inFrame, frameOptions);
        if (frame) {
          inFrame = new Set(frame.guids);
          rawX[sampled] = frame.x;
          rawZ[sampled] = frame.z;
          const points = new Float64Array(frame.guids.length * 2);
          let p = 0;
          for (const unit of units) {
            if (!inFrame.has(unit.guid)) continue;
            points[p++] = unit.x;
            points[p++] = unit.z;
            if (unit.guid === subjectGuid) subjectSeen = true;
          }
          framed[sampled] = p === points.length ? points : points.subarray(0, p);
        }
        sampled++;
        if (now() >= until) return false;
      }
      // Each finishing pass is a slice of its own.
      if (!xs) {
        if (!smoothCentre()) {
          done = true;
          return true;
        }
        return false;
      }
      while (covered < count) {
        let radius = minRadius;
        const cx = xs![covered]!;
        const cz = zs![covered]!;
        const points = framed[covered]!;
        for (let p = 0; p < points.length; p += 2) radius = Math.max(radius, Math.hypot(points[p]! - cx, points[p + 1]! - cz));
        cover![covered] = radius;
        covered++;
        if ((covered & 255) === 0 && now() >= until) return false;
        if (covered === count) return false;
      }
      if (!radii) {
        smoothRadius();
        return false;
      }
      // The probe pass: each sample's candidate yaws against the cave.
      while (probe && probed < count) {
        yawOpen![probed] = openYaws(probe, xs![probed]!, zs![probed]!, radii[probed]!, baseYaw![probed]!);
        probed++;
        if (now() >= until) return false;
      }
      finish();
      done = true;
      return true;
    },
  };
}

const ALL_YAWS_OPEN = (1 << FOLLOW_YAW_CANDIDATES_DEG.length) - 1;
const YAW_CANDIDATES = FOLLOW_YAW_CANDIDATES_DEG.map((deg) => (deg * Math.PI) / 180);

/** `angle` wrapped into (-pi, pi]. */
export function wrapAngle(angle: number): number {
  const wrapped = angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

// The yaw behind the smoothed centre's direction of travel at each sample
// (unwrapped), held while it moves less than `moving` (scene units a sample):
// a fight does not spin the camera. Before the first move, the first moving
// yaw (or `initialYaw` if the group never moves).
function baseYaws(xs: Float64Array, zs: Float64Array, moving: number, initialYaw: number): Float64Array {
  const n = xs.length;
  const out = new Float64Array(n);
  let last = Number.NaN;
  let first = -1;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = xs[b]! - xs[a]!;
    const dz = zs[b]! - zs[a]!;
    if (b > a && Math.hypot(dx, dz) > moving * (b - a)) {
      // The camera sits at (sin yaw, cos yaw) from the aim: behind is against the travel.
      const yaw = Math.atan2(-dx, -dz);
      last = Number.isNaN(last) ? yaw : last + wrapAngle(yaw - last);
      if (first < 0) first = i;
    }
    out[i] = last;
  }
  out.fill(first < 0 ? initialYaw : out[first]!, 0, first < 0 ? n : first);
  return out;
}

// Which candidate yaws around `base` have a clear line (bit k: candidate k).
function openYaws(probe: FollowYawProbe, x: number, z: number, radius: number, base: number): number {
  let open = 0;
  for (let k = 0; k < YAW_CANDIDATES.length; k++) if (probe.clearYaw(x, z, radius, base + YAW_CANDIDATES[k]!)) open |= 1 << k;
  return open;
}

/**
 * The yaw to shoot from given a sample's base yaw and its `yawOpen` mask: the
 * clear candidate nearest the base, a tie going to the side nearer `previous`
 * (so a blocked base does not flip the camera left and right). The base when
 * nothing is clear (the elevation climbs instead).
 */
export function chooseYaw(base: number, open: number, previous: number): number {
  let best = base;
  let bestOff = Number.POSITIVE_INFINITY;
  for (let k = 0; k < YAW_CANDIDATES.length; k++) {
    if (!(open & (1 << k))) continue;
    const off = Math.abs(YAW_CANDIDATES[k]!);
    if (off > bestOff + 1e-9) break;
    const yaw = base + YAW_CANDIDATES[k]!;
    if (off < bestOff - 1e-9 || Math.abs(wrapAngle(yaw - previous)) < Math.abs(wrapAngle(best - previous))) best = yaw;
    bestOff = Math.min(bestOff, off);
  }
  return best;
}

// Caps each step at `maxStep`, forwards and backwards, and averages the two,
// so the cap does not make the yaw lag (or lead) a turn; the average of two
// capped runs is capped too.
function rateLimited(values: Float64Array, maxStep: number): Float64Array {
  const n = values.length;
  const forward = new Float64Array(n);
  const out = new Float64Array(n);
  const step = (from: number, to: number) => from + Math.min(maxStep, Math.max(-maxStep, to - from));
  forward[0] = values[0]!;
  for (let i = 1; i < n; i++) forward[i] = step(forward[i - 1]!, values[i]!);
  let backward = values[n - 1]!;
  out[n - 1] = (forward[n - 1]! + backward) / 2;
  for (let i = n - 2; i >= 0; i--) {
    backward = step(backward, values[i]!);
    out[i] = (forward[i]! + backward) / 2;
  }
  return out;
}

/** Builds the whole follow track at once (tests, small spans); see startFollowTrackBuild. */
export function buildFollowTrack(options: FollowTrackOptions): FollowTrack | null {
  const build = startFollowTrackBuild(options);
  while (!build.step());
  return build.result;
}

// Catmull-Rom through four keys, `t` of the way from b to c.
function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

/** The track's framing at replay time `ms` (clamped to it), Catmull-Rom between samples, written into `out`. Allocates nothing. */
export function followKeyAt(track: FollowTrack, ms: number, out: FollowKey): FollowKey {
  const { x, z, radius, sampleMs } = track;
  const last = x.length - 1;
  const at = (Math.min(Math.max(ms, track.startMs), track.endMs) - track.startMs) / sampleMs;
  const i1 = Math.min(last, Math.floor(at));
  const t = at - i1;
  const i0 = Math.max(0, i1 - 1);
  const i2 = Math.min(last, i1 + 1);
  const i3 = Math.min(last, i1 + 2);
  out.x = catmullRom(x[i0]!, x[i1]!, x[i2]!, x[i3]!, t);
  out.z = catmullRom(z[i0]!, z[i1]!, z[i2]!, z[i3]!, t);
  out.radius = catmullRom(radius[i0]!, radius[i1]!, radius[i2]!, radius[i3]!, t);
  const { yaw } = track;
  out.yaw = catmullRom(yaw[i0]!, yaw[i1]!, yaw[i2]!, yaw[i3]!, t);
  return out;
}

/**
 * Whether the replay clock moved from `previousMs` to `ms` by more than
 * playback explains (`expectedMs` of play at `speed`): a seek, a skipped
 * gap between encounters, or a loop back to the start. Only playback
 * re-anchors by more at a fast speed: paused, any seek past FOLLOW_JUMP_MS is one.
 */
export function isReplayJump(previousMs: number, ms: number, expectedMs: number, speed: number, playing = true): boolean {
  return Math.abs(ms - previousMs - expectedMs) > Math.max(FOLLOW_JUMP_MS, playing ? FOLLOW_JUMP_REAL_MS * speed : 0);
}

/** What the line-of-sight check currently holds the shot at. */
export interface ShotHold {
  elevationDeg: number;
  /** Even the highest elevation was blocked, so the shot comes in closer. */
  shortened: boolean;
  /** When the raw answer first asked for less than the held one, or null. */
  lowerSinceMs: number | null;
}

export function createShotHold(): ShotHold {
  return { elevationDeg: CINEMATIC_ELEVATION_DEG, shortened: false, lowerSinceMs: null };
}

function shotRank(elevationDeg: number, shortened: boolean): number {
  return elevationDeg + (shortened ? 1_000 : 0);
}

/**
 * Hysteresis for the line-of-sight answer: a higher elevation (or the
 * shortened shot) is taken at once, so the fight is not hidden, but the shot
 * only comes back down once every answer for SHOT_RELEASE_MS asked for less.
 * A ray that flips between blocked and clear frame to frame therefore moves
 * the camera once, not back and forth. Mutates and returns `hold`.
 */
export function holdShot(hold: ShotHold, elevationDeg: number, shortened: boolean, nowMs: number, releaseMs = SHOT_RELEASE_MS): ShotHold {
  const held = shotRank(hold.elevationDeg, hold.shortened);
  const next = shotRank(elevationDeg, shortened);
  if (next > held) {
    hold.elevationDeg = elevationDeg;
    hold.shortened = shortened;
    hold.lowerSinceMs = null;
  } else if (next === held) {
    hold.lowerSinceMs = null;
  } else if (hold.lowerSinceMs === null) {
    hold.lowerSinceMs = nowMs;
  } else if (nowMs - hold.lowerSinceMs >= releaseMs) {
    hold.elevationDeg = elevationDeg;
    hold.shortened = shortened;
    hold.lowerSinceMs = null;
  }
  return hold;
}

/** A Director shot: the aim point on the floor plane, the distance out and the elevation. */
export interface GlidePose {
  x: number;
  z: number;
  distance: number;
  elevationDeg: number;
  /** The aim point's velocity (scene units a second) when the glide starts; none when left out. */
  vx?: number;
  vz?: number;
  /** The yaw (radians); the glide turns it along the shortest arc when both ends have one. */
  yaw?: number;
  /** The yaw's rate (radians a second) when the glide starts. */
  vyaw?: number;
}

/**
 * How long the glide across a replay jump of `travel` (scene units) takes,
 * long enough that a `turn` (radians) peaks at FOLLOW_YAW_MAX_RATE, within
 * GLIDE_MAX_MS.
 */
export function glideDurationMs(travel: number, scale: number, turn = 0): number {
  const ms = (1_000 * travel) / (GLIDE_SPEED_YARDS_PER_S * Math.max(1e-6, scale));
  // The sine ease peaks at pi/2 times its average rate.
  const turning = (1_000 * Math.abs(wrapAngle(turn)) * Math.PI) / (2 * FOLLOW_YAW_MAX_RATE);
  return Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, ms, turning));
}

// Sine ease in-out: no velocity at either end, and a gentle peak (pi/2 times the average speed).
function easeInOutSine(t: number): number {
  return (1 - Math.cos(Math.PI * t)) / 2;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/**
 * The glide across a replay jump, `t` (0..1) of the way from `from` to `to`:
 * eased in and out (no velocity at either end), the distance eased in log
 * space, and pulled out mid-way in proportion to how far it travels, so a
 * long move reads as a crane up and over rather than a whip-pan. A glide
 * that starts while the camera is moving (another jump mid-glide) carries
 * `from`'s velocity in and lets it fade out, so it has no corner either.
 * Written into `out`.
 */
export function glidePoseAt(from: GlidePose, to: GlidePose, t: number, out: GlidePose, durationMs = 0): GlidePose {
  const clamped = Math.min(1, Math.max(0, t));
  const eased = easeInOutSine(clamped);
  // Hermite's start-velocity term: slope 1 at t = 0, gone (value and slope) at t = 1.
  const carry = (durationMs / 1000) * clamped * (1 - clamped) ** 2;
  const travel = Math.hypot(to.x - from.x, to.z - from.z);
  const pull = Math.min(GLIDE_PULL_OUT, travel / (2 * Math.max(1e-6, from.distance, to.distance)));
  out.x = lerp(from.x, to.x, eased) + (from.vx ?? 0) * carry;
  out.z = lerp(from.z, to.z, eased) + (from.vz ?? 0) * carry;
  out.elevationDeg = lerp(from.elevationDeg, to.elevationDeg, eased);
  if (from.yaw !== undefined && to.yaw !== undefined) {
    out.yaw = from.yaw + wrapAngle(to.yaw - from.yaw) * eased + (from.vyaw ?? 0) * carry;
  }
  const distance = Math.exp(lerp(Math.log(Math.max(1e-6, from.distance)), Math.log(Math.max(1e-6, to.distance)), eased));
  out.distance = distance * (1 + pull * Math.sin(Math.PI * eased));
  return out;
}
