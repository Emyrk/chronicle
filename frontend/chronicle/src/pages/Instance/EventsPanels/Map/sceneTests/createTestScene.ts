import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { onTestFinished, vi } from "vitest";
import {
  MapScene3D,
  type DungeonMeshRequest,
  type DungeonMeshState,
  type MapScene3DEffectHover,
  type MapScene3DUnit,
} from "../MapScene3D";
import type { MapViewport } from "../mapModel";
import {
  FakeCanvas,
  FakeElement,
  FakeKeyboardEvent,
  FakePointerEvent,
  FakeResizeObserver,
  FakeWheelEvent,
  installFakeDom,
  type KeyInit,
  type PointerInit,
} from "./fakeDom";
import { buildSyntheticDungeonGlb, DUNGEON_BOUNDS, DUNGEON_URL, mapPointAt } from "./syntheticDungeon";

/** One frame at 60 fps, in ms. */
export const FRAME_MS = 1000 / 60;

export const DUNGEON_REQUEST: DungeonMeshRequest = { url: DUNGEON_URL, bounds: DUNGEON_BOUNDS };

/**
 * The private state the probes read. This is the only place tests reach into
 * MapScene3D's internals: when a refactor moves one of these, update this
 * interface and the probe below, not every test.
 */
interface SceneInternals {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  tween: { view: object | null; move: object | null };
  free: object;
  walk: { avatar: THREE.Group } | null;
  dungeonMesh: { url: string; scale: number; group: THREE.Group; caves: { mesh: THREE.Mesh; bvh: unknown }[] } | null;
  units: Map<string, { base: THREE.Vector3; floorY: number; floorTracked: boolean; token: { arc: THREE.Object3D } }>;
  hud: { bars: THREE.InstancedMesh };
  unitLayer: { floorTracks: unknown; targetLines: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] };
  presence: { remotePresences: Map<string, { position: THREE.Vector3 }> };
}

/**
 * The per-frame updates renderFrame calls (private MapScene3D methods);
 * traceFrame lists them in call order and throws when one is no longer a
 * method on the scene. This list (and traceFrame's wrapping) is the one place
 * an extraction updates when it moves a step: see README, "Frame order".
 */
export const FRAME_STEPS = [
  "updateViewAnimation",
  "updateCameraMove",
  "updateDirector",
  "updateKeyboardCamera",
  "updateWalk",
  "updateRemotePresences",
  "constrainCamera",
  "updateEffects",
  "updateWhelpAnimations",
  "updateTokens",
  "updateBars",
  "updateEffectHover",
  "emitCompassYaw",
  "updatePlates",
  "emitPresence",
] as const;

export type CameraOwner = "walk" | "double-click" | "view-tween" | "director" | "user";

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

const round = (value: number, digits = 3) => {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? 0 : rounded;
};
const roundVector = (vector: THREE.Vector3, digits = 3): [number, number, number] => [round(vector.x, digits), round(vector.y, digits), round(vector.z, digits)];

/** A unit for setUnits at scene (x, z) on the synthetic dungeon's ground. */
export function testUnit(guid: string, x: number, z: number, extra: Partial<MapScene3DUnit> = {}): MapScene3DUnit {
  return {
    guid,
    point: mapPointAt(x, z),
    worldX: 0,
    worldY: 0,
    color: "#ffffff",
    kind: "player",
    muted: false,
    name: guid,
    health: null,
    miniatureUrl: undefined,
    icon: null,
    ...extra,
  };
}

export interface TestSceneOptions {
  /** Container size in CSS px (default 800 x 600). */
  width?: number;
  height?: number;
  /** Units to place before the mesh loads. */
  units?: MapScene3DUnit[];
  /** Turn the Director on with these boss guids before the mesh loads (default: off). */
  director?: ReadonlySet<string> | null;
  /** Load the synthetic dungeon (default true). Off, the scene stays on the flat ground. */
  mesh?: boolean;
  /** Run frames until the camera holds still after setup (default true). */
  settle?: boolean;
  /** Passed through to the scene (a capture scene draws only through captureFrame). */
  capture?: { width: number; height: number } | null;
}

let glbBytes: ArrayBuffer | null = null;
const liveScenes: (() => void)[] = [];

/**
 * A real MapScene3D in Node: a stub renderer, the fake DOM, a manual clock
 * that steps frames, fake setTimeout, and the synthetic dungeon. Torn down
 * when the test finishes. See README.md.
 */
export async function createTestScene(options: TestSceneOptions = {}) {
  const dom = installFakeDom();
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const fetchMock = (globalThis.fetch as unknown as { harness?: boolean }).harness ? globalThis.fetch as ReturnType<typeof vi.fn> : stubFetch();

  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const container = dom.document.createElement("div");
  container.clientWidth = width;
  container.clientHeight = height;
  dom.document.body.appendChild(container);
  const canvas = dom.document.createElement("canvas") as FakeCanvas;

  const renders = { count: 0, disposed: false, hook: null as (() => void) | null };
  const renderer = {
    domElement: canvas,
    setPixelRatio() {},
    setClearColor() {},
    setSize(w: number, h: number) {
      canvas.width = w;
      canvas.height = h;
      canvas.clientWidth = w;
      canvas.clientHeight = h;
    },
    // As WebGLRenderer.render does before drawing: raycasts read these matrices.
    render(sceneGraph: THREE.Scene, camera: THREE.Camera) {
      if (sceneGraph.matrixWorldAutoUpdate) sceneGraph.updateMatrixWorld();
      if (camera.parent === null && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld();
      renders.count++;
      renders.hook?.();
    },
    dispose() {
      renders.disposed = true;
    },
    forceContextLoss() {},
  };

  const events = {
    userViewports: [] as MapViewport[],
    follow: [] as (string | null)[],
    walk: [] as boolean[],
    compass: [] as number[],
    mesh: [] as DungeonMeshState[],
    effectHover: [] as (MapScene3DEffectHover | null)[],
    contextLost: 0,
  };
  const meshWaiters: ((state: DungeonMeshState) => void)[] = [];

  const scene = new MapScene3D(
    container as unknown as HTMLElement,
    () => events.contextLost++,
    (hover) => events.effectHover.push(hover),
    (viewport) => events.userViewports.push(viewport),
    (state) => {
      events.mesh.push(state);
      if (state !== "loading") for (const resolve of meshWaiters.splice(0)) resolve(state);
    },
    (yaw) => events.compass.push(yaw),
    {
      capture: options.capture ?? null,
      createRenderer: () => renderer as unknown as THREE.WebGLRenderer,
      now: dom.clock.now,
    },
  );
  scene.setOnFollowChange((guid) => events.follow.push(guid));
  scene.setOnWalkChange((walking) => events.walk.push(walking));
  const internals = scene as unknown as SceneInternals;

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    scene.dispose();
  };
  // One hook per test disposes every scene it made, then removes the fake browser.
  if (liveScenes.length === 0) {
    onTestFinished(() => {
      for (const disposeScene of liveScenes.splice(0)) disposeScene();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      dom.uninstall();
    });
  }
  liveScenes.push(dispose);

  // --- Frames on the manual clock ---

  /** Advances the clock by `ms` and runs the frames queued by then. Returns how many ran. */
  const frame = (ms = FRAME_MS) => {
    dom.clock.advance(ms);
    return dom.frames.run(dom.clock.ms);
  };
  const frames = (count: number, ms = FRAME_MS) => {
    let ran = 0;
    for (let index = 0; index < count; index++) ran += frame(ms);
    return ran;
  };
  /** Steps frames until none is queued; throws past `max`. Returns the frames run. */
  const runUntilIdle = (max = 3000, ms = FRAME_MS) => {
    let count = 0;
    while (dom.frames.pending > 0) {
      if (count >= max) throw new Error(`scene still animating after ${max} frames`);
      frame(ms);
      count++;
    }
    return count;
  };

  /**
   * Steps frames until the camera has held still for `quiet` frames and no
   * tween or double-click move is running (whether or not the loop is still
   * awake). Returns the frames run; throws past `max`.
   */
  const settle = (max = 3000, quiet = 10) => {
    let still = 0;
    let count = 0;
    let last = poseKey();
    while (still < quiet || internals.tween.view || internals.tween.move) {
      if (count >= max) throw new Error(`camera still moving after ${max} frames`);
      frame();
      count++;
      const next = poseKey();
      still = next === last ? still + 1 : 0;
      last = next;
    }
    return count;
  };
  function poseKey() {
    return [...internals.camera.position.toArray(), ...internals.controls.target.toArray()].map((value) => value.toFixed(6)).join(",");
  }


  // --- Input, as the browser sends it ---

  const centre = { x: width / 2, y: height / 2 };
  const pointer = (type: string, x: number, y: number, init: PointerInit = {}) => {
    const event = new FakePointerEvent(type, { clientX: x, clientY: y, ...init });
    canvas.dispatchEvent(event);
    // OrbitControls follows a drag on the document, where the event bubbles to.
    if (type === "pointermove" || type === "pointerup") dom.document.dispatchEvent(new FakePointerEvent(type, { clientX: x, clientY: y, ...init }));
    return event;
  };
  const input = {
    centre,
    pointerDown: (x = centre.x, y = centre.y, init: PointerInit = {}) => pointer("pointerdown", x, y, init),
    pointerMove: (x = centre.x, y = centre.y, init: PointerInit = {}) => pointer("pointermove", x, y, init),
    pointerUp: (x = centre.x, y = centre.y, init: PointerInit = {}) => pointer("pointerup", x, y, init),
    pointerCancel: (x = centre.x, y = centre.y, init: PointerInit = {}) => pointer("pointercancel", x, y, init),
    /** The mouse enters and rests over (x, y): the map's keys act from now on. */
    hover: (x = centre.x, y = centre.y) => pointer("pointermove", x, y, { pointerType: "mouse" }),
    leave: () => canvas.dispatchEvent(new FakePointerEvent("pointerleave", { pointerType: "mouse" })),
    /**
     * A mouse drag with `button` from `from` by (dx, dy), in `steps` moves,
     * released at the end unless `release` is false.
     */
    drag: (button: number, dx: number, dy: number, { from = centre, steps = 4, release = true, init = {} as PointerInit } = {}) => {
      const bit = button === 0 ? 1 : button === 2 ? 2 : 4;
      pointer("pointerdown", from.x, from.y, { button, buttons: bit, ...init });
      for (let step = 1; step <= steps; step++) {
        pointer("pointermove", from.x + (dx * step) / steps, from.y + (dy * step) / steps, { button: -1, buttons: bit, movementX: dx / steps, movementY: dy / steps, ...init });
      }
      if (release) pointer("pointerup", from.x + dx, from.y + dy, { button, buttons: 0, ...init });
    },
    click: (x = centre.x, y = centre.y, init: PointerInit = {}) => {
      pointer("pointerdown", x, y, { button: 0, buttons: 1, ...init });
      pointer("pointerup", x, y, { button: 0, buttons: 0, ...init });
    },
    /** Two clicks then the dblclick event, as a browser sends them. */
    doubleClick: (x = centre.x, y = centre.y, init: PointerInit = {}) => {
      input.click(x, y, init);
      input.click(x, y, init);
      const event = new FakePointerEvent("dblclick", { clientX: x, clientY: y, button: 0, ...init });
      canvas.dispatchEvent(event);
      return event;
    },
    wheel: (deltaY: number, x = centre.x, y = centre.y, init: PointerInit = {}) => {
      const event = new FakeWheelEvent(deltaY, { clientX: x, clientY: y, ...init });
      canvas.dispatchEvent(event);
      return event;
    },
    keyDown: (code: string, init: KeyInit = {}) => {
      const event = new FakeKeyboardEvent("keydown", code, init);
      dom.window.dispatchEvent(event);
      dom.document.dispatchEvent(new FakeKeyboardEvent("keydown", code, init));
      return event;
    },
    keyUp: (code: string, init: KeyInit = {}) => {
      const event = new FakeKeyboardEvent("keyup", code, init);
      dom.window.dispatchEvent(event);
      dom.document.dispatchEvent(new FakeKeyboardEvent("keyup", code, init));
      return event;
    },
    /** Holds `code` for `ms` of frames, then releases it. */
    hold: (code: string, ms: number, init: KeyInit = {}) => {
      input.keyDown(code, init);
      frames(Math.round(ms / FRAME_MS));
      input.keyUp(code, init);
    },
    touchDown: (id: number, x: number, y: number) => pointer("pointerdown", x, y, { pointerId: id, pointerType: "touch", button: 0, buttons: 1 }),
    touchMove: (id: number, x: number, y: number) => pointer("pointermove", x, y, { pointerId: id, pointerType: "touch", button: -1, buttons: 1 }),
    touchUp: (id: number, x: number, y: number) => pointer("pointerup", x, y, { pointerId: id, pointerType: "touch", button: 0, buttons: 0 }),
    blurWindow: () => dom.window.dispatchEvent(new Event("blur")),
  };

  // --- What the scene shows ---

  const probe = {
    /** Who moves the camera right now. The one probe for camera ownership. */
    owner: (): CameraOwner => {
      // The scene's own owner (cameraArbiter), in the names these tests use.
      switch (scene.cameraOwner()) {
        case "walk":
          return "walk";
        case "tween":
          return internals.tween.move ? "double-click" : "view-tween";
        case "director":
          return "director";
        default:
          return "user";
      }
    },
    /** The camera's position and the point it orbits (the free cam's pivot, walk mode's head), rounded to `digits`. */
    pose: (digits = 3): CameraPose => ({ position: roundVector(internals.camera.position, digits), target: roundVector(internals.controls.target, digits) }),
    /** The pose on one line, for inline snapshots: "camera x,y,z -> target x,y,z". */
    poseLine: (digits = 3) => {
      const { position, target } = probe.pose(digits);
      return `camera ${position.join(",")} -> target ${target.join(",")}`;
    },
    camera: () => internals.camera,
    /** The point the camera orbits: the free cam's pivot, walk mode's head. */
    target: () => internals.controls.target,
    distance: () => internals.camera.position.distanceTo(internals.controls.target),
    /**
     * The camera's yaw (0 looks from +z), pitch and distance about the point
     * it orbits, from the scene graph: the free cam's angles about its pivot,
     * walk mode's camera angles about the head.
     */
    angles: () => {
      const offset = internals.camera.position.clone().sub(internals.controls.target);
      const horizontal = Math.hypot(offset.x, offset.z);
      return { yaw: Math.atan2(offset.x, offset.z), pitch: Math.atan2(offset.y, horizontal), distance: offset.length() };
    },
    /**
     * Walk mode's character as drawn, or null when not walking: its feet,
     * its facing (rotation about y; 0 faces -z, and strafing turns the body
     * toward where it goes) and whether it shows (not in first person).
     */
    avatar: () => {
      const avatar = internals.walk?.avatar;
      if (!avatar) return null;
      return { position: avatar.position.clone(), facing: avatar.rotation.y, visible: avatar.visible };
    },
    /** A unit as placed: its base (feet), the floor under it, whether that came from its floor track, and whether its cast arc shows. */
    unit: (guid: string) => {
      const object = internals.units.get(guid);
      if (!object) return undefined;
      return { base: object.base.clone(), floorY: object.floorY, floorTracked: object.floorTracked, castArc: object.token.arc.visible };
    },
    /** How many health-bar quads the bar pool draws (a living unit's bar is a backing and a fill, a dead one's only the backing). */
    barQuads: () => internals.hud.bars.count,
    floorTracks: () => internals.unitLayer.floorTracks,
    /** The dash offset of each target line's texture (it crawls along the line over time). */
    targetLineDashes: () => internals.unitLayer.targetLines.map((line) => line.material.map?.offset.x ?? 0),
    /** Where another live-session participant is drawn now (eased toward their latest update). */
    remotePresence: (participantId: string) => internals.presence.remotePresences.get(participantId)?.position.clone(),
    mesh: () => internals.dungeonMesh,
  };

  /**
   * The steps the next frame runs, in order: renderFrame's own calls to the
   * FRAME_STEPS methods, OrbitControls' update ("controls.update") and the
   * draw ("render"). Calls those steps make in turn are not listed.
   */
  const traceFrame = (ms = FRAME_MS): string[] => {
    const steps: string[] = [];
    let depth = 0;
    let inFrame = false;
    const restore: (() => void)[] = [];
    const wrap = (owner: Record<string, unknown>, method: string, name: string) => {
      const original = owner[method] as (...args: unknown[]) => unknown;
      if (typeof original !== "function") {
        throw new Error(`traceFrame: frame step "${name}" is no longer a method where the harness looks for it. Update FRAME_STEPS and traceFrame in createTestScene.ts (README, "Frame order").`);
      }
      const had = Object.prototype.hasOwnProperty.call(owner, method);
      owner[method] = function (this: unknown, ...args: unknown[]) {
        if (inFrame && depth === 0) steps.push(name);
        depth++;
        try {
          return original.apply(this, args);
        } finally {
          depth--;
        }
      };
      restore.push(() => {
        if (had) owner[method] = original;
        else delete owner[method];
      });
    };
    const sceneObject = scene as unknown as Record<string, unknown>;
    for (const step of FRAME_STEPS) wrap(sceneObject, step, step);
    wrap(internals.controls as unknown as Record<string, unknown>, "update", "controls.update");
    wrap(renderer as unknown as Record<string, unknown>, "render", "render");
    const renderFrame = sceneObject.renderFrame as (now: number) => boolean;
    if (typeof renderFrame !== "function") throw new Error("traceFrame: MapScene3D has no renderFrame any more. Update traceFrame in createTestScene.ts.");
    sceneObject.renderFrame = function (this: unknown, now: number) {
      inFrame = true;
      try {
        return renderFrame.call(this, now);
      } finally {
        inFrame = false;
      }
    };
    restore.push(() => delete sceneObject.renderFrame);
    try {
      // The next frame: wake the loop if it sleeps (an idle scene queues none).
      if (dom.frames.pending === 0) (scene as unknown as { requestRender: () => void }).requestRender();
      frame(ms);
    } finally {
      for (const undo of restore.reverse()) undo();
    }
    return steps;
  };

  /**
   * How many times the free cam placed its camera from yaw, pitch and
   * distance (the private placeFreeCam: the free-cam mover, mouse look and
   * the wheel) while `run` ran.
   */
  const countFreeCamPlacements = (run: () => void): number => {
    const sceneObject = internals.free as unknown as Record<string, unknown>;
    const original = sceneObject.placeFreeCam as (...args: unknown[]) => unknown;
    if (typeof original !== "function") throw new Error("countFreeCamPlacements: the free rig has no placeFreeCam any more. Update createTestScene.ts.");
    let count = 0;
    sceneObject.placeFreeCam = function (this: unknown, ...args: unknown[]) {
      count++;
      return original.apply(this, args);
    };
    try {
      run();
    } finally {
      delete sceneObject.placeFreeCam;
    }
    return count;
  };

  /** The container pixel (x, y) a scene point draws at, with the camera as it is now. */
  const screenOf = (x: number, y: number, z: number) => {
    const camera = internals.camera;
    camera.updateMatrixWorld();
    const ndc = new THREE.Vector3(x, y, z).project(camera);
    return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
  };

  /** Loads the synthetic dungeon and waits until the scene reports ready (or failed). */
  const loadMesh = async (request: DungeonMeshRequest = DUNGEON_REQUEST) => {
    const done = new Promise<DungeonMeshState>((resolve) => meshWaiters.push(resolve));
    scene.setDungeonMesh(request);
    return done;
  };

  /** Runs the scene's pending timers: sliced follow/floor-track builds, the click delay, presence throttles. */
  const runTimers = async () => {
    await vi.runAllTimersAsync();
  };

  const harness = {
    scene,
    dom,
    container: container as FakeElement,
    canvas,
    clock: dom.clock,
    renders,
    events,
    fetch: fetchMock,
    frame,
    frames,
    runUntilIdle,
    settle,
    traceFrame,
    countFreeCamPlacements,
    /** Whether a frame is queued (the loop is awake). */
    get awake() {
      return dom.frames.pending > 0;
    },
    input,
    probe,
    screenOf,
    loadMesh,
    runTimers,
    fireResize: () => FakeResizeObserver.fireAll(),
    dispose,
  };

  if (options.units) scene.setUnits(options.units);
  if (options.director) scene.setDirector({ bossGuids: options.director });
  if (options.mesh !== false) {
    const state = await harness.loadMesh();
    if (state !== "ready") throw new Error(`synthetic dungeon did not load: ${state}`);
  }
  if (options.settle !== false) settle();
  return harness;
}

export type TestScene = Awaited<ReturnType<typeof createTestScene>>;

function stubFetch() {
  glbBytes ??= buildSyntheticDungeonGlb();
  const bytes = glbBytes;
  const mock = vi.fn(async (url: string | URL) => {
    if (String(url) !== DUNGEON_URL) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, arrayBuffer: async () => bytes.slice(0) };
  });
  Object.assign(mock, { harness: true });
  vi.stubGlobal("fetch", mock);
  return mock;
}
