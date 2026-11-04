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
  MIN_FRAME_RADIUS_YARDS,
  STRAGGLER_CUTOFF_YARDS,
  STRAGGLER_RELEASE_YARDS,
  type DirectorUnit,
} from "./cameraDirector";
import { smoothCeiling, windowed } from "./droneCamera";

/** How often the framing is sampled (replay time, at 1x). */
export const FOLLOW_SAMPLE_MS = 250;
/** Half-widths of the smoothing windows (replay time at 1x), as the drone's. */
export const FOLLOW_CENTRE_WINDOW_MS = 3_000;
export const FOLLOW_RADIUS_WINDOW_MS = 2_000;
/** A followed unit is a single point: a shorter window keeps it centred. */
export const FOLLOW_SUBJECT_WINDOW_MS = 1_000;
/** The springs only smooth what the track leaves over, so they can be quick. */
export const FOLLOW_SMOOTH_SECONDS = 0.3;
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
  /** Replay ms per real ms: sampling and windows stretch with it, so a fast replay moves the camera as calmly as a real-time one. */
  speed?: number;
  sampleMs?: number;
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

/**
 * Samples the Director's framing over the span and smooths it over replay
 * time. Null when nobody is ever there to frame.
 */
export function buildFollowTrack(options: FollowTrackOptions): FollowTrack | null {
  const { startMs, endMs, unitsAt, scale, subjectGuid = null } = options;
  const speed = Math.max(1, options.speed ?? 1);
  const baseSampleMs = options.sampleMs ?? FOLLOW_SAMPLE_MS;
  const sampleMs = baseSampleMs * speed;
  const span = Math.max(0, endMs - startMs);
  const count = Math.max(1, Math.ceil(span / sampleMs) + 1);

  // 1. The Director's framing at each sample (with its straggler hysteresis),
  // keeping the framed units so the cover radius is measured from the
  // smoothed centre.
  const rawX = new Array<number>(count);
  const rawZ = new Array<number>(count);
  const framed = new Array<{ x: number; z: number }[]>(count);
  let inFrame = new Set<string>();
  for (let i = 0; i < count; i++) {
    const units = unitsAt(startMs + Math.min(span, i * sampleMs));
    const frame = directorFrame(units, inFrame, {
      stragglerCutoff: STRAGGLER_CUTOFF_YARDS * scale,
      stragglerRelease: STRAGGLER_RELEASE_YARDS * scale,
      bossEngageDistance: BOSS_ENGAGE_YARDS * scale,
      subjectGuid,
    });
    if (!frame) {
      rawX[i] = Number.NaN;
      rawZ[i] = Number.NaN;
      framed[i] = [];
      continue;
    }
    inFrame = new Set(frame.guids);
    rawX[i] = frame.x;
    rawZ[i] = frame.z;
    framed[i] = units.filter((unit) => inFrame.has(unit.guid)).map((unit) => ({ x: unit.x, z: unit.z }));
  }
  // Gaps (nobody to frame) hold the nearest framing on either side, so the
  // centred window glides into the next one before the group appears there.
  const firstValid = rawX.findIndex((value) => !Number.isNaN(value));
  if (firstValid < 0) return null;
  for (let i = 0; i < count; i++) {
    if (!Number.isNaN(rawX[i]!)) continue;
    const from = i < firstValid ? firstValid : i - 1;
    rawX[i] = rawX[from]!;
    rawZ[i] = rawZ[from]!;
    framed[i] = framed[from]!;
  }

  // 2. The centre: a moving average over replay time, applied twice at half
  // the width (a triangular window), so a jump in the framing becomes a
  // slide that also eases in and out instead of starting at full speed.
  const centreHalf = Math.max(1, Math.round((subjectGuid ? FOLLOW_SUBJECT_WINDOW_MS : FOLLOW_CENTRE_WINDOW_MS) / baseSampleMs / 2));
  const xs = windowed(windowed(rawX, centreHalf, "mean"), centreHalf, "mean");
  const zs = windowed(windowed(rawZ, centreHalf, "mean"), centreHalf, "mean");

  // 3. The radius that covers everyone framed, from the smoothed centre, as a
  // smooth ceiling: nobody framed slips out while the centre lags, a
  // straggler leaving or a boss engaging eases the frame instead of jumping
  // it, and a long slide to the next fight pulls the camera out on the way.
  const minRadius = MIN_FRAME_RADIUS_YARDS * scale;
  const cover = framed.map((points, i) => points.reduce((radius, point) => Math.max(radius, Math.hypot(point.x - xs[i]!, point.z - zs[i]!)), minRadius));
  const radii = smoothCeiling(cover, Math.round(FOLLOW_RADIUS_WINDOW_MS / baseSampleMs));

  return {
    startMs,
    endMs: startMs + span,
    sampleMs,
    subjectGuid,
    speed,
    x: Float64Array.from(xs),
    z: Float64Array.from(zs),
    radius: Float64Array.from(radii),
  };
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
 * gap between encounters, or a loop back to the start.
 */
export function isReplayJump(previousMs: number, ms: number, expectedMs: number, speed: number): boolean {
  return Math.abs(ms - previousMs - expectedMs) > Math.max(FOLLOW_JUMP_MS, FOLLOW_JUMP_REAL_MS * speed);
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
