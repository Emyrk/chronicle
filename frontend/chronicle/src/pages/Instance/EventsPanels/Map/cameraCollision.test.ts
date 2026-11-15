import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CameraCollision } from "./cameraCollision";
import { FIRST_FRAME_STEP_S, FREE_CAM_COLLISION_PADDING_SCENE_UNITS } from "./controlProfile";
import type { DungeonWorld } from "./dungeonWorld";

// A wall `wall` scene units out from the cast origin (null: none), and a floor at y = 0.
function setup(wall: { at: number | null }) {
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3(0, 0, 0);
  camera.position.set(0, 0, 20);
  const world = {
    dungeonMesh: { scale: 1 },
    meshHitDistance: (from: THREE.Vector3, to: THREE.Vector3) => (wall.at !== null && wall.at < from.distanceTo(to) ? wall.at : null),
    castFloor: () => 0,
  } as unknown as DungeonWorld;
  const collision = new CameraCollision({ camera, controls: () => ({ target, minDistance: 1 }), world });
  return { collision, camera, target };
}

describe("CameraCollision: the free cam's policy", () => {
  it("a wall pulls the camera in at once; once gone, it eases back out to the distance chosen", () => {
    const wall = { at: 10 as number | null };
    const { collision, camera, target } = setup(wall);
    collision.orbit(FIRST_FRAME_STEP_S, 20, null);
    collision.shown(camera.position.distanceTo(target));
    const pulled = camera.position.distanceTo(target);
    expect(pulled).toBeLessThan(10);
    expect(collision.wantDistance).toBe(20);
    wall.at = null;
    expect(collision.orbit(FIRST_FRAME_STEP_S, pulled, null)).toBe(true);
    const easing = camera.position.distanceTo(target);
    expect(easing).toBeGreaterThan(pulled);
    expect(easing).toBeLessThan(20);
  });
});

describe("CameraCollision: the Director's policy", () => {
  it("only measures: what the ray allows goes to the Director, and the camera stays put this frame", () => {
    const { collision, camera, target } = setup({ at: 10 });
    const director = { want: 20, allowed: null as number | null };
    expect(collision.orbit(FIRST_FRAME_STEP_S, 20, director)).toBe(false);
    expect(camera.position.distanceTo(target)).toBe(20);
    expect(director.allowed).toBeCloseTo(10 - FREE_CAM_COLLISION_PADDING_SCENE_UNITS, 9);
    // Before its first step (no distance wanted yet) the free cam's policy applies.
    collision.orbit(FIRST_FRAME_STEP_S, 20, { want: null, allowed: null });
    expect(camera.position.distanceTo(target)).toBeLessThan(10);
  });
});

describe("CameraCollision: the floor clamp and the clock", () => {
  it("lifts a camera below the floor beneath it, and leaves one above it", () => {
    const { collision } = setup({ at: null });
    const low = new THREE.Vector3(0, -1, 0);
    expect(collision.clampAboveFloor(low)).toBe(true);
    expect(low.y).toBeCloseTo(0.3, 9);
    expect(collision.clampAboveFloor(new THREE.Vector3(0, 5, 0))).toBe(false);
  });

  it("steps from the last frame it eased in, and takes no step on the first frame after a rest", () => {
    const { collision } = setup({ at: null });
    expect(collision.step(1_000)).toBe(0);
    expect(collision.step(1_050)).toBeCloseTo(0.05, 9);
    collision.rest();
    expect(collision.step(9_000)).toBe(0);
  });
});
