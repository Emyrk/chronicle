import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createTestScene, FRAME_MS, testUnit } from "./createTestScene";
import { BALCONY_Y, ROOM, WALL_TOP_Y } from "./syntheticDungeon";

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
    const { distance } = pulledIn(pose.position, pose.target);
    expect(h.probe.distance()).toBeCloseTo(distance, 6);
    // Same direction: only the distance changed.
    const angles = h.probe.angles();
    expect(angles.yaw).toBeCloseTo(Math.PI / 2, 9);
    expect(angles.pitch).toBeCloseTo(Math.atan2(3, 30), 9);
    // It holds there while the wall is in the way.
    h.frames(30);
    expect(h.probe.distance()).toBeCloseTo(distance, 6);
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
    // Until it is out (within float error: the camera is no longer re-placed every frame, chronicle-1982).
    for (let index = 0; index < 120 && distances[distances.length - 1] < want - 1e-9; index++) {
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
    // 70 since chronicle-1982 (71 before): the 500 ms turn moves on its first frame too, so the wall clears a frame sooner.
    expect(distances.length - 1).toMatchInlineSnapshot(`70`);
  });

  it("a wheel zoom while pulled in scales the distance it wants, not the one it shows", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [30, 3, 0], target: [0, 0, 0] });
    const pulled = h.probe.distance();
    h.input.wheel(-200);
    h.frames(30);
    // The wall still holds the camera where it was.
    expect(h.probe.distance()).toBeCloseTo(pulled, 9);
    // Clear of the wall, it eases out to e^(-200 x 0.0015) of the 30.15 it wanted, not of the 14.3 it showed.
    h.input.hover();
    h.input.hold("KeyA", 500);
    h.frames(120);
    expect(h.probe.distance()).toBeCloseTo(Math.hypot(30, 3) * Math.exp(-0.3), 6);
  });
});

describe("camera collision (walk mode)", () => {
  it("a wall between the head and the walk camera pulls it in; turning away eases it back to 10 yards", async () => {
    const h = await createTestScene();
    // Looking west at (12, 0, 0) from beyond the wall: walk mode starts there facing west, the camera east of it.
    h.scene.applyCameraPose({ position: [40, 10, 0], target: [12, 0, 0] });
    h.scene.setWalking(true);
    h.frame();
    expect(h.probe.avatar()!.position.toArray()).toEqual([12, 0, 0]);
    // The wall's face is 3 yards east of the character; the camera sits 0.3 yards short of it, along its line from the head.
    const { pitch, distance } = h.probe.angles();
    expect(pitch).toBeCloseTo(0.35, 9);
    expect(Math.cos(pitch) * distance).toBeCloseTo(3 - 0.3 * Math.cos(pitch), 6);
    h.input.hold("KeyA", 500);
    h.frames(120);
    expect(h.probe.angles().distance).toBeCloseTo(10, 9);
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
    // Within float error of it: since chronicle-1982 the camera keeps the constraint's rounding instead of being re-placed every frame.
    expect(h.probe.camera().position.y).toBeGreaterThanOrEqual(CLEARANCE - 1e-8);
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
    // applyCameraPose keeps a raised target as lift: it holds 6 above the floor...
    h.frame();
    expect(h.probe.target().y).toBe(6);
    // ...until Z lowers it, never below the floor.
    h.input.hover();
    h.input.hold("KeyZ", 3000);
    expect(h.probe.target().y).toBe(0);
    // A pivot put under the balcony stands on top of it (the highest surface).
    h.scene.applyCameraPose({ position: [-25, 20, 30], target: [-25, 0, 0] });
    expect(h.probe.target().y).toBe(BALCONY_Y);
  });
});

describe("camera collision while the pivot glides across the wall", () => {
  it("the pivot rides up onto the wall's top, and at the 1-yard minimum the camera is drawn inside the wall", async () => {
    // A shift+double-click on a unit just west of the wall, from the east: the pivot glides west across the wall.
    const h = await createTestScene({ units: [testUnit("p1", 5, 0)] });
    h.scene.applyCameraPose({ position: [40, 4, 0], target: [20, 0, 0] });
    h.settle();
    const wall = new THREE.Box3(new THREE.Vector3(...ROOM.wall.min), new THREE.Vector3(...ROOM.wall.max));
    const pivotHeights: number[] = [];
    const insideWall: boolean[] = [];
    h.renders.hook = () => {
      pivotHeights.push(h.probe.target().y);
      insideWall.push(wall.containsPoint(h.probe.camera().position));
    };
    const at = h.screenOf(5, 0.3, 0);
    h.input.doubleClick(at.x, at.y, { shiftKey: true });
    h.settle();
    // The pivot rides the highest surface under it, so over the wall it stands on the wall's top.
    expect(Math.max(...pivotHeights)).toBeCloseTo(WALL_TOP_Y, 9);
    // Past the wall the collision pass pulls the camera in to OrbitControls' 1-yard minimum, which is inside the wall.
    expect(insideWall.filter(Boolean)).toHaveLength(1);
    expect(h.probe.target().x).toBeCloseTo(5, 9);
    expect(h.probe.target().y).toBe(0);
  });
});
