import { describe, expect, it } from "vitest";
import { createTestScene, testUnit, type TestScene } from "./createTestScene";

// Characterisation (chronicle-1967): when the render loop runs. A frame is
// queued with requestAnimationFrame and queues the next one only while
// renderFrame reports something moving. Until chronicle-1982 an interactive
// scene's loop never went idle (the idle mobile input's `jump: false` counted
// as input); these tests pin the fixed loop.

/** An interactive scene, run until the loop sleeps. */
async function idleScene(): Promise<TestScene> {
  const h = await createTestScene({ units: [testUnit("p1", 0, 0)] });
  h.runUntilIdle();
  expect(h.awake).toBe(false);
  return h;
}

/** Asserts the scene is awake now and sleeps again within `max` frames; returns the frames it took. */
function wakesThenSleeps(h: TestScene, max = 3000): number {
  expect(h.awake).toBe(true);
  const ran = h.runUntilIdle(max);
  expect(h.awake).toBe(false);
  return ran;
}

describe("render on demand: an idle interactive scene", () => {
  it("stops its loop once nothing happens, and draws nothing more", async () => {
    const h = await createTestScene({ units: [testUnit("p1", 0, 0)] });
    // Already asleep once the camera settled after setup.
    expect(h.awake).toBe(false);
    const before = h.renders.count;
    h.frames(600);
    expect(h.renders.count - before).toBe(0);
  });

  it("the same on the flat ground, without a mesh", async () => {
    const h = await createTestScene({ mesh: false });
    expect(h.runUntilIdle(200)).toBeLessThan(200);
    h.frames(100);
    expect(h.awake).toBe(false);
  });

  it("on the mobile layout too: the idle pad and stick are no input", async () => {
    const h = await createTestScene({ units: [testUnit("p1", 0, 0)] });
    h.scene.setMobileInput({ forward: 0, strafe: 0, turn: 0, pitch: 0, jump: false });
    expect(h.runUntilIdle(200)).toBeLessThan(200);
    // The pad keeps it awake while held, and lets it sleep when released.
    h.scene.setMobileInput({ forward: 1, strafe: 0, turn: 0, pitch: 0, jump: false });
    h.frames(30);
    expect(h.awake).toBe(true);
    h.scene.setMobileInput({ forward: 0, strafe: 0, turn: 0, pitch: 0, jump: false });
    expect(h.runUntilIdle(200)).toBeLessThan(200);
    expect(h.awake).toBe(false);
  });

  it("a capture scene never queues a frame: it draws only in captureFrame", async () => {
    const h = await createTestScene({ capture: { width: 320, height: 180 }, settle: false });
    expect(h.awake).toBe(false);
    expect(h.renders.count).toBe(0);
    h.scene.setEffectClock(1000, true, 1);
    h.scene.setUnits([testUnit("p1", 0, 0)]);
    expect(h.awake).toBe(false);
    h.scene.captureFrame({ position: [0, 20, 30], target: [0, 0, 0] }, 1000);
    expect(h.renders.count).toBe(1);
    expect(h.awake).toBe(false);
  });
});

describe("render on demand: what wakes it", () => {
  it("the loop goes idle when nothing moves and draws nothing more", async () => {
    const h = await idleScene();
    const before = h.renders.count;
    h.frames(30);
    expect(h.renders.count).toBe(before);
  });

  it("a clock tick wakes it for one frame, playing or paused, when nothing animates", async () => {
    const h = await idleScene();
    h.scene.setEffectClock(5000, false, 1);
    expect(wakesThenSleeps(h)).toBe(1);
    // A playing clock with no effects to show does not keep it awake either.
    h.scene.setEffectClock(5000, true, 1);
    expect(wakesThenSleeps(h)).toBe(1);
  });

  it("new unit positions wake it for one frame", async () => {
    const h = await idleScene();
    h.scene.setUnits([testUnit("p1", 3, 0)]);
    expect(wakesThenSleeps(h)).toBe(1);
  });

  it("a resize wakes it for one frame", async () => {
    const h = await idleScene();
    h.fireResize();
    expect(wakesThenSleeps(h)).toBe(1);
  });

  it("input wakes it: the pointer moving over the map, a wheel tick, a drag", async () => {
    const h = await idleScene();
    h.input.hover();
    expect(wakesThenSleeps(h)).toBe(1);
    h.input.wheel(-100);
    expect(wakesThenSleeps(h)).toBe(1);
    h.input.drag(0, 40, 0);
    expect(wakesThenSleeps(h)).toBe(1);
  });

  it("a held movement key keeps it awake until released", async () => {
    const h = await idleScene();
    h.input.hover();
    h.runUntilIdle();
    h.input.keyDown("KeyW");
    expect(h.awake).toBe(true);
    h.frames(60);
    expect(h.awake).toBe(true);
    h.input.keyUp("KeyW");
    expect(wakesThenSleeps(h)).toBe(1);
  });

  it("a timed viewport request keeps it awake for the tween, then it sleeps", async () => {
    const h = await idleScene();
    h.scene.setViewport({ centerX: 0.4, centerY: 0.5, zoom: 2 }, 300);
    // 300 ms is 18 frames at 60 fps; the frames that finish the tween and settle the camera add two.
    expect(wakesThenSleeps(h)).toBe(20);
  });

  it("walk mode keeps it awake every frame; leaving walk mode lets it sleep", async () => {
    const h = await idleScene();
    h.scene.setWalking(true);
    h.frames(120);
    expect(h.awake).toBe(true);
    h.scene.setWalking(false);
    expect(wakesThenSleeps(h)).toBe(1);
  });

  it("the Director keeps it awake while it moves the camera, then lets it sleep once the shot holds", async () => {
    const h = await idleScene();
    h.scene.setDirector({ bossGuids: new Set() });
    h.frames(60);
    expect(h.awake).toBe(true);
    expect(wakesThenSleeps(h)).toBeGreaterThan(0);
  });

  it("after dispose nothing wakes it", async () => {
    const h = await idleScene();
    h.dispose();
    h.scene.setEffectClock(5000, true, 1);
    h.scene.setUnits([testUnit("p1", 3, 0)]);
    expect(h.awake).toBe(false);
  });
});

// chronicle-1982 review: every clock that steps from its last frame starts
// again when the loop sleeps, so the first frame after a wake takes a
// first-frame step (1/60 s), not one capped 0.1 s step for the whole sleep.
describe("render on demand: the first frame after a sleep", () => {
  const FIGHT = [testUnit("boss", 0, 0, { kind: "hostile", boss: true }), testUnit("p1", 5, 5), testUnit("p2", -5, 8)];

  it("the Director eases off from rest: the first frame moves the camera less than the second", async () => {
    const h = await createTestScene({ units: FIGHT, director: new Set(["boss"]) });
    expect(h.probe.owner()).toBe("director");
    h.runUntilIdle();
    // Asleep for two seconds, then the boss and the group move 30 units.
    h.clock.advance(2000);
    h.scene.setUnits(FIGHT.map((unit) => testUnit(unit.guid, (unit.point.leftPercent - 50) + 30, unit.point.topPercent - 50, { kind: unit.kind, boss: unit.boss })));
    const steps: number[] = [];
    let last = h.probe.target().clone();
    for (let frame = 0; frame < 3; frame++) {
      h.frame();
      steps.push(h.probe.target().distanceTo(last));
      last = h.probe.target().clone();
    }
    expect(steps[0]).toBeGreaterThan(0);
    expect(steps[0]).toBeLessThan(steps[1]);
    expect(steps[1]).toBeLessThan(steps[2]);
  });

  it("another participant's presence eases by one frame's step, not by the whole sleep", async () => {
    const h = await createTestScene();
    const ground = h.probe.mesh()!.url;
    h.scene.setRemotePresences(new Map([["x", { ground, mode: "walk", position: [0, 0, 0], target: [0, 0, -1] }]]) as never);
    h.runUntilIdle();
    h.clock.advance(2000);
    h.scene.setRemotePresences(new Map([["x", { ground, mode: "walk", position: [10, 0, 0], target: [10, 0, -1] }]]) as never);
    h.frame();
    // PRESENCE_EASE_PER_S 12 over one 1/60 s step.
    expect(h.probe.remotePresence("x")!.x).toBeCloseTo(10 * (1 - Math.exp(-12 / 60)), 6);
  });

  it("the target-line dash advances by one frame's step on the first frame, as on every other", async () => {
    const h = await createTestScene({ units: FIGHT });
    h.scene.setUnitRoles({ selected: "p1", target: "boss", targetsTarget: null, pinned: new Set() });
    h.runUntilIdle();
    expect(h.probe.targetLineDashes().length).toBeGreaterThan(0);
    h.clock.advance(2000);
    // A held key keeps frames coming, so the first frame can be compared with the next.
    h.input.hover();
    h.input.keyDown("KeyW");
    const dashes: number[] = [h.probe.targetLineDashes()[0]!];
    for (let frame = 0; frame < 2; frame++) {
      h.frame();
      dashes.push(h.probe.targetLineDashes()[0]!);
    }
    const first = dashes[1]! - dashes[0]!;
    const second = dashes[2]! - dashes[1]!;
    expect(first).not.toBe(0);
    expect(first).toBeCloseTo(second, 9);
  });
});
