import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  effectiveMeshState,
  focusParts,
  followState,
  meshlessReady,
  meshWanted as meshWantedFor,
  prefersRenderedCanvas,
  rawProjection,
  sceneFieldsFor,
  shouldHoldScene,
  shownScene,
  type HeldSceneRule,
  type MeshFailurePolicy,
  type RawProjectionPolicy,
  type ReadyMapScene,
  type RenderedCanvasPolicy,
  type ReplayCamera,
  type ReplayCameraMode,
  type SceneFieldProfile,
} from "./replayPlayerModel";
import { useMapScene, type MapScene } from "./useMapScene";
import { canRetryDungeon, dungeon3DOverlay, dungeon3DStatus, type Dungeon3DStatus } from "./dungeon3DModel";
import type { CameraOwner } from "./cameraArbiter";
import { followControls, INITIAL_CAMERA_HANDOFF, isBackToActionKey, releasedFraming, reportCameraOwner } from "./followHandoff";

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
  /** Miniature model URLs to use instead of the shared manifest's (the stories', the export's). */
  unitModelUrls?: PublishedUnitModelUrls;
  /** `"none"`: no creature miniatures, and no manifest fetch (the landing keeps its first load light). Default `"manifest"`. */
  unitModels?: "manifest" | "none";
  /** When the last ready scene is held (default `"panel"`; the landing: `"backdrop"`). */
  heldScene?: HeldSceneRule;
  /** Units on the mesh's own transform once it loads (default), or always (the landing, the export). */
  rawProjection?: RawProjectionPolicy;
  /** What a failed or missing mesh means (default `"report"`; Explore: `"use-tiles"`). */
  meshFailure?: MeshFailurePolicy;
  /** Start the mesh download as soon as the scene names it (default). Off: only once the scene is up (the landing fetches positions first). */
  prefetchMesh?: boolean;
  /** A mesh request the host makes itself (the export), instead of the scene's. */
  dungeonMesh?: DungeonMeshRequest | null;
  /** Re-frame on a new selection or encounter (default `"on-selection"`); `"never"`: the view applies once, and again only on Follow. */
  reframe?: "on-selection" | "never";
  /**
   * A view the host fixes (the export), instead of the player's framing. It implies the user's camera (the Director
   * never moves it) and no reframing, whatever `camera.mode` and `reframe` say.
   */
  fixedView?: MapViewRequest;
  /** Without WebGL: the 2D map (default), or nothing (the landing hides; the export errors). */
  webglFallback?: "2d" | "none";
  /** Called when WebGL turns out to be unavailable. */
  onUnavailable?: () => void;
  /** Pointer input on the view: camera drags and unit clicks (default true; off for the landing's backdrop and the export). */
  interactive?: boolean;
  /** Which optional scene fields reach the view (default `"all"`; see sceneFieldsFor). */
  sceneFields?: SceneFieldProfile;
  /** Told when the 3D scene is created and disposed (the export starts filming once it exists). */
  onScene?: (scene: MapScene3D | null) => void;
  /**
   * Tell the player about the 3D dungeon on the map (default true): a notice with Retry when it failed, a cover
   * while a 3D-only dungeon loads or after it failed. The landing and the export have their own handling.
   */
  notices?: boolean;
}

/** The imperative camera actions (bump-key props on the view underneath). */
export interface ReplayCameraHandle {
  /** Cut the cinematic camera straight to its next shot instead of gliding there (a jump). */
  cut: () => void;
  /** The top-down view. */
  topDown: () => void;
  /** Report the current orbit pose through the view's `onCameraCapture`. */
  capturePose: () => void;
  /** The live 3D scene (for capture), or null before it exists and after it is disposed. */
  scene: () => MapScene3D | null;
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
  /** The follow camera has the camera (the scene's report; the framing without a 3D scene). */
  following: boolean;
  /** The viewer took the camera from the follow camera: offer the way back (followHandoff.ts). */
  wayBack: boolean;
  /** Handed to the view: the scene's camera owner reports. */
  onCameraOwnerChange: (owner: CameraOwner | null, taken: boolean) => void;
  /** Back to the default framing: the Director on the mesh, the party-following camera across a run. */
  followGroup: () => void;
  /** The way back ("Back to the action", R): out of walk mode if walking, then as Follow. */
  backToAction: () => void;
  /** Hand the camera back to the Director without re-applying the default view (the landing, on a new pull). */
  releaseCamera: () => void;
  followGuid: string | null;
  setFollowGuid: (guid: string | null) => void;
  /** A unit frame's Follow: the Director on that unit (resumed if the user had pinned a framing); again stops it. */
  followUnit: (guid: string) => void;
  cameraHandle: ReplayCameraHandle;
  /** Handed to the view: keeps the live 3D scene for `cameraHandle.scene()` (no re-render). */
  onScene: (scene: MapScene3D | null) => void;
  cutKey: number;
  topDownKey: number;
  cameraCaptureKey: number;
  unitModelUrls: PublishedUnitModelUrls | undefined;
  interactive: boolean;
  webglFallback: "2d" | "none";
  /** The 3D dungeon's state, and what the map shows about it. */
  dungeon3D: {
    status: Dungeon3DStatus;
    notices: boolean;
    notice: boolean;
    cover: "loading" | "failed" | null;
    canRetry: boolean;
  };
  /** Load the 3D dungeon again after it failed (does nothing otherwise). */
  retryDungeon: () => void;
  /** Hide the failure notice (until the next failure). */
  dismissDungeonNotice: () => void;
  /** Which optional scene fields the view receives. */
  sceneFields: ReturnType<typeof sceneFieldsFor>;
}

/**
 * The 3D replay's wiring, owned once: builds the scene from the source and the
 * injected clock, holds the last scene while the panel reprocesses, requests
 * the mesh, keeps the framing, decides who drives the camera, and keeps the
 * Follow state. `ReplayPlayer` renders it; a host adds clock, capabilities and slots.
 */
export function useReplayPlayer(options: ReplayPlayerOptions): ReplayPlayerState {
  const { source, clock, wholeRun = false, meshOn, renderedCanvas = "without-mesh", camera } = options;
  const { heldScene = "panel", meshFailure = "report", reframe = "on-selection", interactive = true, webglFallback = "2d" } = options;
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const show3D = !webglUnavailable;
  const [meshState, setMeshStateRaw] = useState<DungeonMeshState>("loading");
  // Failed loads so far, the failure count when the notice was dismissed, and retries asked for.
  const [meshFailures, setMeshFailures] = useState(0);
  const [noticeDismissedAt, setNoticeDismissedAt] = useState(-1);
  const [meshRetry, setMeshRetry] = useState(0);
  const setMeshState = useCallback((state: DungeonMeshState) => {
    if (state === "failed") setMeshFailures((count) => count + 1);
    setMeshStateRaw(effectiveMeshState(state, meshFailure));
  }, [meshFailure]);
  const scene = useMapScene(source, {
    rawDungeonProjection: rawProjection(options.rawProjection ?? "when-mesh-ready", show3D, meshOn, meshState),
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
  if (shouldHoldScene(live, held, heldScene)) {
    setHeld(live);
    setHeldValue(Boolean(options.holdValue));
  }
  const { ready, reloading } = shownScene(live, held, Boolean(source.loading || source.processing), heldScene);

  // Everything read from the scene through plain functions comes first, ahead of the memos below.
  const { centre: focusCentre, zoom: fitZoom } = focusParts(ready);
  const autoFit = ready?.autoFit ?? null;
  const defaultViewport = defaultViewportFor(ready);
  const readyWholeRun = Boolean(ready?.wholeRun);
  const [storedFraming, setFraming] = useState<MapFraming>(INITIAL_MAP_FRAMING);
  // A new selection or the replay moving into another encounter re-frames;
  // loading states (e.g. reprocessing after a filter change) keep the framing.
  const framing = ready && reframe === "on-selection" && options.fixedView === undefined
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
  const prefetchUrl = options.prefetchMesh !== false && options.dungeonMesh === undefined && meshWanted && prefetchMesh && iconBaseUrl
    ? dungeonMeshUrl(prefetchMesh, iconBaseUrl)
    : null;
  useEffect(() => {
    if (prefetchUrl) dungeonMeshBytes(prefetchUrl).catch(() => {});
  }, [prefetchUrl]);
  // Under "use-tiles", a scene without a mesh plays on its tiles at once.
  if (meshlessReady(meshFailure, ready !== null, mesh !== null) && meshState !== "ready") setMeshStateRaw("ready");
  const view: MapViewRequest = options.fixedView ?? { viewport: framing.viewport ?? defaultViewport, key: String(framing.revision) };
  const onUserViewport = useCallback((viewport: MapViewport) => {
    setFraming((current) => manualMapFraming(current, viewport));
  }, []);
  const applyFraming = (viewport: MapViewport) => setFraming(pinMapFraming(framing, viewport));
  const followGroup = () => setFraming({ ...framing, viewport: null, manual: false, revision: framing.revision + 1 });
  const releaseCamera = () => {
    if (framing.viewport !== null || framing.manual) setFraming({ ...framing, viewport: null, manual: false });
  };

  const dungeonStatus = dungeon3DStatus({ show3D, hasMesh: mesh !== null, meshWanted, meshState });
  const notices = options.notices !== false;
  const overlay = dungeon3DOverlay(dungeonStatus, { meshOnly, failures: meshFailures, dismissedAt: noticeDismissedAt });
  const canRetry = canRetryDungeon(dungeonStatus);
  const dungeon3D = { status: dungeonStatus, notices, notice: notices && overlay.notice, cover: notices ? overlay.cover : null, canRetry };
  const retryDungeon = () => {
    if (canRetry) setMeshRetry((attempt) => attempt + 1);
  };
  const dismissDungeonNotice = () => setNoticeDismissedAt(meshFailures);
  const { mode: cameraMode, cinematic } = cameraModeFor(camera, framing, options.fixedView !== undefined);
  const onMesh = show3D && meshWanted && meshState === "ready";
  const { canFollow } = followState(readyWholeRun, onMesh, cinematic);
  // The scene's camera owner decides Follow and the way back (chronicle-2020).
  // A take releases the framing, as a pan or zoom does, so the whole run's
  // follow grid stops handing the camera back on its own.
  const [cameraHandoff, setCameraHandoff] = useState(INITIAL_CAMERA_HANDOFF);
  const onCameraOwnerChange = useCallback((owner: CameraOwner | null, taken: boolean) => {
    setCameraHandoff((current) => reportCameraOwner(current, owner, taken));
    if (taken) setFraming(releasedFraming);
  }, []);
  const { following, wayBack } = followControls(canFollow, cinematic, cameraHandoff);
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
  const sceneRef = useRef<MapScene3D | null>(null);
  const onSceneOption = options.onScene;
  const onScene = useCallback((created: MapScene3D | null) => {
    sceneRef.current = created;
    onSceneOption?.(created);
  }, [onSceneOption]);
  const scene3d = useCallback(() => sceneRef.current, []);
  const backToAction = () => {
    // Follow while walking moves the character: leave walk mode first.
    const scene3D = sceneRef.current;
    if (scene3D?.cameraOwner() === "walk") scene3D.setWalking(false);
    followGroup();
  };
  // R, with the pointer over the map, while the way back shows.
  const backKeyRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    backKeyRef.current = wayBack ? backToAction : null;
  });
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const back = backKeyRef.current;
      if (!back || !isBackToActionKey(event) || !sceneRef.current?.pointerOverMap()) return;
      event.preventDefault();
      back();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const cameraHandle = useMemo((): ReplayCameraHandle => ({ cut, topDown, capturePose, scene: scene3d }), [capturePose, cut, scene3d, topDown]);
  const onUnavailable = options.onUnavailable;
  const markWebglUnavailable = useCallback(() => {
    setWebglUnavailable(true);
    onUnavailable?.();
  }, [onUnavailable]);

  const unitModelsQuery = useQuery({
    queryKey: ["unit-models"],
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: !options.unitModelUrls && options.unitModels !== "none",
    queryFn: () => fetchUnitModelUrls(),
  });

  // Last: the compiler keeps these memos only after every other read of the scene.
  // A retry hands the view a new request for the same dungeon: the scene loads it again only after a failure (it
  // skips a dungeon it already has or is loading), and a failed download or parse is not cached.
  const sceneMesh = useMemo((): DungeonMeshRequest | null =>
    meshRetry >= 0 && meshWanted && mesh && meshUrl ? { url: meshUrl, bounds: mesh.bounds, liquid: dungeonMeshLiquid(mesh) } : null,
  [mesh, meshUrl, meshWanted, meshRetry]);
  const dungeonMesh = options.dungeonMesh !== undefined ? options.dungeonMesh : sceneMesh;

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
    wayBack,
    onCameraOwnerChange,
    followGroup,
    backToAction,
    releaseCamera,
    followGuid,
    setFollowGuid,
    followUnit,
    cameraHandle,
    onScene,
    cutKey,
    topDownKey,
    cameraCaptureKey,
    unitModelUrls: options.unitModelUrls ?? (options.unitModels === "none" ? undefined : unitModelsQuery.data),
    interactive,
    webglFallback,
    sceneFields: sceneFieldsFor(options.sceneFields ?? "all"),
    dungeon3D,
    retryDungeon,
    dismissDungeonNotice,
  };
}
