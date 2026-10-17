/**
 * The cinematic camera's framing rule ("the Director") for the 3D replay on a
 * dungeon mesh: which units have to stay on screen, the circle the camera has
 * to cover, and the critically damped spring that moves it there.
 *
 * Pure maths only — no three.js, no DOM. MapScene3D feeds it unit positions in
 * scene units and applies the result to the camera.
 */

/** The shot's elevation above the horizon: a low 3/4 view, not the old near-top-down. */
export const CINEMATIC_ELEVATION_DEG = 28;
/** How high the Director climbs when the mesh blocks the view of the fight. */
export const MAX_CINEMATIC_ELEVATION_DEG = 50;
/** The step it climbs in while looking for an unblocked line to the fight. */
export const CINEMATIC_ELEVATION_STEP_DEG = 5;
/** A player further than this (yards) from the boss is a straggler, left out of the frame. */
export const STRAGGLER_CUTOFF_YARDS = 30;
/** A player already in frame is only dropped past this, so nobody flickers in and out. */
export const STRAGGLER_RELEASE_YARDS = 34;
/**
 * A boss further than this from the group is not the fight the camera is on
 * (another room's boss during a whole-run replay), so the group is framed alone.
 */
export const BOSS_ENGAGE_YARDS = 40;
/** At least this fraction of the alive players stays in frame, stragglers or not (the 3/5 rule). */
export const MIN_GROUP_FRACTION = 0.6;
/** The frame never tightens below this radius (yards), so one unit is not a close-up. */
export const MIN_FRAME_RADIUS_YARDS = 8;
/** Camera distance limits (yards). */
export const MIN_FRAME_DISTANCE_YARDS = 12;
export const MAX_FRAME_DISTANCE_YARDS = 60;
/** Headroom the fit leaves around the framed circle. */
export const FRAME_FILL = 1.15;
/**
 * The aim point sits this fraction of the radius past the circle's centre,
 * away from the camera. Ground nearer the camera projects lower on screen, so
 * aiming beyond the fight drops it under the centre line and leaves the
 * background above it, as in the reference shot.
 */
export const AIM_AHEAD_FRACTION = 0.1;
/** Spring smoothing times (seconds). */
export const TARGET_SMOOTH_SECONDS = 0.6;
export const DISTANCE_SMOOTH_SECONDS = 0.9;
/** The goal distance only moves once the fit needs more than this relative change. */
export const DISTANCE_DEAD_ZONE = 0.15;
/** The goal aim point only moves once the framing centre drifts this far (fraction of the radius). */
export const TARGET_DEAD_ZONE_FRACTION = 0.15;

/** A unit as the Director sees it: a position on the floor plane and what it is. */
export interface DirectorUnit {
  guid: string;
  /** Scene-plane position; the caller's units (yards by default in tests). */
  x: number;
  z: number;
  player: boolean;
  boss: boolean;
  dead: boolean;
}

/** The circle the camera has to cover, and who is inside it. */
export interface DirectorFrame {
  x: number;
  z: number;
  radius: number;
  /** The units the frame is built from, boss included. */
  guids: string[];
}

export interface DirectorFrameOptions {
  /** Distance from the boss a player joins the frame at (same units as the positions). */
  stragglerCutoff?: number;
  /** Distance a player already in frame is dropped at; above `stragglerCutoff`. */
  stragglerRelease?: number;
  /** The least fraction of alive players that stays framed. */
  minGroupFraction?: number;
  /** How far from the group a boss still counts as the fight being watched. */
  bossEngageDistance?: number;
  /** Frame this unit alone (a double-clicked unit), ignoring the group rule. */
  subjectGuid?: string | null;
}

function distance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/**
 * An approximate minimum enclosing circle (Ritter): two passes, deterministic,
 * and tight enough for framing. The mean of the points pulls toward a clump
 * and would crop the boss, so the bounding circle is used instead.
 */
function boundingCircle(points: readonly DirectorUnit[]): { x: number; z: number; radius: number } {
  const first = points[0];
  let far = first;
  for (const point of points) {
    if (distance(first.x, first.z, point.x, point.z) > distance(first.x, first.z, far.x, far.z)) far = point;
  }
  let opposite = far;
  for (const point of points) {
    if (distance(far.x, far.z, point.x, point.z) > distance(far.x, far.z, opposite.x, opposite.z)) opposite = point;
  }
  let x = (far.x + opposite.x) / 2;
  let z = (far.z + opposite.z) / 2;
  let radius = distance(far.x, far.z, opposite.x, opposite.z) / 2;
  for (const point of points) {
    const away = distance(x, z, point.x, point.z);
    if (away <= radius) continue;
    const grown = (radius + away) / 2;
    const shift = (away - radius) / 2 / away;
    x += (point.x - x) * shift;
    z += (point.z - z) * shift;
    radius = grown;
  }
  return { x, z, radius };
}

/**
 * The circle to frame: the boss nearest the group plus every alive player
 * within the straggler cutoff of it, topped up to `minGroupFraction` of the
 * alive players (nearest the boss first) when the stragglers thin it out.
 * `inFrame` is the previous result's `guids`, which widens the cutoff for
 * those already shown. Null with nobody alive to frame.
 */
export function directorFrame(
  units: readonly DirectorUnit[],
  inFrame: ReadonlySet<string> = new Set(),
  options: DirectorFrameOptions = {},
): DirectorFrame | null {
  const {
    stragglerCutoff = STRAGGLER_CUTOFF_YARDS,
    stragglerRelease = STRAGGLER_RELEASE_YARDS,
    minGroupFraction = MIN_GROUP_FRACTION,
    bossEngageDistance = BOSS_ENGAGE_YARDS,
    subjectGuid = null,
  } = options;

  if (subjectGuid) {
    const subject = units.find((unit) => unit.guid === subjectGuid);
    if (subject) return { x: subject.x, z: subject.z, radius: 0, guids: [subject.guid] };
  }

  const alive = units.filter((unit) => !unit.dead);
  const players = alive.filter((unit) => unit.player);
  const bosses = alive.filter((unit) => unit.boss);
  if (players.length === 0) {
    if (bosses.length === 0) return null;
    const circle = boundingCircle(bosses);
    return { ...circle, guids: bosses.map((unit) => unit.guid) };
  }

  // Several bosses up: the one the group is fighting is the one nearest it.
  const centre = boundingCircle(players);
  const nearest = bosses.length === 0 ? null : bosses.reduce((best, candidate) =>
    distance(centre.x, centre.z, candidate.x, candidate.z) < distance(centre.x, centre.z, best.x, best.z) ? candidate : best);
  // A boss standing in another room is not this shot (whole-run replays walk
  // past plenty of them); the group is framed on its own.
  const boss = nearest && distance(centre.x, centre.z, nearest.x, nearest.z) <= bossEngageDistance + centre.radius
    ? nearest
    : null;

  // The players within the straggler cutoff of `anchor` (the release distance
  // for those already shown), topped up to `minGroupFraction` of the alive
  // players, nearest first.
  const framedAround = (anchor: { x: number; z: number }): DirectorUnit[] => {
    const byDistance = [...players].sort((left, right) =>
      distance(anchor.x, anchor.z, left.x, left.z) - distance(anchor.x, anchor.z, right.x, right.z));
    const near = byDistance.filter((player) =>
      distance(anchor.x, anchor.z, player.x, player.z) <= (inFrame.has(player.guid) ? stragglerRelease : stragglerCutoff));
    const required = Math.ceil(minGroupFraction * players.length);
    return near.length >= required ? near : byDistance.slice(0, required);
  };

  // No boss in sight: the group is the shot, measured from its median point so
  // a straggler (a ghost running back across a terrain map) is left out as in
  // a boss fight instead of pulling the frame off the group.
  if (!boss) {
    const framed = framedAround({ x: median(players.map((unit) => unit.x)), z: median(players.map((unit) => unit.z)) });
    return { ...boundingCircle(framed), guids: framed.map((player) => player.guid) };
  }

  const framed = framedAround(boss);
  const circle = boundingCircle([boss, ...framed]);
  return { ...circle, guids: [boss.guid, ...framed.map((player) => player.guid)] };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export interface FrameDistanceOptions {
  /** The camera's vertical field of view, in radians. */
  verticalFov: number;
  /** Viewport width / height. */
  aspect: number;
  /** The shot's elevation above the horizon, in degrees. */
  elevationDeg: number;
  /** Scene units per yard, which the yard constants are measured in. */
  scale?: number;
}

/**
 * How far the camera has to sit to hold a circle of `radius` on the ground in
 * frame, with headroom, clamped to the shot's limits.
 *
 * A low shot sees the ground nearly edge-on, so the circle projects to a
 * squashed ellipse and the first thing to fall out of frame is its near edge,
 * off the bottom. Fitting the circle as if it faced the camera (radius /
 * sin(fov/2)) therefore stands a long way further back than it needs to, which
 * is what made the old framing distant. The near edge leaves the frame when it
 * sits `elevation + fov/2` below the camera, which solves for the distance
 * below; the sideways fit is the ordinary horizontal one.
 */
export function frameDistance(radius: number, options: FrameDistanceOptions): number {
  const { verticalFov, aspect, elevationDeg, scale = 1 } = options;
  const fit = Math.max(radius, MIN_FRAME_RADIUS_YARDS * scale);
  const halfVertical = verticalFov / 2;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * Math.max(1e-3, aspect));
  const elevation = (elevationDeg * Math.PI) / 180;
  const near = Math.tan(elevation + halfVertical);
  const denominator = near * Math.cos(elevation) - Math.sin(elevation);
  // Looking down steeply the ground no longer runs off the bottom of frame;
  // the circle then fits as a flat disc facing the camera.
  const vertical = near > 0 && denominator > 1e-6 ? (fit * near) / denominator : fit / Math.tan(halfVertical);
  const horizontal = fit / Math.tan(halfHorizontal);
  const fitted = Math.max(vertical, horizontal) * FRAME_FILL;
  return Math.min(MAX_FRAME_DISTANCE_YARDS * scale, Math.max(MIN_FRAME_DISTANCE_YARDS * scale, fitted));
}

/** A value the Director springs toward a goal; `velocity` carries between frames. */
export interface DampedValue {
  value: number;
  velocity: number;
}

/** Places a damped value at a goal without carrying momentum into later frames. */
export function snapDampedValue(state: DampedValue, goal: number): number {
  state.value = goal;
  state.velocity = 0;
  return goal;
}

/**
 * One step of a critically damped spring (the standard smoothDamp): `value`
 * reaches `goal` in about `smoothTime` seconds with no overshoot and no jump,
 * whatever the frame rate. Mutates and returns the new value.
 */
export function smoothDamp(state: DampedValue, goal: number, smoothTime: number, dt: number): number {
  if (dt <= 0) return state.value;
  if (smoothTime <= 0) {
    state.velocity = 0;
    state.value = goal;
    return goal;
  }
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.value - goal;
  const temp = (state.velocity + omega * change) * dt;
  state.velocity = (state.velocity - omega * temp) * decay;
  let next = goal + (change + temp) * decay;
  // Never spring past the goal (a long frame can overshoot otherwise).
  if ((change < 0) === (next > goal)) {
    next = goal;
    state.velocity = 0;
  }
  state.value = next;
  return next;
}

/** Whether a new fit is far enough from the standing goal to move it (the dead zones). */
export function exceedsDeadZone(current: number, next: number, fraction: number): boolean {
  return Math.abs(next - current) > fraction * Math.max(1e-6, Math.abs(current));
}
