import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createTestScene, FRAME_MS } from "./createTestScene";
import { BALCONY_Y } from "./syntheticDungeon";

// Characterisation (chronicle-1967): camera collision and the floor clamp.
// The synthetic wall stands at x 15..17 (z -15..15, 25 yards high); the
// balcony is a second floor at y 10 west of x -10. Scene units are yards.

const PADDING = 0.75; // ORBIT_COLLISION_PADDING (1.5 x the 0.5 near plane)
const RETURN_RATE = 6; // CAMERA_COLLISION_RETURN_RATE, per second
const CLEARANCE = 0.3; // MESH_CAMERA_CLEARANCE

/** Where the orbit camera ends up with the wall's face at x = 15 in the way: along its line, PADDING short of the wall. */
function pulledIn(position: [number, number, number], target: [number, number, number]) {
  const camera = new THREE.Vector3(...position);
  const pivot = new THREE.Vector3(...target);
  const direction = camera.clone().sub(pivot).normalize();
  // The ray runs from 2 yards above the pivot (MESH_PLAYER_HEIGHT_YARDS) along the camera's direction; height does not change where it meets x = 15.
  const hit = (15 - pivot.x) / direction.x;
  return { distance: hit - PADDING, want: camera.distanceTo(pivot) };
}

describe("camera collision (free cam)", () => {
  it("a wall between the pivot and the camera pulls the camera in along its line of sight", async () => {
    const h = await createTestScene();
    const pose = { position: [30, 3, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
    h.scene.applyCameraPose(pose);
    const { distance, want } = pulledIn(pose.position, pose.target);
    expect(h.probe.distance()).toBeCloseTo(distance, 6);
    // Same direction: only the distance changed.
    const angles = h.probe.angles();
    expect(angles.yaw).toBeCloseTo(Math.PI / 2, 9);
    expect(angles.pitch).toBeCloseTo(Math.atan2(3, 30), 9);
    // It holds there while the wall is in the way.
    h.frames(30);
    expect(h.probe.distance()).toBeCloseTo(distance, 6);
    expect(h.probe.internals.orbitWantDistance).toBeCloseTo(want, 9);
  });

  it("eases back out to the distance it wanted once the wall is clear", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [30, 3, 0], target: [0, 0, 0] });
    const want = Math.hypot(30, 3);
    const pulled = h.probe.distance();
    expect(pulled).toBeLessThan(15);
    // Turn the camera a quarter round the pivot: the wall is no longer between them.
    h.input.hover();
    h.input.hold("KeyA", 500);
    const distances = [h.probe.distance()];
    for (let index = 0; index < 120 && distances[distances.length - 1] < want; index++) {
      h.frame();
      distances.push(h.probe.distance());
    }
    expect(distances[0]).toBeGreaterThan(pulled);
    expect(distances[distances.length - 1]).toBeCloseTo(want, 9);
    // Each frame closes 1 - e^(-6 dt) of the gap, until it snaps the last 1e-4 out.
    const factor = 1 - Math.exp(-RETURN_RATE * (FRAME_MS / 1000));
    for (let index = 1; index < distances.length - 1; index++) {
      expect(distances[index] - distances[index - 1]).toBeCloseTo((want - distances[index - 1]) * factor, 6);
    }
    expect(distances.length - 1).toMatchInlineSnapshot(`71`);
  });

  it("a wheel zoom while pulled in scales the distance it wants, not the one it shows", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [30, 3, 0], target: [0, 0, 0] });
    const pulled = h.probe.distance();
    h.input.wheel(-200);
    h.frame();
    // e^(-200 x 0.0015) of the 30.15 it wanted; the wall still holds the camera where it was.
    expect(h.probe.internals.orbitWantDistance).toBeCloseTo(Math.hypot(30, 3) * Math.exp(-0.3), 9);
    expect(h.probe.distance()).toBeCloseTo(pulled, 9);
  });
});

describe("camera collision (walk mode)", () => {
  it("a wall between the head and the walk camera pulls it in; turning away eases it back to 10 yards", async () => {
    const h = await createTestScene();
    // Looking west at (12, 0, 0) from beyond the wall: walk mode starts there facing west, the camera east of it.
    h.scene.applyCameraPose({ position: [40, 10, 0], target: [12, 0, 0] });
    h.scene.setWalking(true);
    h.frame();
    const walk = h.probe.walk()!;
    expect(walk.position.toArray()).toEqual([12, 0, 0]);
    expect(walk.camDistance).toBe(10);
    // The wall's face is 3 yards east of the character; the camera sits 0.3 yards short of it.
    const horizontal = Math.cos(walk.camPitch) * walk.camShown;
    expect(horizontal).toBeCloseTo(3 - 0.3 * Math.cos(walk.camPitch), 6);
    h.input.hold("KeyA", 500);
    h.frames(120);
    expect(h.probe.walk()!.camShown).toBe(10);
  });
});

describe("the floor clamp", () => {
  it("lifts the camera 0.3 yards above the floor directly below it, then the collision pass shortens the arm back", async () => {
    const h = await createTestScene();
    // The pivot on the open ground, the camera just over the balcony's edge (x -10), its line clear.
    h.scene.applyCameraPose({ position: [-10.5, BALCONY_Y + 0.1, 0], target: [0, 0, 0] });
    // Each constrain pass lifts the camera to 10.3, which lengthens the arm;
    // the collision pass still wants the distance the pose had and pulls the
    // camera back in along the new line, a little under the clearance.
    // applyCameraPose runs two passes: OrbitControls' "change" event during
    // controls.update() constrains, then applyCameraPose constrains again.
    const want = Math.hypot(10.5, BALCONY_Y + 0.1);
    const pass = (camera: THREE.Vector3) => camera.setY(BALCONY_Y + CLEARANCE).setLength(want);
    const expected = pass(pass(new THREE.Vector3(-10.5, BALCONY_Y + 0.1, 0)));
    expect(h.probe.camera().position.y).toBeCloseTo(expected.y, 9);
    expect(h.probe.camera().position.x).toBeCloseTo(expected.x, 9);
    expect(h.probe.camera().position.y).toBeLessThan(BALCONY_Y + CLEARANCE);
    expect(h.probe.target().toArray()).toEqual([0, 0, 0]);
  });

  it("constrain: false does not stop applyCameraPose constraining the camera (the controls' change event does it)", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [-10.5, BALCONY_Y + 0.1, 0], target: [0, 0, 0] }, { constrain: false });
    const want = Math.hypot(10.5, BALCONY_Y + 0.1);
    const once = new THREE.Vector3(-10.5, BALCONY_Y + CLEARANCE, 0).setLength(want);
    expect(h.probe.camera().position.y).toBeCloseTo(once.y, 9);
  });

  it("over open ground the lifted pose holds the clearance after a frame", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [0, 0.1, 5], target: [0, 0, 0] });
    h.frames(5);
    expect(h.probe.camera().position.y).toBeGreaterThanOrEqual(CLEARANCE - 1e-9);
  });

  it("is applied before the collision pull-in, which can then bring the camera back under that floor", async () => {
    const h = await createTestScene();
    // Lifted to 10.3 over the balcony, the camera's line from the pivot then
    // meets the balcony's underside and pulls it in, below the balcony.
    h.scene.applyCameraPose({ position: [-20, BALCONY_Y + 0.1, 0], target: [0, 0, 0] });
    expect(h.probe.camera().position.y).toBeLessThan(9);
    expect(h.probe.camera().position.x).toBeGreaterThan(-15);
  });

  it("a camera under the balcony is not lifted onto it", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [-20, 5, 0], target: [0, 0, 0] });
    expect(h.probe.camera().position.y).toBeCloseTo(5, 9);
  });

  it("the pivot rides the floor: a target put in the air drops back to the floor plus the free cam's lift", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [0, 20, 30], target: [0, 6, 0] }, { constrain: false });
    // applyCameraPose keeps a raised target as lift.
    expect(h.probe.pivotLift()).toBe(6);
    h.frame();
    expect(h.probe.target().y).toBe(6);
    // A pivot on the balcony stands on it.
    h.scene.applyCameraPose({ position: [-25, 20, 30], target: [-25, 0, 0] });
    expect(h.probe.pivotLift()).toBe(0);
    expect(h.probe.target().y).toBe(BALCONY_Y);
  });
});
