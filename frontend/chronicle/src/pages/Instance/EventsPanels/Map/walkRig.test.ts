import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  LOOK_RADIANS_PER_PX,
  WALK_CAMERA_FOLLOW_RATE_PER_S,
  WALK_CAMERA_TURN_FOLLOW_RATE_PER_S,
  WALK_EYE_YARDS,
  WALK_FIRST_PERSON_EXIT_YARDS,
  WALK_MAX_DISTANCE_YARDS,
  WALK_PITCH_LIMIT_RADIANS,
} from "./controlProfile";
import { createInputFrame, type InputFrame } from "./inputFrame";
import { WalkRig, type WalkCameraState } from "./walkRig";

function setup(hit: number | null = null) {
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3();
  const rig = new WalkRig({
    camera,
    controls: () => ({ target }),
    head: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    // A wall `hit` scene units out pulls the camera in at once; otherwise it sits where it wants.
    collideCamera: (_from, _direction, _shown, want) => ({ distance: hit === null ? want : Math.min(want, hit), easing: false }),
    walking: () => true,
  });
  return { rig, camera, target };
}

const state = (patch: Partial<WalkCameraState> = {}): WalkCameraState => ({ yaw: 0, camYaw: 0, camSettling: false, camPitch: 0.35, camDistance: 10, camShown: 10, ...patch });
const frame = (patch: Partial<InputFrame>): InputFrame => ({ ...createInputFrame(), ...patch });

describe("WalkRig: the camera trailing behind", () => {
  it("eases behind a moving character at the follow rate, and at the turn rate while turning", () => {
    const { rig } = setup();
    const moving = state({ yaw: 1 });
    rig.trail(moving, frame({ forward: 1 }), 0.1);
    expect(moving.camYaw).toBeCloseTo(1 - Math.exp(-WALK_CAMERA_FOLLOW_RATE_PER_S * 0.1), 9);
    const turning = state({ yaw: 1 });
    rig.trail(turning, frame({ turn: 1 }), 0.1);
    expect(turning.camYaw).toBeCloseTo(1 - Math.exp(-WALK_CAMERA_TURN_FOLLOW_RATE_PER_S * 0.1), 9);
    expect(turning.camSettling).toBe(true);
  });

  it("stays put while standing still or while a drag holds the camera", () => {
    const { rig } = setup();
    const still = state({ yaw: 1 });
    rig.trail(still, frame({}), 0.1);
    expect(still.camYaw).toBe(0);
    const dragging = state({ yaw: 1 });
    rig.trail(dragging, frame({ forward: 1, dragging: true }), 0.1);
    expect(dragging.camYaw).toBe(0);
  });
});

describe("WalkRig: look and zoom", () => {
  it("left-drag looks; right-drag also turns the character; pitch stays within the limit", () => {
    const { rig } = setup();
    const walk = state();
    rig.look(walk, 50, 0, false);
    expect([walk.camYaw, walk.yaw]).toEqual([-50 * LOOK_RADIANS_PER_PX, 0]);
    rig.look(walk, 50, 0, true);
    expect(walk.yaw).toBe(walk.camYaw);
    rig.look(walk, 0, 1e6, false);
    expect(walk.camPitch).toBe(WALK_PITCH_LIMIT_RADIANS);
  });

  it("the wheel snaps into first person, steps out of it just behind, and stops at the cap", () => {
    const { rig } = setup();
    // 0.9 × e^-0.15 = 0.77, inside the 0.8-yard first-person snap.
    const walk = state({ camDistance: 0.9 });
    rig.zoom(walk, -100);
    expect(walk.camDistance).toBe(0);
    rig.zoom(walk, 100);
    expect(walk.camDistance).toBe(WALK_FIRST_PERSON_EXIT_YARDS);
    for (let step = 0; step < 50; step++) rig.zoom(walk, 100);
    expect(walk.camDistance).toBe(WALK_MAX_DISTANCE_YARDS);
  });
});

describe("WalkRig: placement", () => {
  it("sits behind the head at its distance and orbits the head", () => {
    const { rig, camera, target } = setup();
    const walk = state({ camPitch: 0 });
    expect(rig.place(walk, new THREE.Vector3(1, 0, 2), 1, 1 / 60)).toBe(false);
    expect(target.toArray()).toEqual([1, WALK_EYE_YARDS, 2]);
    expect(camera.position.toArray()).toEqual([1, WALK_EYE_YARDS, 12]);
  });

  it("a wall close behind pulls it into first person, where the camera is the eyes", () => {
    const { rig, camera } = setup(0.5);
    const walk = state();
    expect(rig.place(walk, new THREE.Vector3(), 1, 1 / 60)).toBe(true);
    expect(walk.camShown).toBe(0.5);
    expect(camera.position.toArray()).toEqual([0, WALK_EYE_YARDS, 0]);
  });
});
