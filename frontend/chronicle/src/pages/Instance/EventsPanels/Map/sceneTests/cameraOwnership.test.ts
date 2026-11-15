import { describe, expect, it } from "vitest";
import { createTestScene, testUnit } from "./createTestScene";
import { mapPointAt } from "./syntheticDungeon";

// Characterisation (chronicle-1967): who owns the camera after each handoff,
// as MapScene3D does it today. See README.md before changing an expectation.

const BOSS = new Set(["boss"]);
const FIGHT = [
  testUnit("boss", 0, 0, { kind: "hostile", boss: true }),
  testUnit("p1", 5, 5),
  testUnit("p2", -5, 8),
];

async function fightScene() {
  const h = await createTestScene({ units: FIGHT, director: BOSS });
  expect(h.probe.owner()).toBe("director");
  return h;
}

describe("camera ownership with the Director running", () => {
  it("the Director has the camera once the mesh loads, on its first shot", async () => {
    const h = await fightScene();
    expect(h.probe.director()).toEqual({ paused: false, running: true, subject: null });
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera 0,8.709,21.439 -> target 0,0,5.06"`);
  });

  it("a left-drag past the click slop takes it", async () => {
    const h = await fightScene();
    const before = h.probe.angles();
    h.input.drag(0, 40, 0);
    expect(h.probe.owner()).toBe("user");
    expect(h.probe.director()).toEqual({ paused: true, running: false, subject: null });
    // The move that crosses the 5 px slop starts the drag and is not looked with: 30 of the 40 px turn the view.
    expect(h.probe.angles().yaw - before.yaw).toBeCloseTo(-30 * 0.006, 6);
    expect(h.probe.angles().distance).toBeCloseTo(before.distance, 6);
  });

  it("a left press that stays within the click slop leaves it with the Director", async () => {
    const h = await fightScene();
    h.input.drag(0, 4, 0);
    expect(h.probe.owner()).toBe("director");
  });

  it("a right-drag takes it", async () => {
    const h = await fightScene();
    h.input.drag(2, 0, 40);
    expect(h.probe.owner()).toBe("user");
  });

  it("a middle-drag (OrbitControls' pan) takes it and moves the pivot", async () => {
    const h = await fightScene();
    const before = h.probe.target().clone();
    h.input.drag(1, 60, 0);
    expect(h.probe.owner()).toBe("user");
    expect(h.probe.target().distanceTo(before)).toBeGreaterThan(1);
  });

  it("a wheel tick takes it and zooms from the current distance", async () => {
    const h = await fightScene();
    const before = h.probe.distance();
    h.input.wheel(-100);
    expect(h.probe.owner()).toBe("user");
    expect(h.probe.distance()).toBeCloseTo(before * Math.exp(-100 * 0.0015), 3);
  });

  it("a movement key takes it while the pointer is over the map", async () => {
    const h = await fightScene();
    h.input.hover();
    h.input.keyDown("KeyW");
    expect(h.probe.owner()).toBe("user");
    expect(h.probe.heldActions()).toEqual(["forward"]);
  });

  it("a movement key with the pointer off the map does nothing", async () => {
    const h = await fightScene();
    h.input.keyDown("KeyW");
    expect(h.probe.owner()).toBe("director");
    expect(h.probe.heldActions()).toEqual([]);
  });

  it("a viewport request (Follow, an encounter jump) hands it back", async () => {
    const h = await fightScene();
    h.input.drag(0, 40, 0);
    h.scene.setViewport({ centerX: 0.5, centerY: 0.5, zoom: 2 }, 500);
    expect(h.probe.owner()).toBe("director");
    expect(h.probe.director()).toEqual({ paused: false, running: true, subject: null });
    h.settle();
    expect(h.probe.owner()).toBe("director");
  });

  it("a cut hands it back", async () => {
    const h = await fightScene();
    h.input.wheel(-100);
    h.scene.cutDirector();
    expect(h.probe.owner()).toBe("director");
    expect(h.probe.director().running).toBe(true);
  });

  it("following a unit hands it back on that unit; following nobody returns to the group", async () => {
    const h = await fightScene();
    h.input.drag(0, 40, 0);
    h.scene.followUnit("p2");
    expect(h.probe.owner()).toBe("director");
    expect(h.probe.director().subject).toBe("p2");
    expect(h.events.follow).toEqual(["p2"]);
    h.scene.followUnit(null);
    expect(h.probe.director().subject).toBeNull();
    expect(h.events.follow).toEqual(["p2", null]);
  });

  it("a new focus alone does not hand it back", async () => {
    const h = await fightScene();
    h.input.drag(0, 40, 0);
    h.scene.setFocus({ centre: mapPointAt(0, 0), zoom: 2 });
    expect(h.probe.owner()).toBe("user");
  });

  it("taking the camera drops a followed unit", async () => {
    const h = await fightScene();
    h.scene.followUnit("p1");
    h.input.drag(0, 40, 0);
    expect(h.probe.director().subject).toBeNull();
    expect(h.events.follow).toEqual(["p1", null]);
  });

  it("a double-click on a unit hands the Director that unit", async () => {
    const h = await fightScene();
    h.input.drag(0, 40, 0);
    h.settle();
    const p1 = h.probe.unit("p1")!.base;
    const at = h.screenOf(p1.x, p1.y, p1.z);
    h.input.doubleClick(at.x, at.y);
    expect(h.probe.owner()).toBe("director");
    expect(h.probe.director()).toEqual({ paused: false, running: true, subject: "p1" });
  });

  it("a double-click on the floor eases the camera there and leaves it with the user", async () => {
    const h = await fightScene();
    const before = h.probe.distance();
    const at = h.screenOf(6, 0, 12);
    h.input.doubleClick(at.x, at.y);
    expect(h.probe.owner()).toBe("double-click");
    expect(h.probe.director()).toEqual({ paused: true, running: false, subject: null });
    h.settle();
    expect(h.probe.owner()).toBe("user");
    // The pivot lands on the floor point clicked, at half the distance (never under 10 yards).
    const target = h.probe.target();
    expect(target.x).toBeCloseTo(6, 1);
    expect(target.y).toBeCloseTo(0, 6);
    expect(target.z).toBeCloseTo(12, 1);
    expect(h.probe.distance()).toBeCloseTo(Math.max(10, before / 2), 3);
  });

  it("a shift+double-click on the floor pulls back to twice the distance", async () => {
    const h = await fightScene();
    const before = h.probe.distance();
    const at = h.screenOf(-4, 0, 12);
    h.input.doubleClick(at.x, at.y, { shiftKey: true });
    h.settle();
    expect(h.probe.distance()).toBeCloseTo(before * 2, 3);
  });

  it("top-down takes it and looks straight down", async () => {
    const h = await fightScene();
    h.scene.resetCamera(true);
    expect(h.probe.owner()).toBe("user");
    expect(h.probe.director()).toEqual({ paused: true, running: false, subject: null });
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera 0,113.358,0 -> target 0,0,0"`);
  });

  it("an angled reset does not take it from the Director", async () => {
    const h = await fightScene();
    h.scene.resetCamera(false);
    expect(h.probe.director().paused).toBe(false);
  });

  it("walk mode takes it; leaving walk mode leaves it with the user", async () => {
    const h = await fightScene();
    h.input.hover();
    h.input.keyDown("KeyG");
    expect(h.probe.owner()).toBe("walk");
    expect(h.events.walk).toEqual([true]);
    expect(h.probe.director()).toEqual({ paused: true, running: false, subject: null });
    h.frames(5);
    h.input.keyDown("Escape");
    expect(h.probe.owner()).toBe("user");
    expect(h.events.walk).toEqual([true, false]);
    // The free cam picks up 30 yards out, behind and above where the character stood.
    expect(h.probe.distance()).toBeCloseTo(30, 3);
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera 0,10.287,33.241 -> target 0,0,5.06"`);
  });

  it("a viewport request while walking moves the character, not the camera owner", async () => {
    const h = await fightScene();
    h.scene.setWalking(true);
    h.scene.setViewport({ centerX: 0.3, centerY: 0.5, zoom: 2 });
    expect(h.probe.owner()).toBe("walk");
    expect(h.probe.walk()!.position.x).toBeCloseTo(-20, 6);
  });

  it("following a unit while walking leaves walk mode for the Director", async () => {
    const h = await fightScene();
    h.scene.setWalking(true);
    h.scene.followUnit("p1");
    expect(h.probe.owner()).toBe("director");
    expect(h.events.walk).toEqual([true, false]);
  });

  it("an applied camera pose (camera marks, authored paths) takes it", async () => {
    const h = await fightScene();
    h.scene.applyCameraPose({ position: [0, 20, 30], target: [0, 0, 0] });
    expect(h.probe.owner()).toBe("user");
    expect(h.probe.pose()).toEqual({ position: [0, 20, 30], target: [0, 0, 0] });
  });

  it("a plain click reports a user viewport (OrbitControls ends a gesture that never started)", async () => {
    const h = await fightScene();
    h.input.click();
    expect(h.probe.owner()).toBe("director");
    expect(h.events.userViewports).toHaveLength(1);
  });
});

describe("camera ownership without the Director", () => {
  it("the flat ground starts on the angled full-map framing, owned by the user", async () => {
    const h = await createTestScene({ mesh: false });
    expect(h.probe.owner()).toBe("user");
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera 0,85,75 -> target 0,0,0"`);
  });

  it("a timed viewport request tweens, then leaves the camera with the user", async () => {
    const h = await createTestScene({ mesh: false });
    h.scene.setViewport({ centerX: 0.25, centerY: 0.25, zoom: 4 }, 300);
    expect(h.probe.owner()).toBe("view-tween");
    h.settle();
    expect(h.probe.owner()).toBe("user");
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera -25,21.25,-6.25 -> target -25,0,-25"`);
  });

  it("a double-click on a unit eases toward it rather than following it", async () => {
    const h = await createTestScene({ units: FIGHT });
    const p1 = h.probe.unit("p1")!.base;
    const at = h.screenOf(p1.x, p1.y, p1.z);
    h.input.doubleClick(at.x, at.y);
    expect(h.probe.owner()).toBe("double-click");
    expect(h.events.follow).toEqual([]);
  });
});
