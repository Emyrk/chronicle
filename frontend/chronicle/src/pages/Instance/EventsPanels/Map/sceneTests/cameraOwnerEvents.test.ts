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

/** Records the owner changes from now on (subscribing reports the owner it starts from, checked and dropped here). */
function record(h: TestScene): CameraOwner[] {
  const owners: CameraOwner[] = [];
  h.scene.setOnCameraOwnerChange((owner) => owners.push(owner));
  expect(owners).toEqual([h.scene.cameraOwner()]);
  owners.length = 0;
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

// chronicle-2020: the report the host's Follow button and its way back read.
describe("the owner report stays honest", () => {
  it("subscribing reports the owner it starts from", async () => {
    const flat = await createTestScene({ mesh: false });
    const seen: CameraOwner[] = [];
    flat.scene.setOnCameraOwnerChange((owner) => seen.push(owner));
    expect(seen).toEqual(["free"]);
    const { h } = await fightScene();
    h.scene.setOnCameraOwnerChange((owner) => seen.push(owner));
    expect(seen).toEqual(["free", "director"]);
  });

  it("a look-around drag, an A/D turn and the mobile turn stick take it, though only some report a viewport", async () => {
    const reported: number[] = [];
    for (const look of [
      (h: TestScene) => h.input.drag(0, 40, 0),
      (h: TestScene) => {
        h.input.hover();
        h.input.hold("KeyA", 300);
      },
      (h: TestScene) => h.scene.setMobileInput({ ...IDLE_MOBILE_MAP_INPUT, turn: 1 }),
    ]) {
      const { h, owners } = await fightScene();
      look(h);
      h.frames(5);
      expect(owners).toEqual(["free"]);
      reported.push(h.events.userViewports.length);
    }
    // Here the A/D turn and the stick turn the camera with no viewport report
    // at all: the host's framing never hears of them, so only the owner
    // report can tell (a drag's report depends on where the orbit leaves the
    // centre of view).
    expect(reported).toEqual([1, 0, 0]);
  });

  it("on the tiles the follow camera's own viewport tweens stay with it; a viewer's drag takes it", async () => {
    const h = await createTestScene({ mesh: false, units: FIGHT, director: BOSS });
    const owners = record(h);
    expect(owners).toEqual([]);
    expect(h.scene.cameraOwner()).toBe("director");
    // The whole run's follow grid moving on.
    h.scene.setViewport({ centerX: 0.4, centerY: 0.5, zoom: 2 }, 250);
    h.settle();
    h.scene.setViewport({ centerX: 0.45, centerY: 0.5, zoom: 2 }, 250);
    h.settle();
    expect(owners).toEqual([]);
    h.input.drag(0, 40, 0);
    expect(owners).toEqual(["free"]);
  });

  it("a viewport tween still running when the Director takes over reports the Director, which writes after it", async () => {
    const h = await createTestScene({ units: FIGHT });
    const owners = record(h);
    h.scene.setViewport({ centerX: 0.3, centerY: 0.3, zoom: 3 }, 500);
    expect(h.scene.cameraOwner()).toBe("tween");
    h.scene.setDirector({ bossGuids: BOSS });
    h.settle();
    expect(owners).toEqual(["tween", "director"]);
  });

  it("a floor change (the mesh swapped out and back) does not hand a taken camera back", async () => {
    const { h, owners } = await fightScene();
    h.input.drag(0, 40, 0);
    h.settle();
    h.scene.setDungeonMesh(null);
    expect(await h.loadMesh()).toBe("ready");
    h.settle();
    expect(owners).toEqual(["free"]);
    const pose = h.probe.poseLine();
    h.frames(30);
    expect(h.probe.poseLine()).toBe(pose);
  });

  it("the follow camera's new settings (another boss) keep a taken camera; turning it off and on hands it back", async () => {
    const { h, owners } = await fightScene();
    h.input.drag(0, 40, 0);
    h.scene.setDirector({ bossGuids: new Set(["p1"]) });
    h.settle();
    expect(owners).toEqual(["free"]);
    h.scene.setDirector(null);
    h.scene.setDirector({ bossGuids: BOSS });
    expect(owners).toEqual(["free", "director"]);
  });

  it("a host acting on the report from its callback gets the reports in order, without recursion", async () => {
    const { h } = await fightScene();
    const seen: string[] = [];
    let depth = 0;
    h.scene.setOnCameraOwnerChange((owner) => {
      depth++;
      seen.push(`${owner}@${depth}`);
      // Hands it straight back (a host re-rendering into a viewport request).
      if (owner === "free") h.scene.setViewport({ centerX: 0.5, centerY: 0.5, zoom: 2 });
      depth--;
    });
    seen.length = 0;
    h.input.drag(0, 40, 0);
    expect(seen).toEqual(["free@1", "director@1"]);
    expect(h.scene.cameraOwner()).toBe("director");
  });
});

describe("taken from the follow camera (the host's way back)", () => {
  /** Records (owner, taken) reports from now on, past the one subscribing gives. */
  function recordTaken(h: TestScene): string[] {
    const reports: string[] = [];
    h.scene.setOnCameraOwnerChange((owner, taken) => reports.push(`${owner}${taken ? " (taken)" : ""}`));
    reports.length = 0;
    return reports;
  }

  it("every way of taking the camera while following marks it taken", async () => {
    const takes: [string, (h: TestScene) => void][] = [
      ["look-around drag", (h) => h.input.drag(0, 40, 0)],
      ["wheel", (h) => h.input.wheel(-100)],
      ["key", (h) => {
        h.input.hover();
        h.input.keyDown("KeyW");
      }],
      ["mobile pad", (h) => h.scene.setMobileInput({ ...IDLE_MOBILE_MAP_INPUT, forward: 1 })],
      ["mobile stick", (h) => h.scene.setMobileInput({ ...IDLE_MOBILE_MAP_INPUT, turn: 1 })],
      ["top-down", (h) => h.scene.resetCamera(true)],
      ["double-click", (h) => {
        const at = h.screenOf(6, 0, 12);
        h.input.doubleClick(at.x, at.y);
      }],
      ["walk mode", (h) => h.scene.setWalking(true)],
    ];
    for (const [name, take] of takes) {
      const { h } = await fightScene();
      expect(h.scene.cameraTaken(), name).toBe(false);
      take(h);
      h.frames(3);
      expect(h.scene.cameraTaken(), name).toBe(true);
      expect(h.scene.cameraOwner(), name).not.toBe("director");
    }
  });

  it("every hand-back clears it: Follow (a viewport request), a cut, following a unit", async () => {
    const handBacks: [string, (h: TestScene) => void][] = [
      ["viewport", (h) => h.scene.setViewport({ centerX: 0.5, centerY: 0.5, zoom: 2 })],
      ["cut", (h) => h.scene.cutDirector()],
      ["follow a unit", (h) => h.scene.followUnit("p1")],
    ];
    for (const [name, handBack] of handBacks) {
      const { h } = await fightScene();
      const reports = recordTaken(h);
      h.input.drag(0, 40, 0);
      handBack(h);
      expect(reports, name).toEqual(["free (taken)", "director"]);
    }
  });

  it("turning the follow camera off after a take keeps it taken; turning it on hands back", async () => {
    const { h } = await fightScene();
    const reports = recordTaken(h);
    h.input.drag(0, 40, 0);
    h.scene.setDirector(null);
    h.scene.setDirector({ bossGuids: BOSS });
    expect(reports).toEqual(["free (taken)", "director"]);
  });

  it("first load, a mesh swap, a host's pose and a take after the follow camera was turned off are not taken", async () => {
    const { h } = await fightScene();
    const reports = recordTaken(h);
    h.scene.setDungeonMesh(null);
    expect(await h.loadMesh()).toBe("ready");
    h.settle();
    h.scene.applyCameraPose({ position: [0, 20, 30], target: [0, 0, 0] });
    h.scene.setViewport({ centerX: 0.5, centerY: 0.5, zoom: 2 });
    // A pinned Fit: the host turns the follow camera off, then the viewer drags.
    h.scene.setDirector(null);
    h.input.drag(0, 40, 0);
    expect(reports).toEqual(["scripted", "director", "free"]);
    expect(h.scene.cameraTaken()).toBe(false);
  });

  it("a view request while walking moves the character and keeps walk mode; out of walk mode first, it hands the camera back (why Follow leaves walk mode)", async () => {
    const { h } = await fightScene();
    const reports = recordTaken(h);
    h.scene.setWalking(true);
    h.scene.setViewport({ centerX: 0.5, centerY: 0.5, zoom: 2 });
    expect(h.scene.cameraOwner()).toBe("walk");
    h.scene.setWalking(false);
    h.scene.setViewport({ centerX: 0.5, centerY: 0.5, zoom: 2 });
    expect(reports).toEqual(["walk (taken)", "free (taken)", "director"]);
  });

  it("a jump's cut with the follow camera off does nothing; turned back on, then the view and the cut (MapView3D's order), it cuts on the follow camera", async () => {
    const { h } = await fightScene();
    const reports = recordTaken(h);
    h.input.hover();
    h.input.hold("KeyA", 300);
    // The host released the framing on the take: the follow camera is off.
    h.scene.setDirector(null);
    h.settle();
    const pose = h.probe.poseLine();
    h.scene.cutDirector();
    h.frames(5);
    expect(h.probe.poseLine()).toBe(pose);
    expect(reports).toEqual(["free (taken)"]);
    // A jump chip now hands back first: the Director on, the view request, then the cut.
    h.scene.setDirector({ bossGuids: BOSS });
    h.scene.setViewport({ centerX: 0.5, centerY: 0.5, zoom: 2 });
    h.scene.cutDirector();
    h.frame();
    expect(reports).toEqual(["free (taken)", "director"]);
    // A cut snaps: the next frame holds the shot (no spring left to run).
    const cut = h.probe.poseLine();
    h.frame();
    expect(h.probe.poseLine()).toBe(cut);
    expect(cut).not.toBe(pose);
  });
});

