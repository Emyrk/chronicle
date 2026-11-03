import { describe, expect, it } from "vitest";
import type { DirectorUnit } from "./cameraDirector";
import { CINEMATIC_ELEVATION_DEG } from "./cameraDirector";
import {
  buildDroneTrack,
  DRONE_END_HOLD_MS,
  DRONE_INTRO_ELEVATION_DEG,
  DRONE_INTRO_MS,
  DRONE_ORBIT_PERIOD_MS,
  dronePoseAt,
  droneVideoDurationMs,
  type DroneTrackOptions,
} from "./droneCamera";
import type { MapCameraPose } from "./cameraPath";

const ASPECT = 16 / 9;

function unit(guid: string, x: number, z: number, extra: Partial<DirectorUnit> = {}): DirectorUnit {
  return { guid, x, z, player: true, boss: false, dead: false, ...extra };
}

// A boss walking east at 1 yd/s with five players around it; one dies at 20 s.
function walkingFight(ms: number): DirectorUnit[] {
  const bx = ms / 1000;
  return [
    unit("boss", bx, 0, { player: false, boss: true }),
    unit("a", bx + 4, 0),
    unit("b", bx - 4, 0),
    unit("c", bx, 4),
    unit("d", bx, -4),
    unit("e", bx + 10, 6, { dead: ms >= 20_000 }),
  ];
}

const options = (extra: Partial<DroneTrackOptions> = {}): DroneTrackOptions => ({
  durationMs: 40_000,
  unitsAt: walkingFight,
  scale: 1,
  aspect: ASPECT,
  ...extra,
});

function elevationDeg(pose: MapCameraPose): number {
  const dx = pose.position[0] - pose.target[0];
  const dy = pose.position[1] - pose.target[1];
  const dz = pose.position[2] - pose.target[2];
  return (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
}

function distance(pose: MapCameraPose): number {
  return Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
}

function yaw(pose: MapCameraPose): number {
  return Math.atan2(pose.position[0] - pose.target[0], pose.position[2] - pose.target[2]);
}

// Whether a ground point is inside the camera's view (pinhole projection).
function inView(pose: MapCameraPose, point: [number, number, number], fovDeg = 45, aspect = ASPECT): boolean {
  const [px, py, pz] = pose.position;
  const forward = [pose.target[0] - px, pose.target[1] - py, pose.target[2] - pz];
  const fl = Math.hypot(...forward);
  const f = forward.map((v) => v / fl);
  // right = f x up(0,1,0); up' = right x f
  const r = [-f[2]!, 0, f[0]!];
  const rl = Math.hypot(...r);
  const right = r.map((v) => v / rl);
  const up = [right[1]! * f[2]! - right[2]! * f[1]!, right[2]! * f[0]! - right[0]! * f[2]!, right[0]! * f[1]! - right[1]! * f[0]!];
  const d = [point[0] - px, point[1] - py, point[2] - pz];
  const depth = d[0]! * f[0]! + d[1]! * f[1]! + d[2]! * f[2]!;
  if (depth <= 0) return false;
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const sx = (d[0]! * right[0]! + d[1]! * right[1]! + d[2]! * right[2]!) / (depth * tanV * aspect);
  const sy = (d[0]! * up[0]! + d[1]! * up[1]! + d[2]! * up[2]!) / (depth * tanV);
  return Math.abs(sx) <= 1 && Math.abs(sy) <= 1;
}

describe("dronePoseAt", () => {
  it("is a pure function of time: rebuilding and resampling gives identical poses", () => {
    const first = buildDroneTrack(options())!;
    const second = buildDroneTrack(options())!;
    for (const ms of [0, 1_234.5, 3_500, 17_000, 39_999, 41_500]) {
      expect(dronePoseAt(second, ms)).toEqual(dronePoseAt(first, ms));
    }
  });

  it("does not depend on the frame rate it is sampled at", () => {
    const track = buildDroneTrack(options())!;
    // The pose at 10 s is the same whether reached at 24, 30 or 60 fps.
    const at30 = dronePoseAt(track, (300 * 1000) / 30);
    const at60 = dronePoseAt(track, (600 * 1000) / 60);
    const at24 = dronePoseAt(track, (240 * 1000) / 24);
    expect(at60).toEqual(at30);
    expect(at24).toEqual(at30);
  });

  it("starts high and wide, and eases down to the cinematic elevation", () => {
    const track = buildDroneTrack(options())!;
    const start = dronePoseAt(track, 0);
    const settled = dronePoseAt(track, DRONE_INTRO_MS);
    expect(elevationDeg(start)).toBeCloseTo(DRONE_INTRO_ELEVATION_DEG, 3);
    expect(elevationDeg(settled)).toBeCloseTo(CINEMATIC_ELEVATION_DEG, 3);
    expect(distance(start)).toBeGreaterThan(2 * distance(settled));
    // Monotonic descent through the intro.
    let last = Number.POSITIVE_INFINITY;
    for (let ms = 0; ms <= DRONE_INTRO_MS; ms += 100) {
      const elevation = elevationDeg(dronePoseAt(track, ms));
      expect(elevation).toBeLessThanOrEqual(last + 1e-9);
      last = elevation;
    }
  });

  it("orbits at a slow constant rate after the intro", () => {
    const track = buildDroneTrack(options())!;
    const step = 1_000;
    const expected = (2 * Math.PI * step) / DRONE_ORBIT_PERIOD_MS;
    for (let ms = DRONE_INTRO_MS; ms < 30_000; ms += step) {
      let turned = yaw(dronePoseAt(track, ms + step)) - yaw(dronePoseAt(track, ms));
      if (turned < -Math.PI) turned += 2 * Math.PI;
      expect(turned).toBeCloseTo(expected, 6);
    }
  });

  it("keeps the boss and the framed raid in view as the fight moves", () => {
    const track = buildDroneTrack(options())!;
    for (let ms = DRONE_INTRO_MS; ms <= 40_000; ms += 500) {
      const pose = dronePoseAt(track, ms);
      const units = walkingFight(ms);
      for (const framed of units.filter((u) => !u.dead && u.guid !== "e")) {
        expect(inView(pose, [framed.x, 0, framed.z]), `${framed.guid} at ${ms}`).toBe(true);
      }
    }
  });

  it("moves smoothly: no jumps between consecutive 30 fps frames", () => {
    const track = buildDroneTrack(options())!;
    let previous = dronePoseAt(track, 0);
    for (let frame = 1; frame <= 40 * 30; frame++) {
      const pose = dronePoseAt(track, (frame * 1000) / 30);
      const moved = Math.hypot(...pose.position.map((v, i) => v - previous.position[i]!));
      expect(moved).toBeLessThan(1.5);
      previous = pose;
    }
  });

  it("tightens gradually when a player dies instead of snapping", () => {
    const track = buildDroneTrack(options())!;
    const before = distance(dronePoseAt(track, 15_000));
    const after = distance(dronePoseAt(track, 30_000));
    expect(after).toBeLessThan(before);
    for (let ms = 18_000; ms < 24_000; ms += 1000 / 30) {
      expect(Math.abs(distance(dronePoseAt(track, ms + 1000 / 30)) - distance(dronePoseAt(track, ms)))).toBeLessThan(0.2);
    }
  });

  it("keeps a dead boss framed and holds on the end", () => {
    const fight = (ms: number) => walkingFight(Math.min(ms, 10_000)).map((u) => u.boss ? { ...u, dead: ms >= 10_000 } : u);
    const track = buildDroneTrack(options({ durationMs: 10_000, unitsAt: fight }))!;
    const end = dronePoseAt(track, 10_000);
    const held = dronePoseAt(track, 10_000 + DRONE_END_HOLD_MS);
    expect(inView(held, [10, 0, 0])).toBe(true);
    expect(held.target[0]).toBeCloseTo(end.target[0], 0);
    expect(droneVideoDurationMs(10_000)).toBe(10_000 + DRONE_END_HOLD_MS);
  });

  it("climbs gradually when the probe reports a blocked shot", () => {
    // Blocked from 20 s to 25 s at the low elevation.
    const track = buildDroneTrack(options({
      probe: {
        floorAt: () => 2,
        clearShot: (_x, _z, d, _yaw, ms) => ({ elevation: ms >= 20_000 && ms < 25_000 ? 50 : CINEMATIC_ELEVATION_DEG, distance: d }),
      },
    }))!;
    expect(elevationDeg(dronePoseAt(track, 22_000))).toBeCloseTo(50, 0);
    expect(elevationDeg(dronePoseAt(track, 10_000))).toBeCloseTo(CINEMATIC_ELEVATION_DEG, 3);
    // Already climbing before the wall, never a step change.
    expect(elevationDeg(dronePoseAt(track, 19_000))).toBeGreaterThan(CINEMATIC_ELEVATION_DEG + 1);
    expect(dronePoseAt(track, 10_000).target[1]).toBeCloseTo(2, 6);
  });

  it("is null when there is never anyone to frame", () => {
    expect(buildDroneTrack(options({ unitsAt: () => [] }))).toBeNull();
  });
});
