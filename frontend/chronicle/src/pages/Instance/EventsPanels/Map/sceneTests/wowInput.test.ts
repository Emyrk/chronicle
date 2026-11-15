import { describe, expect, it, vi } from "vitest";
import { createTestScene, FRAME_MS, testUnit } from "./createTestScene";

// Characterisation (chronicle-1967): the WoW controls as MapScene3D wires them
// today. Walk mode is the reference; the free cam is walk mode with a hidden
// character. Scene units are yards on the synthetic dungeon (scale 1).

const LOOK = 0.006; // radians per pixel (LOOK_RADIANS_PER_PX)
const RUN = 14; // yards per second
const TURN = Math.PI; // radians per second
const SECOND = Math.round(1000 / FRAME_MS); // frames

// A camera looking from +z at the origin: walk mode then starts there, facing -z.
async function sceneAtOrigin(units = [] as ReturnType<typeof testUnit>[]) {
  const h = await createTestScene({ units });
  h.scene.applyCameraPose({ position: [0, 10, 20], target: [0, 0, 0] });
  h.settle();
  return h;
}

async function walking() {
  const h = await sceneAtOrigin();
  h.scene.setWalking(true);
  h.frame();
  const walk = h.probe.walk()!;
  expect(walk.position.toArray()).toEqual([0, 0, 0]);
  expect(walk.yaw).toBe(0);
  expect(walk.camYaw).toBe(0);
  return h;
}

describe("walk mode", () => {
  it("starts where the camera looked, facing away from it, 10 yards back at a 0.35 pitch", async () => {
    const h = await walking();
    const walk = h.probe.walk()!;
    expect(walk.camDistance).toBe(10);
    expect(walk.camPitch).toBe(0.35);
    expect(walk.grounded).toBe(true);
    expect(h.probe.controls().enabled).toBe(false);
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera 0,5.129,9.394 -> target 0,1.7,0"`);
  });

  it("left-drag looks: the camera turns, the character does not", async () => {
    const h = await walking();
    h.input.drag(0, 50, 20);
    const walk = h.probe.walk()!;
    expect(walk.camYaw).toBeCloseTo(-50 * LOOK, 9);
    expect(walk.camPitch).toBeCloseTo(0.35 + 20 * LOOK, 9);
    expect(walk.yaw).toBe(0);
  });

  it("right-drag looks and steers: the character turns with the camera", async () => {
    const h = await walking();
    h.input.drag(2, 50, 0);
    const walk = h.probe.walk()!;
    expect(walk.camYaw).toBeCloseTo(-50 * LOOK, 9);
    expect(walk.yaw).toBeCloseTo(-50 * LOOK, 9);
  });

  it("both buttons run forward", async () => {
    const h = await walking();
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    h.input.pointerDown(400, 300, { button: 2, buttons: 3 });
    expect(h.probe.walk()!.drag!.buttons).toBe(3);
    h.frames(SECOND);
    const { position } = h.probe.walk()!;
    expect(position.x).toBeCloseTo(0, 9);
    expect(position.z).toBeCloseTo(-RUN, 6);
  });

  it("A and D turn the character", async () => {
    const h = await walking();
    h.input.hold("KeyA", 1000);
    expect(h.probe.walk()!.yaw).toBeCloseTo(TURN, 6);
    expect(h.probe.walk()!.position.toArray()).toEqual([0, 0, 0]);
    h.input.hold("KeyD", 500);
    expect(h.probe.walk()!.yaw).toBeCloseTo(TURN / 2, 6);
  });

  it("A and D strafe with the A/D strafe setting on", async () => {
    const h = await walking();
    h.scene.setAdStrafe(true);
    h.input.hold("KeyA", 1000);
    const walk = h.probe.walk()!;
    expect(walk.yaw).toBe(0);
    expect(walk.position.x).toBeCloseTo(-RUN, 6);
    expect(walk.position.z).toBeCloseTo(0, 9);
  });

  it("A and D strafe while right-dragging, whatever the setting", async () => {
    const h = await walking();
    h.input.pointerDown(400, 300, { button: 2, buttons: 2 });
    h.input.hold("KeyD", 1000);
    const walk = h.probe.walk()!;
    expect(walk.yaw).toBe(0);
    expect(walk.position.x).toBeCloseTo(RUN, 6);
  });

  it("W runs and S backs off slower", async () => {
    const h = await walking();
    h.input.hold("KeyW", 1000);
    expect(h.probe.walk()!.position.z).toBeCloseTo(-RUN, 6);
    h.input.hold("KeyS", 1000);
    expect(h.probe.walk()!.position.z).toBeCloseTo(-RUN + 9, 6);
  });

  it("Space jumps off the floor and lands again; held, it keeps flying up", async () => {
    const h = await walking();
    h.input.keyDown("Space");
    h.frame();
    h.input.keyUp("Space");
    expect(h.probe.walk()!.grounded).toBe(false);
    expect(h.probe.walk()!.vy).toBeCloseTo(8 - 19.3 * (1 / 60), 6);
    let peak = 0;
    for (let index = 0; index < SECOND && !h.probe.walk()!.grounded; index++) {
      h.frame();
      peak = Math.max(peak, h.probe.walk()!.position.y);
    }
    expect(h.probe.walk()!.grounded).toBe(true);
    expect(h.probe.walk()!.position.y).toBe(0);
    expect(peak).toBeGreaterThan(1.4);
    expect(peak).toBeLessThan(1.7);

    h.input.hold("Space", 1000);
    expect(h.probe.walk()!.position.y).toBeGreaterThan(8);
  });

  it("Z flies down while airborne, and lands on the floor", async () => {
    const h = await walking();
    h.input.hold("Space", 1000);
    const high = h.probe.walk()!.position.y;
    h.input.hold("KeyZ", 300);
    expect(h.probe.walk()!.position.y).toBeLessThan(high - 3);
    h.input.hold("KeyZ", 2000);
    expect(h.probe.walk()!.grounded).toBe(true);
    expect(h.probe.walk()!.position.y).toBe(0);
  });

  it("the wheel zooms in to first person, and out of it to 1.2 yards", async () => {
    const h = await walking();
    let ticks = 0;
    while (h.probe.walk()!.camDistance > 0) {
      h.input.wheel(-100);
      ticks++;
    }
    expect(ticks).toBe(17);
    h.frame();
    const walk = h.probe.walk()!;
    expect(walk.camShown).toBe(0);
    expect(walk.avatar.visible).toBe(false);
    // The camera is the character's eyes, 1.7 yards up.
    expect(h.probe.camera().position.toArray()).toEqual([0, 1.7, 0]);
    h.input.wheel(100);
    expect(h.probe.walk()!.camDistance).toBeCloseTo(1.2, 9);
  });

  it("the wheel zooms out no further than 45 yards", async () => {
    const h = await walking();
    for (let index = 0; index < 40; index++) h.input.wheel(100);
    expect(h.probe.walk()!.camDistance).toBe(45);
  });

  it("a mouse press asks for pointer lock; a touch does not", async () => {
    const h = await walking();
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    expect(h.canvas.pointerLockRequests).toBe(1);
    h.input.pointerUp(400, 300, { button: 0 });
    h.input.touchDown(7, 400, 300);
    expect(h.canvas.pointerLockRequests).toBe(1);
    // A touch drags as a right-drag: it steers.
    expect(h.probe.walk()!.drag!.buttons).toBe(2);
  });

  it("with the pointer locked, a drag reads movementX/Y and the release unlocks", async () => {
    const h = await walking();
    h.dom.document.grantPointerLock = true;
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    expect(h.dom.document.pointerLockElement).toBe(h.canvas);
    h.input.pointerMove(400, 300, { buttons: 1, movementX: 25, movementY: 0 });
    expect(h.probe.walk()!.camYaw).toBeCloseTo(-25 * LOOK, 9);
    h.input.pointerUp(400, 300, { button: 0 });
    expect(h.dom.document.pointerLockElement).toBeNull();
  });

  it("G toggles walk mode with the pointer over the map; Shift+G and G off the map do not", async () => {
    const h = await sceneAtOrigin();
    h.input.keyDown("KeyG");
    expect(h.probe.walk()).toBeNull();
    h.input.hover();
    h.input.keyDown("KeyG", { shiftKey: true });
    expect(h.probe.walk()).toBeNull();
    h.input.keyDown("KeyG");
    expect(h.probe.walk()).not.toBeNull();
    h.input.leave();
    h.input.keyDown("KeyG");
    expect(h.probe.walk()).toBeNull();
  });

  it("walk-mode keys act with the pointer off the map", async () => {
    const h = await walking();
    h.input.leave();
    h.input.hold("KeyW", 1000);
    expect(h.probe.walk()!.position.z).toBeCloseTo(-RUN, 6);
  });
});

describe("free cam", () => {
  async function freeCam(units = [] as ReturnType<typeof testUnit>[]) {
    const h = await sceneAtOrigin(units);
    h.input.hover();
    return h;
  }

  it("left-drag and right-drag look at walk mode's rate, past a 5 px slop", async () => {
    const h = await freeCam();
    for (const button of [0, 2]) {
      const before = h.probe.angles();
      h.input.drag(button, 40, 20);
      const after = h.probe.angles();
      // The first move (10, 5) px crosses the slop and is not looked with.
      expect(after.yaw - before.yaw).toBeCloseTo(-30 * LOOK, 6);
      expect(after.pitch - before.pitch).toBeCloseTo(15 * LOOK, 6);
      expect(after.distance).toBeCloseTo(before.distance, 6);
    }
  });

  it("asks for pointer lock only once a press passes the drag threshold", async () => {
    const h = await freeCam();
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    expect(h.canvas.pointerLockRequests).toBe(0);
    h.input.pointerMove(403, 300, { buttons: 1 });
    expect(h.canvas.pointerLockRequests).toBe(0);
    h.input.pointerMove(410, 300, { buttons: 1 });
    expect(h.canvas.pointerLockRequests).toBe(1);
  });

  it("both buttons travel forward at once, without waiting for a drag", async () => {
    const h = await freeCam();
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    h.input.pointerDown(400, 300, { button: 2, buttons: 3 });
    expect(h.canvas.pointerLockRequests).toBe(1);
    expect(h.probe.orbitDrag()).toMatchObject({ buttons: 3, dragging: true });
    const distance = h.probe.distance();
    h.frames(SECOND);
    // All 60 frames move: unlike a first key press, the buttons do not restart
    // the travel clock, which the always-awake mover keeps stamped (README, oddity 1).
    expect(h.probe.target().z).toBeCloseTo(-0.6 * distance, 6);
  });

  it("W travels along the view at 0.6 of the camera distance per second", async () => {
    const h = await freeCam();
    const distance = h.probe.distance();
    h.input.hold("KeyW", 1000);
    expect(h.probe.target().x).toBeCloseTo(0, 9);
    // The key press restarts the travel clock, so the first frame only stamps it: 59 of 60 frames move.
    expect(h.probe.target().z).toBeCloseTo(-0.6 * distance * (59 / 60), 6);
    expect(h.probe.distance()).toBeCloseTo(distance, 6);
  });

  it("Shift travels three times faster", async () => {
    const h = await freeCam();
    const distance = h.probe.distance();
    h.input.hold("KeyW", 1000, { shiftKey: true });
    expect(h.probe.target().z).toBeCloseTo(-3 * 0.6 * distance * (59 / 60), 6);
  });

  it("A and D turn the camera about its pivot at walk mode's turn rate", async () => {
    const h = await freeCam();
    const before = h.probe.angles();
    h.input.hold("KeyA", 1000);
    expect(h.probe.angles().yaw - before.yaw).toBeCloseTo(TURN * (59 / 60), 6);
    expect(h.probe.target().toArray()).toEqual([0, 0, 0]);
  });

  it("A and D strafe while right-dragging", async () => {
    const h = await freeCam();
    const distance = h.probe.distance();
    h.input.pointerDown(400, 300, { button: 2, buttons: 2 });
    h.input.pointerMove(420, 300, { buttons: 2 });
    const yaw = h.probe.angles().yaw;
    h.input.hold("KeyD", 1000);
    expect(h.probe.angles().yaw).toBeCloseTo(yaw, 9);
    expect(Math.hypot(h.probe.target().x, h.probe.target().z)).toBeCloseTo(0.6 * distance * (59 / 60), 6);
  });

  it("Space lifts the pivot off the floor and Z lowers it, never below the floor", async () => {
    const h = await freeCam();
    const distance = h.probe.distance();
    h.input.hold("Space", 1000);
    expect(h.probe.pivotLift()).toBeCloseTo(0.6 * distance * (59 / 60), 6);
    expect(h.probe.target().y).toBeCloseTo(h.probe.pivotLift(), 9);
    h.input.hold("KeyZ", 3000);
    expect(h.probe.pivotLift()).toBe(0);
    expect(h.probe.target().y).toBe(0);
  });

  it("a click without a drag selects the unit under it, after the double-click window", async () => {
    const h = await freeCam([testUnit("p1", 0, 0)]);
    const onClick = vi.fn();
    h.scene.setOnUnitClick(onClick);
    const at = h.screenOf(0, 0, 0);
    h.input.click(at.x, at.y);
    vi.advanceTimersByTime(249);
    expect(onClick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClick).toHaveBeenCalledWith("p1");
  });

  it("a drag, a double-click or a click on empty floor selects nothing", async () => {
    const h = await freeCam([testUnit("p1", 0, 0)]);
    const onClick = vi.fn();
    h.scene.setOnUnitClick(onClick);
    const at = h.screenOf(0, 0, 0);
    h.input.drag(0, 30, 0, { from: at });
    h.input.doubleClick(at.x, at.y);
    const empty = h.screenOf(8, 0, 8);
    h.input.click(empty.x, empty.y);
    vi.advanceTimersByTime(1000);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keys are ignored while typing in a field", async () => {
    const h = await freeCam();
    const input = h.dom.document.createElement("input");
    h.input.keyDown("KeyW", { target: input });
    expect(h.probe.heldActions()).toEqual([]);
  });

  it("Ctrl, Alt or Meta with a key belongs to the page", async () => {
    const h = await freeCam();
    h.input.keyDown("KeyW", { ctrlKey: true });
    h.input.keyDown("KeyS", { altKey: true });
    h.input.keyDown("KeyA", { metaKey: true });
    expect(h.probe.heldActions()).toEqual([]);
  });

  it("losing window focus releases held keys", async () => {
    const h = await freeCam();
    h.input.keyDown("KeyW");
    h.input.keyDown("KeyA");
    expect(h.probe.heldActions()).toEqual(["forward", "turn_left"]);
    h.input.blurWindow();
    expect(h.probe.heldActions()).toEqual([]);
  });
});

