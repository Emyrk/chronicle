/**
 * ReplayPlayer's decisions, as pure functions (tested): which scene is on
 * screen while the panel reprocesses, the mesh request, the default framing,
 * who drives the camera, and whether Follow applies. The hook
 * (`useReplayPlayer`) holds the state; these say what it means.
 */

import type { MapCameraMark, MapCameraPose } from "./cameraPath";
import { FULL_MAP_VIEWPORT, type MapFraming, type MapViewport } from "./mapModel";
import type { DungeonMeshState } from "./MapScene3D";
import type { MapScene } from "./useMapScene";

export type ReadyMapScene = Extract<MapScene, { status: "ready" }>;

/**
 * When the last ready scene is held. `"panel"` (the Map panel): only while the
 * panel reprocesses, re-held when the encounter, map, floor or mesh changes.
 * `"backdrop"` (the landing): whenever the live scene is briefly empty, re-held
 * only when the map or mesh changes, so a moment without units never unmounts the view.
 * `"none"` (the export): never; only the live scene is filmed.
 */
export type HeldSceneRule = "panel" | "backdrop" | "none";

/**
 * Re-hold the live scene only when what it shows changes: the frozen view
 * ignores the held copy's per-tick data.
 */
export function shouldHoldScene(live: ReadyMapScene | null, held: ReadyMapScene | null, rule: HeldSceneRule = "panel"): boolean {
  if (!live || rule === "none") return false;
  if (!held || held.mapName !== live.mapName || held.mesh !== live.mesh) return true;
  return rule === "panel" && (held.encounterId !== live.encounterId || held.selectedFloorNumber !== live.selectedFloorNumber);
}

/**
 * The scene on screen: the live one; else the held one, frozen (while the panel
 * reprocesses, or for a backdrop whenever the live scene is empty), rather than
 * unmounting the view and rebuilding it once the new data arrives.
 */
export function shownScene<S>(live: S | null, held: S | null, reprocessing: boolean, rule: HeldSceneRule = "panel"): { ready: S | null; reloading: boolean } {
  const reloading = !live && rule !== "none" && (rule === "backdrop" || reprocessing) && held !== null;
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

/** Whether units project with the mesh's own transform: once the mesh has loaded (the panel), or always (the landing, the export). */
export type RawProjectionPolicy = "when-mesh-ready" | "always";

export function rawProjection(policy: RawProjectionPolicy, show3D: boolean, meshOn: boolean, meshState: DungeonMeshState): boolean {
  return policy === "always" || (show3D && meshOn && meshState === "ready");
}

/**
 * What a failed mesh means: `"report"` keeps "failed" (the panel shows the
 * tiles, the export errors); `"use-tiles"` plays on the tiles as if ready (the
 * landing's Explore), and a meshless instance is ready at once.
 */
export type MeshFailurePolicy = "report" | "use-tiles";

export function effectiveMeshState(reported: DungeonMeshState, policy: MeshFailurePolicy): DungeonMeshState {
  return policy === "use-tiles" && reported === "failed" ? "ready" : reported;
}

/** A meshless scene counts as a ready mesh under "use-tiles": its tiles are the ground. */
export function meshlessReady(policy: MeshFailurePolicy, sceneShown: boolean, hasMesh: boolean): boolean {
  return policy === "use-tiles" && sceneShown && !hasMesh;
}

/** What shows on the stage: the 3D view, the 2D map (WebGL fallback), the mesh-only message, or nothing (`webglFallback: "none"`). */
export function stageView(show3D: boolean, meshOnly: boolean, webglFallback: "2d" | "none"): "3d" | "2d" | "mesh-only" | "none" {
  if (show3D) return "3d";
  if (webglFallback === "none") return "none";
  return meshOnly ? "mesh-only" : "2d";
}

/**
 * Which optional scene fields reach the 3D view. `"all"`: every one (the Map
 * panel, the stories). `"backdrop"` (the landing): no alignment artwork and the
 * view's default coordinate space, as the hero always had. `"capture"` (the
 * video export): none of focus, follow source, alignment artwork or coordinate
 * space either, because each changes the filmed frames (camera limits,
 * walkable floors, unit scale).
 */
export type SceneFieldProfile = "all" | "backdrop" | "capture";

export function sceneFieldsFor(profile: SceneFieldProfile) {
  return {
    focus: profile !== "capture",
    followSource: profile !== "capture",
    alignmentGround: profile === "all",
    worldCoordinates: profile === "all",
  };
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
