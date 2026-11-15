import { describe, expect, it, vi } from "vitest";
import { IDLE_MOBILE_MAP_INPUT, type MobileMapInput } from "../mapControls";
import { createTestScene, FRAME_MS, testUnit, type TestScene } from "./createTestScene";
import { FakePointerEvent } from "./fakeDom";

// Characterisation (chronicle-1967): the WoW controls as MapScene3D wires them
// today. Walk mode is the reference; the free cam is walk mode with a hidden
// character. Scene units are yards on the synthetic dungeon (scale 1).
//
// Everything here is read off the scene graph: the character as drawn
// (h.probe.avatar(): feet, facing, visible) and the camera (h.probe.angles():
// yaw/pitch/distance about walk mode's head or the free cam's pivot).

const LOOK = 0.006; // radians per pixel (LOOK_RADIANS_PER_PX)
const RUN = 14; // yards per second
const BACK = 9; // yards per second
const TURN = Math.PI; // radians per second
const STICK_PITCH = 1.6; // radians per second at full stick (KEY_ROTATE_SPEED)
const TRAVEL = 0.6; // free cam: camera distances per second (KEY_PAN_SPEED)
const EYE = 1.7; // walk mode's head height (WALK_EYE_YARDS)
const SECOND = Math.round(1000 / FRAME_MS); // frames

const pad = (input: Partial<MobileMapInput>): MobileMapInput => ({ ...IDLE_MOBILE_MAP_INPUT, ...input });

/** Where a character facing `facing` (0 = -z) runs `yards` forward. */
function ahead(facing: number, yards: number) {
  return { x: -Math.sin(facing) * yards, z: -Math.cos(facing) * yards };
}

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
  const avatar = h.probe.avatar()!;
  expect(avatar.position.toArray()).toEqual([0, 0, 0]);
  expect(avatar.facing).toBe(0);
  expect(h.probe.angles().yaw).toBe(0);
  return h;
}

const avatar = (h: TestScene) => h.probe.avatar()!;

describe("walk mode", () => {
  it("starts where the camera looked, facing away from it, the camera 10 yards back at a 0.35 pitch", async () => {
    const h = await walking();
    expect(h.probe.owner()).toBe("walk");
    expect(h.probe.angles().distance).toBeCloseTo(10, 9);
    expect(h.probe.angles().pitch).toBeCloseTo(0.35, 9);
    expect(avatar(h).visible).toBe(true);
    // The camera orbits the head.
    expect(h.probe.target().toArray()).toEqual([0, EYE, 0]);
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera 0,5.129,9.394 -> target 0,1.7,0"`);
  });

  it("left-drag looks: the camera turns, the character does not", async () => {
    const h = await walking();
    h.input.drag(0, 50, 20);
    h.frame();
    expect(h.probe.angles().yaw).toBeCloseTo(-50 * LOOK, 9);
    expect(h.probe.angles().pitch).toBeCloseTo(0.35 + 20 * LOOK, 9);
    expect(avatar(h).facing).toBe(0);
  });

  it("right-drag looks and steers: the character turns with the camera", async () => {
    const h = await walking();
    h.input.drag(2, 50, 0);
    h.frame();
    expect(h.probe.angles().yaw).toBeCloseTo(-50 * LOOK, 9);
    expect(avatar(h).facing).toBeCloseTo(-50 * LOOK, 9);
  });

  it("right-drag held with W runs where the camera looks, facing that way", async () => {
    const h = await walking();
    h.input.drag(2, 50, 0, { release: false });
    h.input.hold("KeyW", 1000);
    const heading = -50 * LOOK;
    const { x, z } = ahead(heading, RUN);
    expect(avatar(h).position.x).toBeCloseTo(x, 6);
    expect(avatar(h).position.z).toBeCloseTo(z, 6);
    expect(avatar(h).facing).toBeCloseTo(heading, 9);
    // The camera stays behind it, where the drag left it.
    expect(h.probe.angles().yaw).toBeCloseTo(heading, 9);
  });

  it("pressing right while left-dragging steers at once: the character turns to the camera without a mouse move", async () => {
    const h = await walking();
    // Look 50 px with the left button, then add the right one without moving: both buttons run.
    h.input.drag(0, 50, 0, { release: false });
    h.input.pointerDown(450, 300, { button: 2, buttons: 3 });
    h.frames(SECOND);
    const heading = -50 * LOOK;
    const { x, z } = ahead(heading, RUN);
    expect(avatar(h).facing).toBeCloseTo(heading, 9);
    expect(avatar(h).position.x).toBeCloseTo(x, 6);
    expect(avatar(h).position.z).toBeCloseTo(z, 6);
  });

  it("both buttons run forward", async () => {
    const h = await walking();
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    h.input.pointerDown(400, 300, { button: 2, buttons: 3 });
    h.frames(SECOND);
    expect(avatar(h).position.x).toBeCloseTo(0, 9);
    expect(avatar(h).position.z).toBeCloseTo(-RUN, 6);
  });

  it("A and D turn the character, and the camera swings round behind it", async () => {
    const h = await walking();
    h.input.hold("KeyA", 1000);
    expect(avatar(h).facing).toBeCloseTo(TURN, 6);
    expect(avatar(h).position.toArray()).toEqual([0, 0, 0]);
    h.frames(SECOND);
    expect(Math.abs(Math.sin(h.probe.angles().yaw - TURN))).toBeLessThan(0.01);
    h.input.hold("KeyD", 500);
    expect(avatar(h).facing).toBeCloseTo(TURN / 2, 6);
  });

  it("A and D strafe with the A/D strafe setting on: the camera does not turn", async () => {
    const h = await walking();
    h.scene.setAdStrafe(true);
    h.input.hold("KeyA", 1000);
    expect(avatar(h).position.x).toBeCloseTo(-RUN, 6);
    expect(avatar(h).position.z).toBeCloseTo(0, 9);
    expect(h.probe.angles().yaw).toBeCloseTo(0, 9);
    // Only the body turns toward where it goes: 90° to the left.
    expect(avatar(h).facing).toBeCloseTo(Math.PI / 2, 3);
  });

  it("A and D strafe while right-dragging, whatever the setting", async () => {
    const h = await walking();
    h.input.pointerDown(400, 300, { button: 2, buttons: 2 });
    h.input.hold("KeyD", 1000);
    expect(avatar(h).position.x).toBeCloseTo(RUN, 6);
    expect(avatar(h).position.z).toBeCloseTo(0, 9);
    expect(h.probe.angles().yaw).toBeCloseTo(0, 9);
  });

  it("W runs and S backs off slower", async () => {
    const h = await walking();
    h.input.hold("KeyW", 1000);
    expect(avatar(h).position.z).toBeCloseTo(-RUN, 6);
    h.input.hold("KeyS", 1000);
    expect(avatar(h).position.z).toBeCloseTo(-RUN + BACK, 6);
  });

  it("Space jumps off the floor and lands again; held, it keeps flying up", async () => {
    const h = await walking();
    h.input.keyDown("Space");
    h.frame();
    h.input.keyUp("Space");
    // 8 yards/s up, less a frame of gravity (19.3 yards/s²), for one frame.
    expect(avatar(h).position.y).toBeCloseTo((8 - 19.3 / 60) / 60, 6);
    let peak = 0;
    for (let index = 0; index < SECOND && avatar(h).position.y > 0; index++) {
      h.frame();
      peak = Math.max(peak, avatar(h).position.y);
    }
    expect(avatar(h).position.y).toBe(0);
    expect(peak).toBeGreaterThan(1.4);
    expect(peak).toBeLessThan(1.7);

    h.input.hold("Space", 1000);
    expect(avatar(h).position.y).toBeGreaterThan(8);
  });

  it("Z flies down while airborne, and lands on the floor", async () => {
    const h = await walking();
    h.input.hold("Space", 1000);
    const high = avatar(h).position.y;
    h.input.hold("KeyZ", 300);
    expect(avatar(h).position.y).toBeLessThan(high - 3);
    h.input.hold("KeyZ", 2000);
    expect(avatar(h).position.y).toBe(0);
  });

  it("the wheel zooms in to first person, and out of it to 1.2 yards", async () => {
    const h = await walking();
    let ticks = 0;
    while (avatar(h).visible) {
      h.input.wheel(-100);
      h.frame();
      ticks++;
    }
    // Each tick scales the distance by e^-0.15 until it snaps to 0: the camera is then the character's eyes and the body hides.
    expect(ticks).toBe(17);
    expect(h.probe.camera().position.toArray()).toEqual([0, EYE, 0]);
    while (h.probe.distance() === 0 && ticks < 40) {
      h.input.wheel(-100);
      h.frame();
      ticks++;
    }
    h.input.wheel(100);
    // The camera eases out to it (the collision pass's return rate, 6 per second).
    h.frames(2 * SECOND);
    expect(h.probe.distance()).toBeCloseTo(1.2, 6);
    expect(avatar(h).visible).toBe(true);
  });

  it("the wheel zooms out no further than 45 yards", async () => {
    const h = await walking();
    for (let index = 0; index < 40; index++) h.input.wheel(100);
    h.frames(3 * SECOND);
    expect(h.probe.distance()).toBeCloseTo(45, 6);
  });

  it("a mouse press asks for pointer lock; a touch does not", async () => {
    const h = await walking();
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    expect(h.canvas.pointerLockRequests).toBe(1);
    h.input.pointerUp(400, 300, { button: 0 });
    h.input.touchDown(7, 400, 300);
    expect(h.canvas.pointerLockRequests).toBe(1);
  });

  it("a touch drag is a right-drag: the camera turns and the character turns with it", async () => {
    const h = await walking();
    h.input.touchDown(7, 400, 300);
    h.input.touchMove(7, 425, 300);
    h.input.touchMove(7, 450, 300);
    h.frame();
    expect(h.probe.angles().yaw).toBeCloseTo(-50 * LOOK, 9);
    expect(avatar(h).facing).toBeCloseTo(-50 * LOOK, 9);
  });

  it("a cancelled touch ends the walk drag: later moves no longer look", async () => {
    const h = await walking();
    h.input.touchDown(7, 400, 300);
    h.input.touchMove(7, 425, 300);
    h.input.pointerCancel(425, 300, { pointerId: 7, pointerType: "touch" });
    h.input.touchMove(7, 475, 300);
    h.frame();
    expect(h.probe.angles().yaw).toBeCloseTo(-25 * LOOK, 9);
    expect(avatar(h).facing).toBeCloseTo(-25 * LOOK, 9);
  });

  it("a mouse losing pointer capture does not end the walk drag (the cursor lock does that at every drag start)", async () => {
    const h = await walking();
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    h.canvas.dispatchEvent(new FakePointerEvent("lostpointercapture", { pointerType: "mouse" }));
    h.input.pointerMove(430, 300, { buttons: 1 });
    h.frame();
    expect(h.probe.angles().yaw).toBeCloseTo(-30 * LOOK, 9);
  });

  it("with the pointer locked, a drag reads movementX/Y and the release unlocks", async () => {
    const h = await walking();
    h.dom.document.grantPointerLock = true;
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    expect(h.dom.document.pointerLockElement).toBe(h.canvas);
    h.input.pointerMove(400, 300, { buttons: 1, movementX: 25, movementY: 0 });
    h.frame();
    expect(h.probe.angles().yaw).toBeCloseTo(-25 * LOOK, 9);
    h.input.pointerUp(400, 300, { button: 0 });
    expect(h.dom.document.pointerLockElement).toBeNull();
  });

  it("losing the pointer lock mid-drag does not end the drag: it goes on reading clientX/Y until the release", async () => {
    const h = await walking();
    h.dom.document.grantPointerLock = true;
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    h.input.pointerMove(400, 300, { buttons: 1, movementX: 25 });
    // The browser drops the lock (Esc, a focus change): nothing listens for pointerlockchange.
    h.dom.document.pointerLockElement = null;
    h.dom.document.dispatchEvent(new Event("pointerlockchange"));
    h.input.pointerMove(440, 300, { buttons: 1, movementX: 99 });
    h.frame();
    // 25 px locked, then 40 px of clientX (movementX is ignored unlocked).
    expect(h.probe.angles().yaw).toBeCloseTo(-65 * LOOK, 9);
    // The release still ends it; nothing is left stuck.
    h.input.pointerUp(440, 300, { button: 0 });
    h.input.pointerMove(500, 300, { buttons: 0 });
    h.frame();
    expect(h.probe.angles().yaw).toBeCloseTo(-65 * LOOK, 9);
    h.input.pointerDown(500, 300, { button: 0, buttons: 1 });
    expect(h.canvas.pointerLockRequests).toBe(2);
  });

  it("G toggles walk mode with the pointer over the map; Shift+G and G off the map do not", async () => {
    const h = await sceneAtOrigin();
    h.input.keyDown("KeyG");
    expect(h.probe.owner()).not.toBe("walk");
    h.input.hover();
    h.input.keyDown("KeyG", { shiftKey: true });
    expect(h.probe.owner()).not.toBe("walk");
    h.input.keyDown("KeyG");
    expect(h.probe.owner()).toBe("walk");
    h.input.leave();
    h.input.keyDown("KeyG");
    expect(h.probe.owner()).not.toBe("walk");
  });

  it("walk-mode keys act with the pointer off the map", async () => {
    const h = await walking();
    h.input.leave();
    h.input.hold("KeyW", 1000);
    expect(avatar(h).position.z).toBeCloseTo(-RUN, 6);
  });
});

describe("walk mode on the mobile layout (setMobileInput)", () => {
  it("the move pad runs the character", async () => {
    const h = await walking();
    h.scene.setMobileInput(pad({ forward: 1 }));
    h.frames(SECOND);
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    expect(avatar(h).position.z).toBeCloseTo(-RUN, 6);
    h.scene.setMobileInput(pad({ strafe: 1 }));
    h.frames(SECOND);
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    expect(avatar(h).position.x).toBeCloseTo(RUN, 6);
  });

  it("the look stick turns the character (right is clockwise) and pitches the camera (up raises it)", async () => {
    const h = await walking();
    h.scene.setMobileInput(pad({ turn: 1 }));
    h.frames(SECOND / 2);
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    expect(avatar(h).facing).toBeCloseTo(-TURN / 2, 6);
    const pitch = h.probe.angles().pitch;
    h.scene.setMobileInput(pad({ pitch: 1 }));
    h.frames(SECOND / 4);
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    h.frame();
    expect(h.probe.angles().pitch).toBeCloseTo(pitch + STICK_PITCH / 4, 6);
  });

  it("the jump button jumps", async () => {
    const h = await walking();
    h.scene.setMobileInput(pad({ jump: true }));
    h.frame();
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    expect(avatar(h).position.y).toBeGreaterThan(0);
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
    const distance = h.probe.distance();
    h.frames(SECOND);
    // All 60 frames move: the first one steps a nominal frame (FIRST_FRAME_STEP_S).
    expect(h.probe.target().z).toBeCloseTo(-TRAVEL * distance, 6);
  });

  it("W travels along the view at 0.6 of the camera distance per second", async () => {
    const h = await freeCam();
    const distance = h.probe.distance();
    h.input.hold("KeyW", 1000);
    expect(h.probe.target().x).toBeCloseTo(0, 9);
    // A key press moves on its first frame (chronicle-1982): all 60 frames move.
    expect(h.probe.target().z).toBeCloseTo(-TRAVEL * distance, 6);
    expect(h.probe.distance()).toBeCloseTo(distance, 6);
  });

  it("Shift travels three times faster", async () => {
    const h = await freeCam();
    const distance = h.probe.distance();
    h.input.hold("KeyW", 1000, { shiftKey: true });
    expect(h.probe.target().z).toBeCloseTo(-3 * TRAVEL * distance, 6);
  });

  it("A and D turn the camera about its pivot at walk mode's turn rate", async () => {
    const h = await freeCam();
    const before = h.probe.angles();
    h.input.hold("KeyA", 1000);
    expect(h.probe.angles().yaw - before.yaw).toBeCloseTo(TURN, 6);
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
    expect(Math.hypot(h.probe.target().x, h.probe.target().z)).toBeCloseTo(TRAVEL * distance, 6);
  });

  it("Space lifts the pivot off the floor and Z lowers it, never below the floor", async () => {
    const h = await freeCam();
    const distance = h.probe.distance();
    h.input.hold("Space", 1000);
    expect(h.probe.target().y).toBeCloseTo(TRAVEL * distance, 6);
    h.input.hold("KeyZ", 3000);
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

  it("losing the pointer lock mid-drag does not end the drag; the release does, and keys still act after", async () => {
    const h = await freeCam();
    h.dom.document.grantPointerLock = true;
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    h.input.pointerMove(410, 300, { buttons: 1 });
    expect(h.dom.document.pointerLockElement).toBe(h.canvas);
    const before = h.probe.angles().yaw;
    h.dom.document.pointerLockElement = null;
    h.dom.document.dispatchEvent(new Event("pointerlockchange"));
    h.input.pointerMove(430, 300, { buttons: 1, movementX: 99 });
    expect(h.probe.angles().yaw - before).toBeCloseTo(-20 * LOOK, 6);
    h.input.pointerUp(430, 300, { button: 0 });
    const released = h.probe.angles().yaw;
    h.input.pointerMove(480, 300);
    expect(h.probe.angles().yaw).toBeCloseTo(released, 9);
    const target = h.probe.target().clone();
    h.input.hold("KeyW", 500);
    expect(h.probe.target().distanceTo(target)).toBeGreaterThan(1);
  });

  it("keys are ignored while typing in a field", async () => {
    const h = await freeCam();
    const field = h.dom.document.createElement("input");
    h.input.hold("KeyW", 500, { target: field });
    expect(h.probe.target().toArray()).toEqual([0, 0, 0]);
  });

  it("Ctrl, Alt or Meta with a key belongs to the page", async () => {
    const h = await freeCam();
    h.input.hold("KeyW", 300, { ctrlKey: true });
    h.input.hold("KeyS", 300, { altKey: true });
    h.input.hold("KeyA", 300, { metaKey: true });
    expect(h.probe.poseLine()).toBe("camera 0,10,20 -> target 0,0,0");
  });

  it("losing window focus releases held keys", async () => {
    const h = await freeCam();
    h.input.keyDown("KeyW");
    h.input.keyDown("KeyA");
    h.frames(10);
    h.input.blurWindow();
    const pose = h.probe.poseLine(6);
    h.frames(30);
    expect(h.probe.poseLine(6)).toBe(pose);
  });
});

describe("free cam on the mobile layout", () => {
  async function mobileFreeCam() {
    const h = await sceneAtOrigin();
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    h.settle();
    return h;
  }

  it("the move pad travels the pivot along the view at the free cam's rate", async () => {
    const h = await mobileFreeCam();
    const distance = h.probe.distance();
    h.scene.setMobileInput(pad({ forward: 1 }));
    h.frames(SECOND);
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    // All 60 frames move: the first one steps a nominal frame (FIRST_FRAME_STEP_S).
    expect(h.probe.target().z).toBeCloseTo(-TRAVEL * distance, 6);
    expect(h.probe.target().x).toBeCloseTo(0, 9);
  });

  it("the look stick turns the camera about the pivot and pitches it", async () => {
    const h = await mobileFreeCam();
    const before = h.probe.angles();
    // A short turn: further round, the camera would swing over the balcony and be lifted onto it.
    h.scene.setMobileInput(pad({ turn: 1 }));
    h.frames(SECOND / 10);
    h.scene.setMobileInput(pad({ pitch: 1 }));
    h.frames(SECOND / 4);
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    const after = h.probe.angles();
    expect(after.yaw - before.yaw).toBeCloseTo(-TURN / 10, 6);
    expect(after.pitch - before.pitch).toBeCloseTo(STICK_PITCH / 4, 6);
    expect(h.probe.target().toArray()).toEqual([0, 0, 0]);
  });

  it("the jump button lifts the pivot", async () => {
    const h = await mobileFreeCam();
    h.scene.setMobileInput(pad({ jump: true }));
    h.frames(SECOND / 2);
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    expect(h.probe.target().y).toBeGreaterThan(1);
  });

  it("one finger orbits (OrbitControls): yaw turns by 2π·dx/height at the mobile rotate speed", async () => {
    const h = await mobileFreeCam();
    const before = h.probe.angles();
    h.input.touchDown(1, 400, 300);
    for (let step = 1; step <= 4; step++) h.input.touchMove(1, 400 + 15 * step, 300);
    h.input.touchUp(1, 460, 300);
    h.settle();
    const after = h.probe.angles();
    // MOBILE_ORBIT_ROTATE_SPEED 0.35 over the 600 px canvas (0.219911 rad),
    // spread over frames by damping. Since chronicle-1982 the loop sleeps once
    // OrbitControls reports the coast has stopped (its own epsilon), which in
    // the harness leaves exactly 0.000150 rad of it unapplied.
    const full = (-2 * Math.PI * 60 / 600) * 0.35;
    expect(after.yaw - before.yaw).toBeCloseTo(-0.219762, 6);
    expect(full - (after.yaw - before.yaw)).toBeCloseTo(-0.00015, 6);
    expect(after.distance).toBeCloseTo(before.distance, 6);
    expect(h.probe.target().toArray()).toEqual([0, 0, 0]);
  });

  it("two fingers pinch to dolly and move together to pan", async () => {
    const h = await mobileFreeCam();
    const before = h.probe.angles();
    // Spread from 100 px to 200 px apart.
    h.input.touchDown(1, 350, 300);
    h.input.touchDown(2, 450, 300);
    for (let step = 1; step <= 4; step++) {
      h.input.touchMove(1, 350 - 12.5 * step, 300);
      h.input.touchMove(2, 450 + 12.5 * step, 300);
    }
    h.input.touchUp(1, 300, 300);
    h.input.touchUp(2, 500, 300);
    h.settle();
    // Twice the spread at MOBILE_ORBIT_ZOOM_SPEED 0.5: the distance shrinks by √2.
    expect(h.probe.angles().distance).toBeCloseTo(before.distance / Math.SQRT2, 6);
    const pivot = h.probe.target().clone();
    const distance = h.probe.distance();
    // Both fingers 40 px right: the ground follows them, the pivot moves left.
    h.input.touchDown(1, 350, 300);
    h.input.touchDown(2, 450, 300);
    for (let step = 1; step <= 4; step++) {
      h.input.touchMove(1, 350 + 10 * step, 300);
      h.input.touchMove(2, 450 + 10 * step, 300);
    }
    h.input.touchUp(1, 390, 300);
    h.input.touchUp(2, 490, 300);
    h.settle();
    expect(h.probe.target().x).toBeLessThan(pivot.x - 0.5);
    expect(h.probe.distance()).toBeCloseTo(distance, 6);
    expect(h.probe.angles().yaw).toBeCloseTo(before.yaw, 6);
  });
});
