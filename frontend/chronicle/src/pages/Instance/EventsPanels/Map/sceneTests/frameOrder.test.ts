import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { IDLE_MOBILE_MAP_INPUT } from "../mapControls";
import { createEncounterEffects, DEFAULT_EFFECT_OPTIONS, type EncounterEffects, type ReplayEffectEvent } from "../replayEffects";
import { createTestScene, testUnit, type TestScene } from "./createTestScene";
import { mapPointAt, ROOM } from "./syntheticDungeon";

// Characterisation (chronicle-1967): the order a frame runs its steps in.
// The observable tests come first: they check what a drawn frame shows and
// survive steps moving between modules. The traced order below them pins
// renderFrame's own calls and fails loudly (traceFrame throws) when a step
// is no longer where the harness looks for it.

const PAN_RADIUS = 80; // FOCUS_RADIUS_YARDS at one scene unit per yard
const EYE = 2; // the collision ray starts this far above the pivot (MESH_PLAYER_HEIGHT_YARDS)
const PADDING = 0.75; // ORBIT_COLLISION_PADDING
const MIN_DISTANCE = 1; // OrbitControls' minDistance: the collision pass never pulls in closer
const WALL = new THREE.Box3(new THREE.Vector3(...ROOM.wall.min), new THREE.Vector3(...ROOM.wall.max));

/**
 * Whether the drawn camera is further out than the collision pass allows:
 * along its line from the pivot (at fight height), no further than PADDING
 * short of the wall, but never closer than MIN_DISTANCE. True means the
 * frame was drawn with a camera writer's pose the constraint had not seen.
 */
function pastTheWall(pivot: THREE.Vector3, camera: THREE.Vector3): boolean {
  const distance = camera.distanceTo(pivot);
  const from = pivot.clone().setY(pivot.y + EYE);
  const ray = new THREE.Ray(from, camera.clone().sub(pivot).normalize());
  const hit = ray.intersectBox(WALL, new THREE.Vector3());
  if (hit === null) return false;
  return distance > Math.max(MIN_DISTANCE, hit.distanceTo(from) - PADDING) + 1e-6;
}

/** Records, at each draw, whether the drawn camera is past where the wall allows. */
function watchDraws(h: TestScene) {
  const draws: boolean[] = [];
  h.renders.hook = () => draws.push(pastTheWall(h.probe.target(), h.probe.camera().position));
  return draws;
}

/** A free cam east of the wall looking west at (30, 0, 0): the wall is not in the way yet. */
async function eastOfTheWall() {
  const h = await createTestScene();
  h.scene.applyCameraPose({ position: [50, 15, 0], target: [30, 0, 0] });
  h.settle();
  expect(pastTheWall(h.probe.target(), h.probe.camera().position)).toBe(false);
  return h;
}

function event(timestampMs: number, kind: ReplayEffectEvent["kind"], source: string, extra: Partial<ReplayEffectEvent> = {}): ReplayEffectEvent {
  return {
    timestampMs, kind, source, target: source, school: 4, amount: 0, overheal: 0, absorbed: 0, effective: 0,
    crit: false, periodic: false, attack: "spell", castTimeMs: 0, spellId: 133, spellName: "Fireball", ...extra,
  };
}

function sceneEffects(fx: EncounterEffects) {
  return {
    mapId: undefined, fx, options: DEFAULT_EFFECT_OPTIONS, resolveColor: (color: string) => color,
    combatTextGuids: null, suppressNameGuids: null, castIcons: null,
  } as unknown as Parameters<TestScene["scene"]["setEffects"]>[0];
}

describe("frame order, as the drawn frame shows it", () => {
  it("the constraint runs after free-cam travel: no drawn frame leaves the focus's pan radius", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [0, 10, 20], target: [0, 0, 0] });
    h.scene.setFocus({ centre: mapPointAt(0, 0), zoom: 1 });
    h.settle();
    const drawn: number[] = [];
    h.renders.hook = () => drawn.push(Math.hypot(h.probe.target().x, h.probe.target().z));
    h.input.hover();
    h.input.hold("KeyW", 4000, { shiftKey: true });
    expect(Math.max(...drawn)).toBeCloseTo(PAN_RADIUS, 6);
    expect(drawn.every((radius) => radius <= PAN_RADIUS + 1e-9)).toBe(true);
  });

  it("the collision pass runs after a view tween: no drawn frame shows the camera past where the wall allows", async () => {
    const h = await eastOfTheWall();
    const draws = watchDraws(h);
    // Re-framing on the origin from the same angle puts the wall between the pivot and the camera.
    h.scene.setViewport({ centerX: 0.5, centerY: 0.5, zoom: 1 }, 300);
    h.settle();
    expect(h.probe.target().x).toBeCloseTo(0, 6);
    // The wall did come between them: the camera ends pulled in, west of the wall's face (x 15).
    expect(h.probe.camera().position.x).toBeLessThan(15);
    expect(draws.length).toBeGreaterThan(10);
    expect(draws.filter(Boolean)).toEqual([]);
  });

  it("the collision pass runs after the wheel's zoom tween: zooming out into the wall never draws past it", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [12, 3, 0], target: [0, 0, 0] });
    h.settle();
    const draws = watchDraws(h);
    for (let tick = 0; tick < 6; tick++) {
      h.input.wheel(200);
      h.frames(5);
    }
    h.settle();
    // At least one draw per tick (the loop sleeps between ticks since chronicle-1982).
    expect(draws.length).toBeGreaterThanOrEqual(6);
    expect(draws.filter(Boolean)).toEqual([]);
    // The wall held it: it wanted to go far further out than the wall allows.
    expect(h.probe.distance()).toBeLessThan(15);
  });

  it("the collision pass runs after a double-click move: a shift+double-click pulling back past the wall never draws past it", async () => {
    // A unit just west of the wall; double-click picks units through the mesh.
    const h = await createTestScene({ units: [testUnit("p1", 5, 0)] });
    h.scene.applyCameraPose({ position: [40, 4, 0], target: [20, 0, 0] });
    h.settle();
    const draws = watchDraws(h);
    // The token's disc floats 0.3 above the floor: aim at its centre, as the camera sees it nearly edge-on.
    const at = h.screenOf(5, 0.3, 0);
    h.input.doubleClick(at.x, at.y, { shiftKey: true });
    expect(h.probe.owner()).toBe("double-click");
    h.settle();
    expect(h.probe.target().x).toBeCloseTo(5, 6);
    // Twice the distance from the unit would put the camera east of the wall; it is held west of it.
    // (On the way the pivot crosses the wall and the camera passes through it: cameraCollision.test.ts.)
    expect(h.probe.camera().position.x).toBeLessThan(15);
    expect(draws.length).toBeGreaterThan(5);
    expect(draws.filter(Boolean)).toEqual([]);
  });

  it("the collision pass runs after the keyboard turn: turning the camera behind the wall never draws past it", async () => {
    const h = await createTestScene();
    h.scene.applyCameraPose({ position: [0, 3, 30], target: [0, 0, 0] });
    h.settle();
    const draws = watchDraws(h);
    h.input.hover();
    // Turning left swings the camera from +z round toward +x, behind the wall.
    h.input.hold("KeyA", 600);
    expect(h.probe.angles().yaw).toBeGreaterThan(1);
    expect(h.probe.distance()).toBeLessThan(20);
    expect(draws.filter(Boolean)).toEqual([]);
  });

  it("effects run before tokens and bars: a cast and a death show in the very frame the clock reaches them", async () => {
    const fx = createEncounterEffects();
    fx.events.push(event(1000, "cast_start", "caster", { castTimeMs: 2000 }));
    fx.deathsByUnit.set("victim", [1000]);
    const health = { current: 50, max: 100, absorb: 0, dead: false };
    const h = await createTestScene({
      units: [testUnit("caster", 0, 0, { bar: true, health }), testUnit("victim", 5, 0, { bar: true, health })],
    });
    h.scene.setEffects(sceneEffects(fx));
    h.scene.setEffectClock(500, false, 1);
    h.frame();
    // Both alive and idle: a backing and a fill each.
    expect(h.probe.barQuads()).toBe(4);
    expect(h.probe.unit("caster")!.castArc).toBe(false);

    const drawn: { quads: number; arc: boolean }[] = [];
    h.renders.hook = () => drawn.push({ quads: h.probe.barQuads(), arc: h.probe.unit("caster")!.castArc });
    h.scene.setEffectClock(1500, false, 1);
    h.frame();
    // The first frame drawn at 1.5 s already shows the cast arc and the victim's dead (backing-only) bar.
    expect(drawn[0]).toEqual({ quads: 3, arc: true });
  });
});

describe("frame order, as renderFrame calls its steps", () => {
  /** The position of `step` in `steps`, failing when it did not run at all. */
  function at(steps: string[], step: string): number {
    expect(steps, `frame step ${step} did not run`).toContain(step);
    return steps.indexOf(step);
  }

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
    const constrain = at(steps, "constrainCamera");
    for (const writer of ["updateViewAnimation", "updateCameraMove", "updateDirector", "updateKeyboardCamera", "updateWalk", "controls.update"]) {
      expect(at(steps, writer)).toBeLessThan(constrain);
    }
  });

  it("updates effects before tokens, bars and plates", async () => {
    const h = await createTestScene();
    const steps = h.traceFrame();
    const effects = at(steps, "updateEffects");
    for (const later of ["updateTokens", "updateBars", "updatePlates", "render"]) expect(at(steps, later)).toBeGreaterThan(effects);
  });

  it("skips controls.update() and the orbit constraint while walking", async () => {
    const h = await createTestScene();
    h.scene.setWalking(true);
    // traceFrame throws if either step were no longer on the scene, so their absence here is real.
    const steps = h.traceFrame();
    at(steps, "updateWalk");
    at(steps, "render");
    expect(steps).not.toContain("controls.update");
    expect(steps).not.toContain("constrainCamera");
  });

  it("leaves walking to setWalkCaptureFrame during a walk capture: the frame neither steps it nor runs the orbit steps", async () => {
    const h = await createTestScene();
    h.scene.setWalkCaptureFrame(0, IDLE_MOBILE_MAP_INPUT);
    const steps = h.traceFrame();
    at(steps, "render");
    expect(steps).not.toContain("updateWalk");
    expect(steps).not.toContain("controls.update");
    expect(steps).not.toContain("constrainCamera");
  });

  it("traceFrame fails loudly when a step is not on the scene", async () => {
    const h = await createTestScene();
    const scene = h.scene as unknown as Record<string, unknown>;
    // As if a move-only extraction took the method off the scene.
    scene.updateBars = undefined;
    try {
      expect(() => h.traceFrame()).toThrow(/frame step "updateBars"/);
    } finally {
      delete scene.updateBars;
    }
  });

  it("draws exactly once per frame while the loop runs", async () => {
    const h = await createTestScene();
    // A held key keeps the loop running (an idle scene draws nothing, chronicle-1982).
    h.input.hover();
    h.input.keyDown("KeyW");
    const before = h.renders.count;
    h.frames(10);
    expect(h.renders.count - before).toBe(10);
  });
});
