import { describe, expect, it } from "vitest";
import { IDLE_MOBILE_MAP_INPUT } from "../mapControls";
import { createTestScene, testUnit, type TestScene } from "./createTestScene";
import { mapPointAt } from "./syntheticDungeon";

// Characterisation (chronicle-1967): who owns the camera after each handoff,
// as MapScene3D does it today. See README.md before changing an expectation.
// Ownership is read only through h.probe.owner(); the followed unit through
// what the scene reports to its host (h.events.follow) and where the camera
// ends up.

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

/** The pivot's ground distance from scene (x, z). */
function pivotFrom(h: TestScene, x: number, z: number) {
  return Math.hypot(h.probe.target().x - x, h.probe.target().z - z);
}

describe("camera ownership with the Director running", () => {
  it("the Director has the camera once the mesh loads, on its first shot", async () => {
    const h = await fightScene();
    expect(h.events.follow).toEqual([]);
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera 0,8.709,21.44 -> target 0,0,5.06"`);
  });

  it("a left-drag past the click slop takes it", async () => {
    const h = await fightScene();
    const before = h.probe.angles();
    h.input.drag(0, 40, 0);
    expect(h.probe.owner()).toBe("user");
    // The move that crosses the 5 px slop starts the drag and is not looked with: 30 of the 40 px turn the view.
    expect(h.probe.angles().yaw - before.yaw).toBeCloseTo(-30 * 0.006, 6);
    expect(h.probe.angles().distance).toBeCloseTo(before.distance, 6);
    // It stays the user's: the Director does not move the camera on later frames.
    const pose = h.probe.poseLine(6);
    h.frames(30);
    expect(h.probe.poseLine(6)).toBe(pose);
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

  it("a one-finger touch drag (OrbitControls' rotate) takes it", async () => {
    const h = await fightScene();
    h.input.touchDown(1, 400, 300);
    h.input.touchMove(1, 430, 300);
    h.input.touchMove(1, 460, 300);
    h.input.touchUp(1, 460, 300);
    expect(h.probe.owner()).toBe("user");
  });

  it("a wheel tick takes it and zooms from the current distance", async () => {
    const h = await fightScene();
    const before = h.probe.distance();
    h.input.wheel(-100);
    expect(h.probe.owner()).toBe("user");
    expect(h.probe.distance()).toBeCloseTo(before * Math.exp(-100 * 0.0015), 3);
  });

  it("a movement key takes it while the pointer is over the map, and moves the pivot", async () => {
    const h = await fightScene();
    const before = h.probe.target().clone();
    h.input.hover();
    h.input.keyDown("KeyW");
    expect(h.probe.owner()).toBe("user");
    h.frames(30);
    expect(h.probe.target().distanceTo(before)).toBeGreaterThan(1);
  });

  it("a movement key with the pointer off the map does nothing", async () => {
    const h = await fightScene();
    const before = h.probe.poseLine();
    h.input.keyDown("KeyW");
    expect(h.probe.owner()).toBe("director");
    h.frames(30);
    expect(h.probe.poseLine()).toBe(before);
  });

  it("the idle mobile pad is no input; the pad takes it like any other input, and releasing it ends the gesture", async () => {
    const h = await fightScene();
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    h.settle();
    expect(h.probe.owner()).toBe("director");
    const before = h.probe.target().clone();
    h.scene.setMobileInput({ ...IDLE_MOBILE_MAP_INPUT, forward: 1 });
    expect(h.probe.owner()).toBe("user");
    h.frames(30);
    expect(h.probe.owner()).toBe("user");
    expect(h.probe.target().distanceTo(before)).toBeGreaterThan(1);
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    // As at the end of a drag that moved the view: the scene reports where the user left it.
    expect(h.events.userViewports).toHaveLength(1);
  });

  it("the look stick takes it too", async () => {
    const h = await fightScene();
    h.scene.setMobileInput({ ...IDLE_MOBILE_MAP_INPUT, turn: 1 });
    expect(h.probe.owner()).toBe("user");
  });

  it("with no input, the free-cam mover leaves the Director's camera alone", async () => {
    const h = await fightScene();
    h.scene.setMobileInput(IDLE_MOBILE_MAP_INPUT);
    // Clock ticks keep frames coming while the Director holds its shot.
    const placed = h.countFreeCamPlacements(() => {
      for (let tick = 0; tick < 30; tick++) {
        h.scene.setEffectClock(1000 + tick * 16, false, 1);
        h.frame();
      }
    });
    expect(h.probe.owner()).toBe("director");
    expect(placed).toBe(0);
  });

  it("a viewport request (Follow, an encounter jump) hands it back", async () => {
    const h = await fightScene();
    h.input.drag(0, 40, 0);
    h.scene.setViewport({ centerX: 0.5, centerY: 0.5, zoom: 2 }, 500);
    expect(h.probe.owner()).toBe("director");
    h.settle();
    expect(h.probe.owner()).toBe("director");
    // Back on the group, from the direction the user's drag left the camera (the Director keeps the user's yaw).
    expect(pivotFrom(h, 0, 5.06)).toBeLessThan(0.5);
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera -2.79,8.709,21.187 -> target 0.142,0,5.073"`);
  });

  it("a cut hands it back", async () => {
    const h = await fightScene();
    h.input.wheel(-100);
    h.scene.cutDirector();
    expect(h.probe.owner()).toBe("director");
  });

  it("following a unit hands it back and frames that unit; following nobody returns to the group", async () => {
    const h = await fightScene();
    h.input.drag(0, 40, 0);
    h.scene.followUnit("p2");
    expect(h.probe.owner()).toBe("director");
    expect(h.events.follow).toEqual(["p2"]);
    h.settle();
    // The shot centres on p2 (-5, 8), from the yaw the drag left.
    expect(pivotFrom(h, -5, 8)).toBeLessThan(1);
    h.scene.followUnit(null);
    expect(h.events.follow).toEqual(["p2", null]);
    h.settle();
    expect(pivotFrom(h, 0, 5.06)).toBeLessThan(0.5);
  });

  it("following a unit with no drag before frames it head-on from the Director's own yaw", async () => {
    const h = await fightScene();
    h.scene.followUnit("p2");
    h.settle();
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera -4.999,8.709,23.579 -> target -4.999,0,7.2"`);
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
    expect(h.events.follow).toEqual(["p1", null]);
  });

  it("a double-click on a unit hands the Director that unit, and the shot moves to it", async () => {
    const h = await fightScene();
    h.input.drag(0, 40, 0);
    h.settle();
    const p1 = h.probe.unit("p1")!.base;
    const at = h.screenOf(p1.x, p1.y, p1.z);
    h.input.doubleClick(at.x, at.y);
    expect(h.probe.owner()).toBe("director");
    expect(h.events.follow).toEqual(["p1"]);
    h.settle();
    expect(pivotFrom(h, 5, 5)).toBeLessThan(1);
  });

  it("a double-click on the floor eases the camera there and leaves it with the user", async () => {
    const h = await fightScene();
    const before = h.probe.distance();
    const at = h.screenOf(6, 0, 12);
    h.input.doubleClick(at.x, at.y);
    expect(h.probe.owner()).toBe("double-click");
    h.settle();
    expect(h.probe.owner()).toBe("user");
    expect(h.events.follow).toEqual([]);
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
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera 0,113.358,0 -> target 0,0,0"`);
  });

  it("an angled reset does not take it from the Director", async () => {
    const h = await fightScene();
    h.scene.resetCamera(false);
    expect(h.probe.owner()).toBe("director");
  });

  it("walk mode takes it; leaving walk mode leaves it with the user", async () => {
    const h = await fightScene();
    h.input.hover();
    h.input.keyDown("KeyG");
    expect(h.probe.owner()).toBe("walk");
    expect(h.events.walk).toEqual([true]);
    h.frames(5);
    h.input.keyDown("Escape");
    expect(h.probe.owner()).toBe("user");
    expect(h.events.walk).toEqual([true, false]);
    // The free cam picks up 30 yards out, behind and above where the character stood.
    expect(h.probe.distance()).toBeCloseTo(30, 3);
    expect(h.probe.poseLine()).toMatchInlineSnapshot(`"camera 0,10.287,33.241 -> target 0,0,5.06"`);
    // The Director does not take it back by itself.
    h.frames(30);
    expect(h.probe.owner()).toBe("user");
  });

  it("a viewport request while walking moves the character, not the camera owner", async () => {
    const h = await fightScene();
    h.scene.setWalking(true);
    h.scene.setViewport({ centerX: 0.3, centerY: 0.5, zoom: 2 });
    expect(h.probe.owner()).toBe("walk");
    h.frame();
    expect(h.probe.avatar()!.position.x).toBeCloseTo(-20, 6);
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
    h.settle();
    expect(h.events.follow).toEqual([]);
    expect(pivotFrom(h, 5, 5)).toBeLessThan(0.5);
  });
});
