import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PanelRenderProps } from "../types";
import { fetchUnitModelUrls, type PublishedUnitModelUrls } from "./bossMinis";
import { dungeonMeshBytes, dungeonMeshLiquid, dungeonMeshUrl } from "./dungeonMeshes";
import type { MapResult } from "./map.processor";
import { INITIAL_MAP_FRAMING, manualMapFraming, pinMapFraming, reconcileMapFraming, type MapFraming, type MapViewport, type ReplayMapSource } from "./mapModel";
import type { DungeonMeshRequest, DungeonMeshState, MapScene3D, MapSceneFocus } from "./MapScene3D";
import type { MapViewRequest } from "./MapView2D";
import type { ReplayClock } from "./replayClock";
import {
  cameraModeFor,
  defaultViewport as defaultViewportFor,
  focusParts,
  followState,
  meshWanted as meshWantedFor,
  prefersRenderedCanvas,
  shouldHoldScene,
  shownScene,
  type ReadyMapScene,
  type RenderedCanvasPolicy,
  type ReplayCamera,
  type ReplayCameraMode,
} from "./replayPlayerModel";
import { useMapScene, type MapScene } from "./useMapScene";

export interface ReplayPlayerOptions {
  /** What the scene is built from: a panel result and its context (what `useMapScene` takes). */
  source: PanelRenderProps<MapResult>;
  /** The replay's clock, chosen by the host; the player never reads SyncMode itself. */
  clock: ReplayClock;
  /** Which selected encounter the scene shows (default: the clock's time). */
  encounterAtMs?: number | null;
  /** Replay every processed encounter as one run, the camera following the party. */
  wholeRun?: boolean;
  /** The user's 2D artwork choice. */
  mapSource?: ReplayMapSource;
  showHiddenUnits?: boolean;
  /** The host wants the 3D map (the dungeon mesh as the ground). A mesh-only instance has it regardless. */
  meshOn: boolean;
  /** Which 2D canvas the scene prefers (default: the rendered one without the mesh). */
  renderedCanvas?: RenderedCanvasPolicy;
  /** Who drives the camera (see ReplayCamera). */
  camera: ReplayCamera;
  /** A host value held with the scene while it reloads (the Map panel: whether Replay was on), returned as `heldValue`. */
  holdValue?: boolean;
  /** Miniature model URLs to use instead of the shared manifest's (the stories'). */
  unitModelUrls?: PublishedUnitModelUrls;
}

/** The imperative camera actions (bump-key props on the view underneath). */
export interface ReplayCameraHandle {
  /** Cut the cinematic camera straight to its next shot instead of gliding there (a jump). */
  cut: () => void;
  /** The top-down view. */
  topDown: () => void;
  /** Report the current orbit pose through the view's `onCameraCapture`. */
  capturePose: () => void;
}

export interface ReplayPlayerState {
  source: PanelRenderProps<MapResult>;
  /** The scene as built this render (may be a message while loading). */
  scene: MapScene;
  /** The scene when ready this render, else null. */
  live: ReadyMapScene | null;
  /** The last ready scene, kept while the panel reprocesses. */
  held: ReadyMapScene | null;
  /** On screen: the live scene, or the held one while reloading; null shows the scene's message. */
  ready: ReadyMapScene | null;
  reloading: boolean;
  /** The host's `holdValue`, live or as held with the scene. */
  heldValue: boolean;
  /** WebGL works (until the view reports otherwise). */
  show3D: boolean;
  webglUnavailable: boolean;
  markWebglUnavailable: () => void;
  meshOnly: boolean;
  meshWanted: boolean;
  meshState: DungeonMeshState;
  setMeshState: (state: DungeonMeshState) => void;
  /** The mesh's URL, once the scene names one. */
  meshUrl: string | null;
  /** The mesh request handed to the view, or null for the tiles. */
  dungeonMesh: DungeonMeshRequest | null;
  /** The 3D view stands on the loaded mesh. */
  onMesh: boolean;
  worldCoordinates: boolean;
  focus: MapSceneFocus | null;
  autoFit: MapViewport | null;
  framing: MapFraming;
  /** The view request both the 2D and 3D views take, so a 2D <-> 3D swap keeps the framing. */
  view: MapViewRequest;
  onUserViewport: (viewport: MapViewport) => void;
  /** Pin a framing (Fit, Reset). */
  applyFraming: (viewport: MapViewport) => void;
  camera: ReplayCamera;
  cameraMode: ReplayCameraMode;
  /** The view is told the Director has the camera. */
  cinematic: boolean;
  canFollow: boolean;
  following: boolean;
  /** Back to the default framing: the Director on the mesh, the party-following camera across a run. */
  followGroup: () => void;
  followGuid: string | null;
  setFollowGuid: (guid: string | null) => void;
  /** A unit frame's Follow: the Director on that unit (resumed if the user had pinned a framing); again stops it. */
  followUnit: (guid: string) => void;
  cameraHandle: ReplayCameraHandle;
  /** The live 3D scene (for capture), or null. */
  scene3d: MapScene3D | null;
  setScene3d: (scene: MapScene3D | null) => void;
  cutKey: number;
  topDownKey: number;
  cameraCaptureKey: number;
  unitModelUrls: PublishedUnitModelUrls | undefined;
}

/**
 * The 3D replay's wiring, owned once: builds the scene from the source and the
 * injected clock, holds the last scene while the panel reprocesses, requests
 * the mesh, keeps the framing, decides who drives the camera, and keeps the
 * Follow state. `ReplayPlayer` renders it; a host adds clock, capabilities and slots.
 */
export function useReplayPlayer(options: ReplayPlayerOptions): ReplayPlayerState {
  const { source, clock, wholeRun = false, meshOn, renderedCanvas = "without-mesh", camera } = options;
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const show3D = !webglUnavailable;
  const [meshState, setMeshState] = useState<DungeonMeshState>("loading");
  const scene = useMapScene(source, {
    rawDungeonProjection: show3D && meshOn && meshState === "ready",
    preferRenderedCanvas: prefersRenderedCanvas(renderedCanvas, show3D, meshOn),
    mapSource: options.mapSource,
    wholeRun,
    showHiddenUnits: options.showHiddenUnits,
    clock,
    encounterAtMs: options.encounterAtMs,
  });

  const live = scene.status === "ready" ? scene : null;
  const [held, setHeld] = useState<ReadyMapScene | null>(null);
  const [heldValue, setHeldValue] = useState(false);
  if (shouldHoldScene(live, held)) {
    setHeld(live);
    setHeldValue(Boolean(options.holdValue));
  }
  const { ready, reloading } = shownScene(live, held, Boolean(source.loading || source.processing));

  // Everything read from the scene through plain functions comes first, ahead of the memos below.
  const { centre: focusCentre, zoom: fitZoom } = focusParts(ready);
  const autoFit = ready?.autoFit ?? null;
  const defaultViewport = defaultViewportFor(ready);
  const readyWholeRun = Boolean(ready?.wholeRun);
  const [storedFraming, setFraming] = useState<MapFraming>(INITIAL_MAP_FRAMING);
  // A new selection or the replay moving into another encounter re-frames;
  // loading states (e.g. reprocessing after a filter change) keep the framing.
  const framing = ready
    ? reconcileMapFraming(storedFraming, `${source.context.selectedEncounterIds.join(",")}|${ready.encounterId}`, defaultViewport)
    : storedFraming;
  if (framing !== storedFraming) setFraming(framing);
  const meshOnly = ready?.meshOnly ?? false;
  const meshWanted = meshWantedFor(show3D, meshOn, meshOnly);
  const iconBaseUrl = source.context.instance.iconBaseUrl;
  // The manifest's mesh entry (one object per cached manifest, not rebuilt
  // per render) keys the request: a changed entry re-requests the mesh.
  const mesh = ready?.mesh ?? null;
  const meshUrl = mesh && iconBaseUrl ? dungeonMeshUrl(mesh, iconBaseUrl) : null;
  // Start the mesh's (large) download as soon as the map knows it: before the
  // encounter finishes processing and before the 3D renderer has loaded.
  const prefetchMesh = mesh ?? (scene.status === "message" ? scene.meshHint ?? null : null);
  const prefetchUrl = meshWanted && prefetchMesh && iconBaseUrl ? dungeonMeshUrl(prefetchMesh, iconBaseUrl) : null;
  useEffect(() => {
    if (prefetchUrl) dungeonMeshBytes(prefetchUrl).catch(() => {});
  }, [prefetchUrl]);
  const view: MapViewRequest = { viewport: framing.viewport ?? defaultViewport, key: String(framing.revision) };
  const onUserViewport = useCallback((viewport: MapViewport) => {
    setFraming((current) => manualMapFraming(current, viewport));
  }, []);
  const applyFraming = (viewport: MapViewport) => setFraming(pinMapFraming(framing, viewport));
  const followGroup = () => setFraming({ ...framing, viewport: null, manual: false, revision: framing.revision + 1 });

  const { mode: cameraMode, cinematic } = cameraModeFor(camera, framing);
  const onMesh = show3D && meshWanted && meshState === "ready";
  const { canFollow, following } = followState(readyWholeRun, onMesh, cinematic);
  const [followGuid, setFollowGuid] = useState<string | null>(null);
  const followUnit = (guid: string) => {
    if (followGuid === guid) {
      setFollowGuid(null);
      return;
    }
    if (!cinematic) followGroup();
    setFollowGuid(guid);
  };

  const [cutKey, setCutKey] = useState(0);
  const [topDownKey, setTopDownKey] = useState(0);
  const [cameraCaptureKey, setCameraCaptureKey] = useState(0);
  const cut = useCallback(() => setCutKey((key) => key + 1), []);
  const topDown = useCallback(() => setTopDownKey((key) => key + 1), []);
  const capturePose = useCallback(() => setCameraCaptureKey((key) => key + 1), []);
  const cameraHandle = useMemo((): ReplayCameraHandle => ({ cut, topDown, capturePose }), [capturePose, cut, topDown]);
  const [scene3d, setScene3d] = useState<MapScene3D | null>(null);
  const markWebglUnavailable = useCallback(() => setWebglUnavailable(true), []);

  const unitModelsQuery = useQuery({
    queryKey: ["unit-models"],
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: !options.unitModelUrls,
    queryFn: () => fetchUnitModelUrls(),
  });

  // Last: the compiler keeps these memos only after every other read of the scene.
  const dungeonMesh = useMemo((): DungeonMeshRequest | null =>
    meshWanted && mesh && meshUrl ? { url: meshUrl, bounds: mesh.bounds, liquid: dungeonMeshLiquid(mesh) } : null,
  [mesh, meshUrl, meshWanted]);

  const focus = useMemo((): MapSceneFocus | null =>
    focusCentre && fitZoom !== null ? { centre: focusCentre, zoom: fitZoom } : null,
  [fitZoom, focusCentre]);

  return {
    source,
    scene,
    live,
    held,
    ready,
    reloading,
    heldValue: live ? Boolean(options.holdValue) : heldValue,
    show3D,
    webglUnavailable,
    markWebglUnavailable,
    meshOnly,
    meshWanted,
    meshState,
    setMeshState,
    meshUrl,
    dungeonMesh,
    onMesh,
    worldCoordinates: source.context.instance.positionCoordinateSpace !== "ui-map-normalized",
    focus,
    autoFit,
    framing,
    view,
    onUserViewport,
    applyFraming,
    camera,
    cameraMode,
    cinematic,
    canFollow,
    following,
    followGroup,
    followGuid,
    setFollowGuid,
    followUnit,
    cameraHandle,
    scene3d,
    setScene3d,
    cutKey,
    topDownKey,
    cameraCaptureKey,
    unitModelUrls: options.unitModelUrls ?? unitModelsQuery.data,
  };
}
