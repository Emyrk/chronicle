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
 * The distance spring runs on real time while the track's radius moves on
 * replay time, so with a track it shortens by the speed; it also eases the
 * line-of-sight shortened shot, so never below this (chronicle-1723).
 */
export const FOLLOW_DISTANCE_MIN_SMOOTH_SECONDS = 0.2;
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
}

/** The framing at one moment: the circle's centre and the radius that covers everyone framed. */
export interface FollowKey {
  x: number;
  z: number;
  radius: number;
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
}

/**
 * The springs while following a track at `speed`. The track moves on replay
 * time and the springs on real time: a critically damped spring trails a
 * steady move by its smoothing time, which is `speed` times as much replay at
 * a fast speed (tens of yards at 32x). So the position spring keeps its real
 * time smoothing (it filters the replay clock's coarse ticks and eases a
 * short seek) and its goal is sampled that far ahead, which cancels the trail
 * (chronicle-1723). Paused, there is no lead, and the springs are 1x's.
 */
export function followSprings(speed: number, playing: boolean): FollowSprings {
  const stretch = playing ? Math.max(1, speed) : 1;
  return {
    position: FOLLOW_SMOOTH_SECONDS,
    leadMs: playing ? stretch * FOLLOW_SMOOTH_SECONDS * 1_000 : 0,
    distance: Math.max(FOLLOW_DISTANCE_MIN_SMOOTH_SECONDS, DISTANCE_SMOOTH_SECONDS / stretch),
  };
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
  const { startMs, endMs, unitsAt, scale, subjectGuid = null } = options;
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
  // camera into the cave walls).
  const finish = () => {
    const peakHalf = Math.max(1, Math.round((FOLLOW_RADIUS_PEAK_MS * speed) / sampleMs));
    const meanHalf = Math.max(1, Math.round(((options.radiusWindowMs ?? FOLLOW_RADIUS_WINDOW_MS) * speed) / sampleMs / 2));
    const radii = movingMean(movingMean(windowed(Array.from(cover!), peakHalf, "max"), meanHalf), meanHalf);
    result = { startMs, endMs: startMs + span, sampleMs, subjectGuid, speed, x: xs!, z: zs!, radius: Float64Array.from(radii) };
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
      finish();
      done = true;
      return true;
    },
  };
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
}

/** How long the glide across a replay jump of `travel` (scene units) takes. */
export function glideDurationMs(travel: number, scale: number): number {
  const ms = (1_000 * travel) / (GLIDE_SPEED_YARDS_PER_S * Math.max(1e-6, scale));
  return Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, ms));
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
  const distance = Math.exp(lerp(Math.log(Math.max(1e-6, from.distance)), Math.log(Math.max(1e-6, to.distance)), eased));
  out.distance = distance * (1 + pull * Math.sin(Math.PI * eased));
  return out;
}
