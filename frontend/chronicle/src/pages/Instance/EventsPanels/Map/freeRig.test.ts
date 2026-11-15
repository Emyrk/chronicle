import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { FIRST_FRAME_STEP_S, FREE_CAM_MAX_PITCH_RADIANS, FREE_CAM_TRAVEL_DISTANCES_PER_S, LOOK_RADIANS_PER_PX, TILES_MAX_POLAR_RADIANS } from "./controlProfile";
import { FreeRig } from "./freeRig";
import { createInputFrame, type InputFrame } from "./inputFrame";
import { installFakeDom, type FakeCanvas } from "./sceneTests/fakeDom";

let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
});

function setup(want: number | null = null) {
  const dom = installFakeDom();
  uninstall = dom.uninstall;
  const canvas = dom.document.createElement("canvas") as FakeCanvas;
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 20);
  const rig = new FreeRig({
    camera,
    element: canvas as unknown as HTMLElement,
    capture: false,
    scratch: new THREE.Vector3(),
    pivotFloor: () => 0,
    wantDistance: () => want,
    requestRender: () => {},
  });
  return { rig, camera };
}

const frame = (patch: Partial<InputFrame>): InputFrame => ({ ...createInputFrame(), ...patch });

describe("FreeRig", () => {
  it("looks at walk mode's rate, never past straight down or the polar limit", () => {
    const { rig } = setup();
    expect(rig.owner).toBe("free");
    rig.lookFreeCam(50, 0);
    expect(rig.freeCamAngles().yaw).toBeCloseTo(-50 * LOOK_RADIANS_PER_PX, 9);
    rig.lookFreeCam(0, 1e6);
    expect(rig.freeCamAngles().pitch).toBeCloseTo(FREE_CAM_MAX_PITCH_RADIANS, 6);
    rig.lookFreeCam(0, -1e6);
    expect(rig.freeCamAngles().pitch).toBeCloseTo(Math.PI / 2 - TILES_MAX_POLAR_RADIANS, 6);
  });

  it("the mover rests without input, steps a first frame on its first active one, and restarts when input stops", () => {
    const { rig } = setup();
    expect(rig.update(1000, frame({}), false)).toBe(false);
    expect(rig.active()).toBe(false);
    expect(rig.update(1000, frame({ active: true, forward: 1 }), false)).toBe(true);
    // One first-frame step of travel along -z, at 0.6 of the 20-unit distance per second.
    expect(rig.controls.target.z).toBeCloseTo(-FREE_CAM_TRAVEL_DISTANCES_PER_S * 20 * FIRST_FRAME_STEP_S, 9);
    expect(rig.active()).toBe(true);
    rig.update(1100, frame({}), false);
    expect(rig.active()).toBe(false);
    // Walking, the character has the camera.
    expect(rig.update(1200, frame({ active: true, forward: 1 }), true)).toBe(false);
  });

  it("travels at a fraction of the distance the user chose, not where a wall holds the camera", () => {
    const { rig } = setup(40);
    rig.update(1000, frame({ active: true, forward: 1 }), false);
    expect(rig.controls.target.z).toBeCloseTo(-FREE_CAM_TRAVEL_DISTANCES_PER_S * 40 * FIRST_FRAME_STEP_S, 9);
  });

  it("lifts the pivot with the vertical axis, never below the floor", () => {
    const { rig } = setup();
    rig.update(1000, frame({ active: true, vertical: 1 }), false);
    expect(rig.pivotLift).toBeGreaterThan(0);
    expect(rig.controls.target.y).toBeCloseTo(rig.pivotLift, 9);
    for (let at = 1016; at < 3000; at += 16) rig.update(at, frame({ active: true, vertical: -1 }), false);
    expect(rig.pivotLift).toBe(0);
  });
});
