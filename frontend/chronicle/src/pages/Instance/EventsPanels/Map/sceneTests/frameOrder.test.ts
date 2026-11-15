import { describe, expect, it } from "vitest";
import { IDLE_MOBILE_MAP_INPUT } from "../mapControls";
import { createTestScene, testUnit } from "./createTestScene";
import { mapPointAt } from "./syntheticDungeon";

// Characterisation (chronicle-1967): the order renderFrame runs its steps in.

const CAMERA_WRITERS = ["updateViewAnimation", "updateCameraMove", "updateDirector", "updateKeyboardCamera", "updateWalk", "controls.update"];

describe("frame order", () => {
  it("runs every step once, camera writers first, then the constraint, effects, tokens, HUD, draw and presence", async () => {
    const h = await createTestScene({ units: [testUnit("p1", 0, 0)], director: new Set() });
    expect(h.traceFrame()).toEqual([
      "updateViewAnimation",
      "updateCameraMove",
      "updateDirector",
      "updateKeyboardCamera",
      "updateWalk",
      "updateRemotePresences",
      "controls.update",
      "constrainCamera",
      "updateEffects",
      "updateWhelpAnimations",
      "updateTokens",
      "updateBars",
      "updateEffectHover",
      "emitCompassYaw",
      "updatePlates",
      "render",
      "emitPresence",
    ]);
  });

  it("constrains the camera after every camera writer", async () => {
    const h = await createTestScene();
    const steps = h.traceFrame();
    const constrain = steps.indexOf("constrainCamera");
    expect(constrain).toBeGreaterThan(-1);
    for (const writer of CAMERA_WRITERS) expect(steps.indexOf(writer)).toBeLessThan(constrain);
  });

  it("updates effects before tokens, bars and plates", async () => {
    const h = await createTestScene();
    const steps = h.traceFrame();
    const effects = steps.indexOf("updateEffects");
    for (const later of ["updateTokens", "updateBars", "updatePlates", "render"]) expect(steps.indexOf(later)).toBeGreaterThan(effects);
  });

  it("skips controls.update() and the orbit constraint while walking", async () => {
    const h = await createTestScene();
    h.scene.setWalking(true);
    const steps = h.traceFrame();
    expect(steps).toContain("updateWalk");
    expect(steps).not.toContain("controls.update");
    expect(steps).not.toContain("constrainCamera");
  });

  it("leaves walking to setWalkCaptureFrame during a walk capture: the frame neither steps it nor runs the orbit steps", async () => {
    const h = await createTestScene();
    h.scene.setWalkCaptureFrame(0, IDLE_MOBILE_MAP_INPUT);
    const steps = h.traceFrame();
    expect(steps).not.toContain("updateWalk");
    expect(steps).not.toContain("controls.update");
    expect(steps).not.toContain("constrainCamera");
  });

  it("the pose the draw sees is already constrained: free-cam travel never leaves the focus's pan radius", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [0, 10, 20], target: [0, 0, 0] });
    h.scene.setFocus({ centre: mapPointAt(0, 0), zoom: 1 });
    h.settle();
    const drawn: number[] = [];
    h.renders.hook = () => drawn.push(Math.hypot(h.probe.target().x, h.probe.target().z));
    h.input.hover();
    h.input.hold("KeyW", 4000, { shiftKey: true });
    // FOCUS_RADIUS_YARDS (80) at one scene unit per yard.
    expect(Math.max(...drawn)).toBeCloseTo(80, 6);
    expect(drawn.every((radius) => radius <= 80 + 1e-9)).toBe(true);
  });

  it("draws exactly once per frame", async () => {
    const h = await createTestScene();
    const before = h.renders.count;
    h.frames(10);
    expect(h.renders.count - before).toBe(10);
  });
});
