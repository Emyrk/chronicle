/**
 * ReplayPlayer's decisions, as pure functions (tested): which scene is on
 * screen while the panel reprocesses, the mesh request, the default framing,
 * who drives the camera, and whether Follow applies. The hook
 * (`useReplayPlayer`) holds the state; these say what it means.
 */

import type { MapCameraMark, MapCameraPose } from "./cameraPath";
import { FULL_MAP_VIEWPORT, type MapFraming, type MapViewport } from "./mapModel";
import type { MapScene } from "./useMapScene";

export type ReadyMapScene = Extract<MapScene, { status: "ready" }>;

/**
 * Re-hold the live scene only when what it shows changes (another encounter,
 * map, floor or mesh): the frozen view ignores the held copy's per-tick data.
 */
export function shouldHoldScene(live: ReadyMapScene | null, held: ReadyMapScene | null): boolean {
  if (!live) return false;
  return !held || held.encounterId !== live.encounterId || held.mapName !== live.mapName
    || held.selectedFloorNumber !== live.selectedFloorNumber || held.mesh !== live.mesh;
}

/**
 * The scene on screen: the live one; while the panel reprocesses (a new
 * encounter, a filter change) the held one, frozen, rather than unmounting the
 * view and rebuilding it once the new data arrives.
 */
export function shownScene<S>(live: S | null, held: S | null, reprocessing: boolean): { ready: S | null; reloading: boolean } {
  const reloading = !live && reprocessing && held !== null;
  return { ready: live ?? (reloading ? held : null), reloading };
}

/** The dungeon mesh is wanted with WebGL and the 3D map on, or always on a mesh-only instance. */
export function meshWanted(show3D: boolean, meshOn: boolean, meshOnly: boolean): boolean {
  return show3D && (meshOn || meshOnly);
}

/** Which 2D canvas the scene prefers: the rendered one without the mesh (default), always, or never. */
export type RenderedCanvasPolicy = "without-mesh" | "always" | "never";

export function prefersRenderedCanvas(policy: RenderedCanvasPolicy, show3D: boolean, meshOn: boolean): boolean {
  if (policy === "always") return true;
  if (policy === "never") return false;
  return !show3D || !meshOn;
}

/** The view a fresh selection starts on: the auto-fit when the scene asks for it, else the whole map. */
export function defaultViewport(scene: Pick<ReadyMapScene, "fitByDefault" | "autoFit"> | null): MapViewport {
  return scene?.fitByDefault && scene.autoFit ? scene.autoFit : FULL_MAP_VIEWPORT;
}

/** The mesh camera's lock (zoom and pan) on the fight, when the scene fits by default. */
export function focusParts(scene: Pick<ReadyMapScene, "focusCentre" | "fitByDefault" | "autoFit"> | null) {
  return {
    centre: scene?.focusCentre ?? null,
    zoom: scene?.fitByDefault ? scene.autoFit?.zoom ?? null : null,
  };
}

/**
 * The cinematic Director has the camera while the framing is the default one:
 * the user has not pinned a Fit or Reset and has not panned or zoomed.
 */
export function directorFraming(framing: Pick<MapFraming, "manual" | "viewport">): boolean {
  return !framing.manual && framing.viewport === null;
}

/**
 * Follow stands in for Fit while the camera can follow (across a whole run,
 * and on the loaded mesh, where the Director frames the boss and the group);
 * it is on while the Director has the camera.
 */
export function followState(wholeRun: boolean, onMesh: boolean, director: boolean): { canFollow: boolean; following: boolean } {
  const canFollow = wholeRun || onMesh;
  return { canFollow, following: canFollow && director };
}

/** Who drives the camera, as the player reports it. */
export type ReplayCameraMode = "director" | "user" | "path" | "pose";

/**
 * The host's camera choice: `mode` is "director" (the cinematic camera until
 * the user takes it; Follow gives it back) or "user" (never the Director). A
 * `path` (authored poses on the replay clock) or a `pose` (an external pose,
 * which wins over a path) takes over while set.
 */
export interface ReplayCamera {
  mode: "director" | "user";
  path?: { marks: readonly MapCameraMark[]; startMs: number } | null;
  pose?: MapCameraPose | null;
}

/** The camera's effective mode, and whether the view is told the Director has it. */
export function cameraModeFor(camera: ReplayCamera, framing: Pick<MapFraming, "manual" | "viewport">): { mode: ReplayCameraMode; cinematic: boolean } {
  const cinematic = camera.mode === "director" && directorFraming(framing);
  const mode: ReplayCameraMode = camera.pose ? "pose" : camera.path ? "path" : cinematic ? "director" : "user";
  return { mode, cinematic };
}
