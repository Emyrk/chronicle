/**
 * The "drone" camera of a rendered fight video: a short high, wide intro that
 * eases down onto the fight, then a slow constant orbit that keeps the boss
 * and most of the raid in frame (the Director's framing rule).
 *
 * Unlike the live Director (frame-rate dependent springs), the drone's pose is
 * a pure function of time: the framing is sampled at fixed replay intervals,
 * smoothed with windows over replay time, and interpolated between samples.
 * The same fight gives the same camera at any frame rate, every time.
 *
 * Pure maths only — no three.js, no DOM. MapScene3D supplies unit positions
 * (scene units) and an optional probe of the mesh (floor heights, a clear line
 * of sight), both deterministic.
 */
import type { MapCameraPose } from "./cameraPath";
import {
  BOSS_ENGAGE_YARDS,
  CINEMATIC_ELEVATION_DEG,
  directorFrame,
  frameDistance,
  AIM_AHEAD_FRACTION,
  MIN_FRAME_RADIUS_YARDS,
  STRAGGLER_CUTOFF_YARDS,
  STRAGGLER_RELEASE_YARDS,
  type DirectorUnit,
} from "./cameraDirector";

/** The intro: from high and wide down onto the fight, over the fight's first seconds. */
export const DRONE_INTRO_MS = 3_500;
/** One full orbit around the fight. */
export const DRONE_ORBIT_PERIOD_MS = 75_000;
/** The video holds this long on the end of the fight (the kill or the wipe). */
export const DRONE_END_HOLD_MS = 2_000;
/** How often the framing is sampled (replay time). */
export const DRONE_SAMPLE_MS = 250;
/** Half-widths of the smoothing windows (replay time). */
export const DRONE_CENTRE_WINDOW_MS = 3_000;
export const DRONE_RADIUS_WINDOW_MS = 2_000;
export const DRONE_ELEVATION_WINDOW_MS = 1_500;
/** Where the intro starts: this much further out, this high, swung this far round. */
export const DRONE_INTRO_DISTANCE_FACTOR = 2.6;
export const DRONE_INTRO_ELEVATION_DEG = 62;
export const DRONE_INTRO_YAW_OFFSET = -Math.PI / 5;
/** The camera's vertical field of view in the video. */
export const DRONE_FOV_DEG = 45;
/** How many times faster than real time a video can replay its fight. */
export const RENDER_SPEEDS = [1, 2, 4, 6] as const;
export type RenderSpeed = (typeof RENDER_SPEEDS)[number];

/** What the mesh tells the drone: both must be deterministic for a given input. */
export interface DroneProbe {
  /** The floor height (scene units) under (x, z). */
  floorAt: (x: number, z: number) => number;
  /** The lowest clear shot of (x, z) from `yaw` at `distance`: its elevation, and a shortened distance if even the highest is blocked. */
  clearShot: (x: number, z: number, distance: number, yaw: number, ms: number) => { elevation: number; distance: number };
}

export interface DroneTrackOptions {
  /** The fight's length; the track covers 0..durationMs. */
  durationMs: number;
  /** Units at `ms` into the fight, in scene units (`x`, `z`). */
  unitsAt: (ms: number) => readonly DirectorUnit[];
  /** Scene units per yard. */
  scale: number;
  /** Output width / height. */
  aspect: number;
  verticalFovDeg?: number;
  /** The orbit's compass direction at the start. */
  startYaw?: number;
  sampleMs?: number;
  probe?: DroneProbe | null;
  /** Fight ms per video ms. The orbit, intro and smoothing run in video time, so a sped-up fight is filmed as calmly as a real-time one. */
  speed?: number;
}

interface DroneKey {
  x: number;
  y: number;
  z: number;
  /** The framed circle's radius, for the aim-ahead offset. */
  radius: number;
  distance: number;
  elevationDeg: number;
}

/** The precomputed, smoothed shot for a whole fight; sample it with dronePoseAt. */
export interface DroneTrack {
  durationMs: number;
  /** Fight ms per video ms. */
  speed: number;
  sampleMs: number;
  startYaw: number;
  fovDeg: number;
  keys: DroneKey[];
  /** Where the intro starts from: the middle of the whole fight. */
  overview: { x: number; y: number; z: number };
}

/** The video's length for a fight at `speed`: the fight, then the hold on its end (real time at any speed). */
export function droneVideoDurationMs(fightMs: number, speed = 1): number {
  return Math.max(0, fightMs) / speed + DRONE_END_HOLD_MS;
}

/** The download name at `speed`: `…-4x.mp4` when sped up. */
export function speedFileName(fileName: string, speed: RenderSpeed): string {
  if (speed === 1) return fileName;
  return /\.mp4$/i.test(fileName) ? fileName.replace(/\.mp4$/i, `-${speed}x.mp4`) : `${fileName}-${speed}x`;
}

/** The fight time (ms into the fight, clamped to it) shown `videoMs` into a video at `speed`. */
export function fightMsAtVideoMs(videoMs: number, speed: number, fightMs: number): number {
  return Math.min(Math.max(0, videoMs) * speed, Math.max(0, fightMs));
}

/**
 * The frames to render for a fight at `speed` and `fps`: the whole video, or
 * only `range` (ms into the video). Frame `firstFrame + i` is at
 * `(firstFrame + i) * 1000 / fps` ms into the video.
 */
export function videoFrameRange(fightMs: number, speed: number, fps: number, range?: { fromMs: number; toMs: number } | null): { firstFrame: number; frameCount: number } {
  const videoMs = droneVideoDurationMs(fightMs, speed);
  const firstFrame = range ? Math.max(0, Math.round((range.fromMs * fps) / 1000)) : 0;
  const lastFrame = Math.round((Math.min(videoMs, range?.toMs ?? videoMs) * fps) / 1000);
  return { firstFrame, frameCount: Math.max(1, lastFrame - firstFrame + 1) };
}

/** The orbit's compass direction `ms` into the video. */
export function droneYawAt(track: Pick<DroneTrack, "startYaw">, ms: number): number {
  return track.startYaw + (2 * Math.PI * ms) / DRONE_ORBIT_PERIOD_MS;
}

// Each value replaced by the mean / max / min of those within `half` samples.
function windowed(values: readonly number[], half: number, reduce: "mean" | "max" | "min"): number[] {
  const out = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length - 1, i + half);
    let acc = reduce === "mean" ? 0 : values[from]!;
    for (let j = from; j <= to; j++) {
      const value = values[j]!;
      if (reduce === "mean") acc += value;
      else if (reduce === "max") acc = Math.max(acc, value);
      else acc = Math.min(acc, value);
    }
    out[i] = reduce === "mean" ? acc / (to - from + 1) : acc;
  }
  return out;
}

// A window of maxima, then a mean of the same width: smooth, and never below
// the raw value (each mean only averages maxima that already cover it).
function smoothCeiling(values: readonly number[], half: number): number[] {
  return windowed(windowed(values, half, "max"), half, "mean");
}

function smoothFloor(values: readonly number[], half: number): number[] {
  return windowed(windowed(values, half, "min"), half, "mean");
}

/**
 * Samples the framing over the whole fight and smooths it over replay time.
 * Null when nobody is ever on screen to frame.
 */
export function buildDroneTrack(options: DroneTrackOptions): DroneTrack | null {
  const { durationMs, unitsAt, scale, aspect, probe = null, startYaw = Math.PI / 4, speed = 1 } = options;
  const sampleMs = options.sampleMs ?? DRONE_SAMPLE_MS;
  const fovDeg = options.verticalFovDeg ?? DRONE_FOV_DEG;
  const count = Math.max(1, Math.ceil(Math.max(0, durationMs) / sampleMs) + 1);

  // 1. The Director's framing at each sample; the framed units' positions kept
  // so the cover radius can be measured from the smoothed centre.
  const rawX: number[] = [];
  const rawZ: number[] = [];
  const framed: { x: number; z: number }[][] = [];
  let inFrame = new Set<string>();
  for (let i = 0; i < count; i++) {
    // A dead boss stays in the shot: the end holds on the kill.
    const units = unitsAt(Math.min(durationMs, i * sampleMs)).map((unit) => unit.boss && unit.dead ? { ...unit, dead: false } : unit);
    const frame = directorFrame(units, inFrame, {
      stragglerCutoff: STRAGGLER_CUTOFF_YARDS * scale,
      stragglerRelease: STRAGGLER_RELEASE_YARDS * scale,
      bossEngageDistance: BOSS_ENGAGE_YARDS * scale,
    });
    if (!frame) {
      rawX.push(Number.NaN);
      rawZ.push(Number.NaN);
      framed.push([]);
      continue;
    }
    inFrame = new Set(frame.guids);
    rawX.push(frame.x);
    rawZ.push(frame.z);
    framed.push(units.filter((unit) => inFrame.has(unit.guid)).map((unit) => ({ x: unit.x, z: unit.z })));
  }
  // Gaps (nobody to frame) hold the nearest framing on either side.
  const firstValid = rawX.findIndex((value) => !Number.isNaN(value));
  if (firstValid < 0) return null;
  for (let i = 0; i < count; i++) {
    if (!Number.isNaN(rawX[i]!)) continue;
    const from = i < firstValid ? firstValid : i - 1;
    rawX[i] = rawX[from]!;
    rawZ[i] = rawZ[from]!;
    framed[i] = framed[from]!;
  }

  // 2. The centre: a moving average over replay time.
  // The windows are video time: `speed` times as much fight per window.
  const centreHalf = Math.round((DRONE_CENTRE_WINDOW_MS * speed) / sampleMs);
  const xs = windowed(rawX, centreHalf, "mean");
  const zs = windowed(rawZ, centreHalf, "mean");

  // 3. The radius that covers everyone framed, from the smoothed centre, as a
  // smooth ceiling so nobody framed slips out while the centre lags.
  const minRadius = MIN_FRAME_RADIUS_YARDS * scale;
  const cover = framed.map((points, i) => points.reduce((radius, point) => Math.max(radius, Math.hypot(point.x - xs[i]!, point.z - zs[i]!)), minRadius));
  const radii = smoothCeiling(cover, Math.round((DRONE_RADIUS_WINDOW_MS * speed) / sampleMs));

  // 4. The distance that fits it in the 16:9 frame, and (with the mesh) the
  // lowest clear elevation, smoothed so the climb over a wall is gradual.
  const fitted = radii.map((radius) => frameDistance(radius, {
    verticalFov: (fovDeg * Math.PI) / 180,
    aspect,
    elevationDeg: CINEMATIC_ELEVATION_DEG,
    scale,
  }));
  const elevations: number[] = [];
  const distances: number[] = [];
  for (let i = 0; i < count; i++) {
    // The orbit turns in video time.
    const yaw = droneYawAt({ startYaw }, (i * sampleMs) / speed);
    const shot = probe ? probe.clearShot(xs[i]!, zs[i]!, fitted[i]!, yaw, i * sampleMs) : null;
    elevations.push(shot?.elevation ?? CINEMATIC_ELEVATION_DEG);
    distances.push(shot?.distance ?? fitted[i]!);
  }
  const elevationHalf = Math.round((DRONE_ELEVATION_WINDOW_MS * speed) / sampleMs);
  const smoothElevations = smoothCeiling(elevations, elevationHalf);
  const smoothDistances = smoothFloor(distances, elevationHalf);
  const ys = windowed(probe ? xs.map((x, i) => probe.floorAt(x, zs[i]!)) : xs.map(() => 0), elevationHalf, "mean");

  const keys = xs.map((x, i): DroneKey => ({ x, y: ys[i]!, z: zs[i]!, radius: radii[i]!, distance: smoothDistances[i]!, elevationDeg: smoothElevations[i]! }));
  const overview = {
    x: keys.reduce((sum, key) => sum + key.x, 0) / keys.length,
    y: keys.reduce((sum, key) => sum + key.y, 0) / keys.length,
    z: keys.reduce((sum, key) => sum + key.z, 0) / keys.length,
  };
  return { durationMs: Math.max(0, durationMs), speed, sampleMs, startYaw, fovDeg, keys, overview };
}

// Catmull-Rom through the keys around `ms` (clamped to the track).
function keyAt(track: DroneTrack, ms: number): DroneKey {
  const { keys, sampleMs } = track;
  const at = Math.min(Math.max(0, ms), track.durationMs) / sampleMs;
  const index = Math.min(keys.length - 1, Math.floor(at));
  const t = at - index;
  const p0 = keys[Math.max(0, index - 1)]!;
  const p1 = keys[index]!;
  const p2 = keys[Math.min(keys.length - 1, index + 1)]!;
  const p3 = keys[Math.min(keys.length - 1, index + 2)]!;
  const spline = (a: number, b: number, c: number, d: number) =>
    b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  return {
    x: spline(p0.x, p1.x, p2.x, p3.x),
    y: spline(p0.y, p1.y, p2.y, p3.y),
    z: spline(p0.z, p1.z, p2.z, p3.z),
    radius: spline(p0.radius, p1.radius, p2.radius, p3.radius),
    distance: spline(p0.distance, p1.distance, p2.distance, p3.distance),
    elevationDeg: spline(p0.elevationDeg, p1.elevationDeg, p2.elevationDeg, p3.elevationDeg),
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/**
 * The drone's camera `ms` into the video: the intro for the first
 * DRONE_INTRO_MS, then the orbit. Past the fight's end the framing holds and
 * the orbit keeps turning. The framing follows the fight at the track's
 * speed; the intro and the orbit run in video time.
 */
export function dronePoseAt(track: DroneTrack, ms: number): MapCameraPose {
  const key = keyAt(track, ms * track.speed);
  let { x, y, z, distance, elevationDeg } = key;
  let yaw = droneYawAt(track, ms);
  if (ms < DRONE_INTRO_MS) {
    const eased = easeInOutCubic(Math.max(0, ms) / DRONE_INTRO_MS);
    x = lerp(track.overview.x, x, eased);
    y = lerp(track.overview.y, y, eased);
    z = lerp(track.overview.z, z, eased);
    // Distance eases in log space so the descent reads as one even motion.
    distance = Math.exp(lerp(Math.log(distance * DRONE_INTRO_DISTANCE_FACTOR), Math.log(distance), eased));
    elevationDeg = lerp(DRONE_INTRO_ELEVATION_DEG, elevationDeg, eased);
    yaw = lerp(yaw + DRONE_INTRO_YAW_OFFSET, yaw, eased);
  }
  // As the Director: aim a little past the fight so it sits below the centre line.
  const ahead = AIM_AHEAD_FRACTION * key.radius;
  const aimX = x - Math.sin(yaw) * ahead;
  const aimZ = z - Math.cos(yaw) * ahead;
  const elevation = (elevationDeg * Math.PI) / 180;
  return {
    target: [aimX, y, aimZ],
    position: [
      aimX + Math.sin(yaw) * Math.cos(elevation) * distance,
      y + Math.sin(elevation) * distance,
      aimZ + Math.cos(yaw) * Math.cos(elevation) * distance,
    ],
    fov: track.fovDeg,
  };
}
