import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { MAX_CINEMATIC_ELEVATION_DEG } from "./cameraDirector";
import { MIN_DOUBLE_CLICK_DISTANCE_YARDS } from "./controlProfile";
import { DirectorRig } from "./directorRig";
import type { DungeonWorld } from "./dungeonWorld";
import { cameraAngles, cameraOffset } from "./mapControls";
import type { UnitLayer } from "./unitLayer";

const START = { x: 10, z: 10, yaw: 0.5, pitchDeg: 40, distance: 30 };

function setup(blocks: (from: THREE.Vector3, to: THREE.Vector3) => boolean = () => false) {
  const camera = new THREE.PerspectiveCamera(45, 4 / 3);
  const target = new THREE.Vector3(START.x, 0, START.z);
  const offset = cameraOffset(START.yaw, (START.pitchDeg * Math.PI) / 180, START.distance);
  camera.position.set(target.x + offset.x, offset.y, target.z + offset.z);
  const unit = (x: number, z: number, kind: string) => ({ base: new THREE.Vector3(x, 0, z), kind, dead: false, health: null });
  const units = new Map([
    ["boss", unit(0, 0, "hostile")],
    ["p1", unit(4, 0, "player")],
  ]);
  const world = {
    dungeonMesh: { scale: 1 },
    floorHeights: { heightAt: () => 0 },
    meshBlocks: blocks,
    meshHitDistance: () => null,
    sampleFloor: () => 0,
  } as unknown as DungeonWorld;
  const placed: { x: number; z: number; distance: number; elevationDeg: number; yaw: number }[] = [];
  const angles = () => cameraAngles(camera.position.clone().sub(target), 1e-6);
  const rig = new DirectorRig({
    camera,
    controls: () => ({ target }),
    world,
    unitLayer: () => ({ units, floorTracks: null, probeCeiling: () => undefined }) as unknown as Pick<UnitLayer, "units" | "floorTracks" | "probeCeiling">,
    effects: () => ({ clock: { ms: 0, at: 0, playing: false, speed: 1 }, replayNow: () => 0 }),
    director: () => ({ bossGuids: new Set(["boss"]) }),
    subject: () => null,
    aspect: () => 1,
    now: () => 0,
    disposed: () => false,
    directing: () => true,
    pivotFloor: () => 0,
    cameraCeiling: () => undefined,
    cameraYaw: () => angles().yaw,
    cameraElevationDeg: () => (angles().pitch * 180) / Math.PI,
    place: (x, z, distance, elevationDeg, yaw) => placed.push({ x, z, distance, elevationDeg, yaw }),
    requestRender: () => {},
  });
  return { rig, placed };
}

describe("DirectorRig: taking the camera", () => {
  it("springs from the pose the camera had: the first frame after a hand-back barely moves it", () => {
    const { rig, placed } = setup();
    expect(rig.owner).toBe("director");
    rig.engage(false);
    expect(rig.update(1_000)).toBe(true);
    const [first] = placed;
    expect(Math.hypot(first!.x - START.x, first!.z - START.z)).toBeLessThan(0.1);
    expect(first!.distance).toBeCloseTo(START.distance, 0);
    expect(first!.elevationDeg).toBeCloseTo(START.pitchDeg, 0);
    // Without a follow track it keeps the yaw the camera had.
    expect(first!.yaw).toBeCloseTo(START.yaw, 9);
  });

  it("a snap puts the first shot straight on the fight, and the frame after holds it", () => {
    const { rig, placed } = setup();
    rig.engage(true);
    expect(rig.update(1_000)).toBe(false);
    expect(Math.hypot(placed[0]!.x - START.x, placed[0]!.z - START.z)).toBeGreaterThan(5);
    rig.update(1_016);
    expect(placed[1]!.x).toBeCloseTo(placed[0]!.x, 3);
  });

  it("turning it off drops a pending snap; a re-engage while it runs re-seeds nothing", () => {
    const { rig, placed } = setup();
    rig.engage(true);
    rig.off();
    rig.engage(false);
    rig.update(1_000);
    expect(Math.hypot(placed[0]!.x - START.x, placed[0]!.z - START.z)).toBeLessThan(0.1);
    rig.update(1_500);
    const moved = placed[1]!;
    rig.engage(false);
    rig.update(1_516);
    // Still springing on from where it got to, not re-seeded from the camera (which the stub never moved).
    expect(Math.hypot(placed[2]!.x - moved.x, placed[2]!.z - moved.z)).toBeLessThan(Math.hypot(moved.x - START.x, moved.z - START.z));
  });

  it("only a new follow source is taken", () => {
    const { rig } = setup();
    const source = { key: "a", startMs: 0, endMs: 1_000, unitsAt: () => [] };
    expect(rig.setFollowSource(source)).toBe(true);
    expect(rig.setFollowSource(source)).toBe(false);
    expect(rig.followSource).toBe(source);
    expect(rig.setFollowSource(null)).toBe(true);
  });
});

describe("DirectorRig: collision", () => {
  it("a wall found by last frame's ray eases the camera in over a few frames, not in one", () => {
    const { rig, placed } = setup();
    rig.engage(false);
    rig.update(1_000);
    expect(rig.want).toBeCloseTo(placed[0]!.distance, 9);
    // MapScene3D's collision pass, after the frame's camera was placed.
    rig.allowed = 10;
    rig.update(1_016);
    const eased = placed[1]!.distance;
    expect(eased).toBeLessThan(placed[0]!.distance);
    expect(eased).toBeGreaterThan(10);
  });
});

describe("DirectorRig: the drone's line of sight", () => {
  it("climbs past blocked elevations, and comes in closer only when even the highest is blocked", () => {
    const climbing = setup((_from, to) => to.y < 20);
    const shot = climbing.rig.droneClearShot(0, 0, 40, 0);
    expect(shot.distance).toBe(40);
    expect(Math.sin((shot.elevation * Math.PI) / 180) * 40).toBeGreaterThanOrEqual(20);
    const walled = setup(() => true);
    expect(walled.rig.droneClearShot(0, 0, 40, 0)).toEqual({ elevation: MAX_CINEMATIC_ELEVATION_DEG, distance: 30 });
    expect(walled.rig.droneClearShot(0, 0, 1, 0).distance).toBe(MIN_DOUBLE_CLICK_DISTANCE_YARDS);
  });
});
