import { describe, expect, it } from "vitest";
import type { CameraOwner } from "../cameraArbiter";
import { IDLE_MOBILE_MAP_INPUT } from "../mapControls";
import { createTestScene, testUnit, type TestScene } from "./createTestScene";
import { mapPointAt } from "./syntheticDungeon";

// chronicle-1987: the observable camera owner (cameraOwner() and
// setOnCameraOwnerChange), for every transition cameraOwnership.test.ts pins.

const BOSS = new Set(["boss"]);
const FIGHT = [
  testUnit("boss", 0, 0, { kind: "hostile", boss: true }),
  testUnit("p1", 5, 5),
  testUnit("p2", -5, 8),
];

/** Records the owner changes from now on. */
function record(h: TestScene): CameraOwner[] {
  const owners: CameraOwner[] = [];
  h.scene.setOnCameraOwnerChange((owner) => owners.push(owner));
  return owners;
}

async function fightScene() {
  const h = await createTestScene({ units: FIGHT, director: BOSS });
  expect(h.scene.cameraOwner()).toBe("director");
  return { h, owners: record(h) };
}

describe("camera owner changes with the Director running", () => {
  it("a drag past the click slop, a right-drag, a middle-drag or a one-finger touch take it for the free cam", async () => {
    for (const gesture of [
      (h: TestScene) => h.input.drag(0, 40, 0),
      (h: TestScene) => h.input.drag(2, 0, 40),
      (h: TestScene) => h.input.drag(1, 60, 0),
      (h: TestScene) => {
        h.input.touchDown(1, 400, 300);
        h.input.touchMove(1, 430, 300);
        h.input.touchMove(1, 460, 300);
        h.input.touchUp(1, 460, 300);
      },
    ]) {
      const { h, owners } = await fightScene();
      gesture(h);
      expect(owners).toEqual(["free"]);
      expect(h.scene.cameraOwner()).toBe("free");
    }
  });

  it("a press within the click slop, a plain click, a key off the map or the idle pad change nothing", async () => {
    const { h, owners } = await fightScene();
    // The key first: the press and the click below move the pointer over the map.
    h.input.keyDown("KeyW");
    h.input.drag(0, 4, 0);
    h.input.click();
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    h.frames(10);
    expect(owners).toEqual([]);
  });

  it("a wheel tick, a movement key over the map and the mobile pad take it", async () => {
    for (const take of [
      (h: TestScene) => h.input.wheel(-100),
      (h: TestScene) => {
        h.input.hover();
        h.input.keyDown("KeyW");
      },
      (h: TestScene) => h.scene.setMobileInput({ ...IDLE_MOBILE_MAP_INPUT, forward: 1 }),
    ]) {
      const { h, owners } = await fightScene();
      take(h);
      expect(owners).toEqual(["free"]);
    }
  });

  it("a viewport request, a cut and a follow hand it back; following nobody keeps the Director", async () => {
    const { h, owners } = await fightScene();
    h.input.drag(0, 40, 0);
    h.scene.setViewport({ centerX: 0.5, centerY: 0.5, zoom: 2 }, 500);
    h.input.wheel(-100);
    h.scene.cutDirector();
    h.input.drag(0, 40, 0);
    h.scene.followUnit("p2");
    h.scene.followUnit(null);
    expect(owners).toEqual(["free", "director", "free", "director", "free", "director"]);
  });

  it("a new focus alone does not hand it back", async () => {
    const { h, owners } = await fightScene();
    h.input.drag(0, 40, 0);
    h.scene.setFocus({ centre: mapPointAt(0, 0), zoom: 2 });
    expect(owners).toEqual(["free"]);
  });

  it("a double-click on a unit hands it to the Director", async () => {
    const { h, owners } = await fightScene();
    h.input.drag(0, 40, 0);
    h.settle();
    const p1 = h.probe.unit("p1")!.base;
    const at = h.screenOf(p1.x, p1.y, p1.z);
    h.input.doubleClick(at.x, at.y);
    expect(owners).toEqual(["free", "director"]);
  });

  it("a double-click on the floor runs a move, then leaves it with the free cam", async () => {
    const { h, owners } = await fightScene();
    const at = h.screenOf(6, 0, 12);
    h.input.doubleClick(at.x, at.y);
    expect(h.scene.cameraOwner()).toBe("tween");
    h.settle();
    expect(owners).toEqual(["tween", "free"]);
  });

  it("top-down takes it; an angled reset does not", async () => {
    const { h, owners } = await fightScene();
    h.scene.resetCamera(false);
    expect(owners).toEqual([]);
    h.scene.resetCamera(true);
    expect(owners).toEqual(["free"]);
  });

  it("walk mode takes it; leaving walk mode leaves it with the free cam; following a unit while walking goes to the Director", async () => {
    const { h, owners } = await fightScene();
    h.input.hover();
    h.input.keyDown("KeyG");
    // A viewport request while walking moves the character: no change.
    h.scene.setViewport({ centerX: 0.3, centerY: 0.5, zoom: 2 });
    h.input.keyDown("Escape");
    h.scene.setWalking(true);
    h.scene.followUnit("p1");
    expect(owners).toEqual(["walk", "free", "walk", "director"]);
  });

  it("an applied camera pose holds it as scripted", async () => {
    const { h, owners } = await fightScene();
    h.scene.applyCameraPose({ position: [0, 20, 30], target: [0, 0, 0] });
    expect(owners).toEqual(["scripted"]);
    // The user's free cam takes it from the pose like any gesture.
    h.input.wheel(-100);
    expect(owners).toEqual(["scripted", "free"]);
  });
});

describe("camera owner changes without the Director", () => {
  it("the flat ground starts with the free cam", async () => {
    const h = await createTestScene({ mesh: false });
    expect(h.scene.cameraOwner()).toBe("free");
  });

  it("a timed viewport request tweens, then leaves it with the free cam", async () => {
    const h = await createTestScene({ mesh: false });
    const owners = record(h);
    h.scene.setViewport({ centerX: 0.25, centerY: 0.25, zoom: 4 }, 300);
    expect(h.scene.cameraOwner()).toBe("tween");
    h.settle();
    expect(owners).toEqual(["tween", "free"]);
  });

  it("a double-click on a unit eases toward it, then leaves it with the free cam", async () => {
    const h = await createTestScene({ units: FIGHT });
    const owners = record(h);
    const p1 = h.probe.unit("p1")!.base;
    const at = h.screenOf(p1.x, p1.y, p1.z);
    h.input.doubleClick(at.x, at.y);
    h.settle();
    expect(owners).toEqual(["tween", "free"]);
  });
});
