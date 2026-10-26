import { useQuery } from "@tanstack/react-query";
import { Copy, Crosshair, Expand, Footprints, LogOut, Maximize2, Minimize2, Pause, Play, RefreshCw, TriangleAlert } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { fetchMiniatureUrls } from "../../Instance/EventsPanels/Map/bossMinis";
import MapView3D from "../../Instance/EventsPanels/Map/MapView3D";
import { clampViewport, type MapPoint } from "../../Instance/EventsPanels/Map/mapModel";
import { applySceneBatch, createInitialScene, type RetainedScene, type SceneNode, type Viewport } from "../protocol";
import { GuideUiScene } from "../protocol/GuideUiScene";
export { GuideUiScene } from "../protocol/GuideUiScene";
import { createAssetUrlRegistry, guideHostReducer, INITIAL_GUIDE_HOST_STATE, type GuideHostAction, type GuideHostState } from "./lifecycle";
import { loadGuideEventData } from "./eventStreams";
import { adaptGuideMapScene, defaultGuideMapResolver } from "./mapAdapter";
import type {
  GuideMapRenderer,
  GuideMapRenderProps,
  GuideMapResolver,
  GuidePackageLike,
  GuideRuntimeControllerLike,
  GuideRuntimeFactory,
} from "./types";

const EMPTY_ASSET_URLS: ReadonlyMap<string, string> = new Map();
const EMPTY_ROUTE_POINTS: MapPoint[] = []; // Guides do not supply encounter movement routes.

export interface GuideHostProps {
  guide: GuidePackageLike;
  runtimeFactory: GuideRuntimeFactory;
  iconBaseUrl: string;
  onExit(): void;
  mapResolver?: GuideMapResolver;
  MapRenderer?: GuideMapRenderer;
  authoring?: boolean;
  className?: string;
}

function DefaultGuideMapRenderer(props: GuideMapRenderProps) {
  return (
    <MapView3D
      ground={props.ground}
      markers={props.markers}
      routePoints={EMPTY_ROUTE_POINTS}
      projectSample={props.projectSample}
      cursorMs={props.cursorMs}
      playing={props.playing}
      playbackSpeed={props.playbackSpeed}
      view={props.view}
      planItems={props.planItems}
      dungeonMesh={props.dungeonMesh}
      effects={props.effects}
      miniatureUrls={props.miniatureUrls}
      bossGuids={props.bossGuids}
      walking={props.walking}
      onWalkingChange={props.onWalkingChange}
      onUnitClick={props.onUnitClick}
      onUnavailable={props.onUnavailable}
    />
  );
}

export interface TrustedGuideControlsProps {
  status: "loading" | "running" | "stopped" | "error";
  guideName: string;
  fullscreen: boolean;
  walking?: boolean;
  canWalk?: boolean;
  onStart(): void;
  onStop(): void;
  onRestart(): void;
  onFullscreen(): void;
  onWalkingChange?(walking: boolean): void;
  onExit(): void;
}

export function TrustedGuideControls({
  status,
  guideName,
  fullscreen,
  walking = false,
  canWalk = false,
  onStart,
  onStop,
  onRestart,
  onFullscreen,
  onWalkingChange,
  onExit,
}: TrustedGuideControlsProps) {
  return (
    <div data-guide-trusted-controls className="pointer-events-auto absolute inset-x-0 top-0 z-[1000] flex items-center justify-between gap-3 border-b border-border bg-card/95 px-3 py-2 text-card-foreground shadow-xl backdrop-blur-xl">
      <div className="min-w-0">
        <div className="truncate font-serif text-sm font-semibold tracking-wide text-foreground">{guideName}</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Trusted Chronicle controls · {status}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {status === "stopped" ? (
          <button type="button" onClick={onStart} className="rounded-md border border-emerald-500/30 bg-emerald-950/70 p-2 text-emerald-300 transition hover:bg-emerald-900" aria-label="Start guide"><Play className="size-4" /></button>
        ) : (
          <button type="button" onClick={onStop} disabled={status === "error"} className="rounded-md border border-border bg-secondary p-2 text-secondary-foreground transition hover:bg-accent disabled:opacity-40" aria-label="Stop guide"><Pause className="size-4" /></button>
        )}
        <button type="button" onClick={onRestart} className="rounded-md border border-border bg-secondary p-2 text-secondary-foreground transition hover:bg-accent" aria-label="Restart guide"><RefreshCw className="size-4" /></button>
        {canWalk && (
          <button
            type="button"
            onClick={() => onWalkingChange?.(!walking)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-semibold transition ${walking ? "border-amber-400/50 bg-amber-500/15 text-amber-200" : "border-border bg-secondary text-secondary-foreground hover:bg-accent"}`}
            aria-label={walking ? "Exit walk mode" : "Enter walk mode"}
            aria-pressed={walking}
            title="Walk mode · WASD to move, mouse to look, Esc to exit"
          >
            <Footprints className="size-4" />
            <span className="hidden sm:inline">{walking ? "Walking" : "Walk"}</span>
          </button>
        )}
        <button type="button" onClick={onFullscreen} className="rounded-md border border-border bg-secondary p-2 text-secondary-foreground transition hover:bg-accent" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button type="button" onClick={onExit} className="rounded-md border border-amber-500/30 bg-amber-950/60 p-2 text-amber-200 transition hover:bg-amber-900" aria-label="Exit guide"><LogOut className="size-4" /></button>
      </div>
    </div>
  );
}

interface GuidePlaybackControlsProps {
  startMs: number;
  endMs: number;
  cursorMs: number;
  playing: boolean;
  speed: number;
  onCursor(cursorMs: number): void;
  onPlaying(playing: boolean): void;
  onSpeed(speed: number): void;
}

function GuidePlaybackControls({ startMs, endMs, cursorMs, playing, speed, onCursor, onPlaying, onSpeed }: GuidePlaybackControlsProps) {
  const elapsed = Math.max(0, cursorMs - startMs);
  const duration = Math.max(1, endMs - startMs);
  return (
    <div data-guide-playback className="pointer-events-auto absolute bottom-4 right-4 z-[850] flex w-[min(34rem,calc(100%-2rem))] items-center gap-2 rounded-xl border border-border bg-card/95 p-2 text-card-foreground shadow-2xl backdrop-blur-xl">
      <button type="button" onClick={() => onPlaying(!playing)} className="rounded-md border border-border bg-secondary p-2 hover:bg-accent" aria-label={playing ? "Pause replay" : "Play replay"}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <button type="button" onClick={() => { onCursor(startMs); onPlaying(true); }} className="rounded-md border border-border bg-secondary p-2 hover:bg-accent" aria-label="Replay chapter">
        <RefreshCw className="size-4" />
      </button>
      <input
        aria-label="Guide timeline"
        type="range"
        min={startMs}
        max={endMs}
        step={25}
        value={Math.min(endMs, Math.max(startMs, cursorMs))}
        onChange={(event) => { onPlaying(false); onCursor(Number(event.currentTarget.value)); }}
        className="min-w-0 flex-1 accent-amber-500"
      />
      <span className="w-20 text-right font-mono text-[11px] text-muted-foreground">{(elapsed / 1000).toFixed(1)} / {(duration / 1000).toFixed(1)}s</span>
      <select aria-label="Playback speed" value={speed} onChange={(event) => onSpeed(Number(event.currentTarget.value))} className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs">
        {[0.5, 1, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
      </select>
    </div>
  );
}

function GuideAuthoringOverlay({
  markers,
  unitId,
  sample,
  elapsedMs,
  onUnit,
}: {
  markers: readonly { guid: string; name: string }[];
  unitId: string | null;
  sample: { x: number; y: number; z?: number; facing?: number } | null;
  elapsedMs: number;
  onUnit(unitId: string): void;
}) {
  const payload = unitId && sample ? JSON.stringify({
    unit_id: unitId,
    t_ms: Math.round(elapsedMs),
    x: Number(sample.x.toFixed(3)),
    y: Number(sample.y.toFixed(3)),
    ...(sample.z === undefined ? {} : { z: Number(sample.z.toFixed(3)) }),
    ...(sample.facing === undefined ? {} : { facing: Number(sample.facing.toFixed(5)) }),
  }, null, 2) : "Select a raid chip to inspect its world position.";
  return (
    <div data-guide-authoring className="pointer-events-auto absolute bottom-20 right-4 z-[860] w-72 rounded-xl border border-cyan-400/30 bg-slate-950/95 p-3 text-slate-100 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300"><Crosshair className="size-4" />Coordinate authoring</div>
      <div className="styled-scrollbar mt-2 flex max-h-24 flex-wrap gap-1 overflow-auto" aria-label="Raid units">
        {markers.map((marker) => (
          <button
            key={marker.guid}
            type="button"
            onClick={() => onUnit(marker.guid)}
            aria-pressed={marker.guid === unitId}
            className={`rounded-full border px-2 py-1 text-[10px] font-semibold transition ${marker.guid === unitId ? "border-cyan-300 bg-cyan-500/25 text-cyan-100" : "border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-500/60 hover:text-cyan-200"}`}
          >
            {marker.name}
          </button>
        ))}
      </div>
      <pre className="styled-scrollbar mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-black/40 p-2 font-mono text-[11px] text-slate-300">{payload}</pre>
      {unitId && sample && (
        <button type="button" onClick={() => void navigator.clipboard?.writeText(payload)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-cyan-400/25 bg-cyan-950/60 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/70">
          <Copy className="size-3.5" />Copy sample
        </button>
      )}
    </div>
  );
}

function viewportOf(element: HTMLElement | null): Viewport {
  return { width: Math.max(1, Math.round(element?.clientWidth ?? 1)), height: Math.max(1, Math.round(element?.clientHeight ?? 1)) };
}

interface GuideHostModel {
  lifecycle: GuideHostState;
  scene: RetainedScene;
  assets: ReadonlyMap<string, string>;
}

type GuideHostModelAction = GuideHostAction
  | { type: "scene"; scene: RetainedScene }
  | { type: "assets"; assets: ReadonlyMap<string, string> };

function guideHostModelReducer(state: GuideHostModel, action: GuideHostModelAction): GuideHostModel {
  if (action.type === "scene") return { ...state, scene: action.scene };
  if (action.type === "assets") return { ...state, assets: action.assets };
  const reset = action.type === "start" || action.type === "stop" || action.type === "error";
  return {
    lifecycle: guideHostReducer(state.lifecycle, action),
    scene: reset ? createInitialScene() : state.scene,
    assets: reset ? EMPTY_ASSET_URLS : state.assets,
  };
}

export function GuideHost({
  guide,
  runtimeFactory,
  iconBaseUrl,
  onExit,
  mapResolver = defaultGuideMapResolver,
  MapRenderer = DefaultGuideMapRenderer,
  authoring = false,
  className = "",
}: GuideHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GuideRuntimeControllerLike | null>(null);
  const assetRegistryRef = useRef<ReturnType<typeof createAssetUrlRegistry> | null>(null);
  const sceneRef = useRef<RetainedScene>(createInitialScene());
  const [model, dispatch] = useReducer(guideHostModelReducer, {
    lifecycle: INITIAL_GUIDE_HOST_STATE,
    scene: createInitialScene(),
    assets: EMPTY_ASSET_URLS,
  });
  const [restartKey, setRestartKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [walking, setWalking] = useState(false);
  const [selectedAuthoringUnit, setSelectedAuthoringUnit] = useState<string | null>(null);
  const [mapUnavailableRun, setMapUnavailableRun] = useState<number | null>(null);
  const { lifecycle: state, scene, assets } = model;
  const mapUnavailable = mapUnavailableRun === restartKey;
  const mapId = guide.manifest.map_id ?? guide.manifest.mapId ?? null;

  const eventDataState = useMemo(() => {
    try {
      return { data: loadGuideEventData(guide), error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, [guide]);
  const activeEventEncounter = scene.chapter ? eventDataState.data?.result.encounters.get(scene.chapter) ?? null : null;
  const [timelineCursorMs, setTimelineCursorMs] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(true);
  const [timelineSpeed, setTimelineSpeed] = useState(1);

  const mapQuery = useQuery({
    queryKey: ["guide-map", mapId, iconBaseUrl],
    enabled: mapId !== null && iconBaseUrl.length > 0,
    staleTime: 60 * 60 * 1000,
    queryFn: () => mapResolver(mapId!, iconBaseUrl),
  });

  const miniatureQuery = useQuery({
    queryKey: ["guide-miniatures"],
    enabled: mapId !== null,
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchMiniatureUrls(),
  });

  useEffect(() => {
    if (!activeEventEncounter || !timelinePlaying) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = (now - last) * timelineSpeed;
      last = now;
      setTimelineCursorMs((cursor) => {
        const next = cursor + elapsed;
        if (next >= activeEventEncounter.endMs) {
          window.clearInterval(timer);
          setTimelinePlaying(false);
          return activeEventEncounter.endMs;
        }
        return next;
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [activeEventEncounter, timelinePlaying, timelineSpeed]);

  useEffect(() => {
    if (eventDataState.error) {
      dispatch({ type: "error", error: eventDataState.error });
      return;
    }
    let active = true;
    let controller: GuideRuntimeControllerLike | null = null;
    sceneRef.current = createInitialScene();
    dispatch({ type: "start" });

    let registry: ReturnType<typeof createAssetUrlRegistry>;
    try {
      registry = createAssetUrlRegistry(guide.manifest.assets, (path) => guide.read(path));
      assetRegistryRef.current = registry;
      dispatch({ type: "assets", assets: registry.urls });
      controller = runtimeFactory({
        onReady: () => { if (active) dispatch({ type: "ready" }); },
        onBatch: (operations) => {
          if (!active) return;
          try {
            const previousChapter = sceneRef.current.chapter;
            const next = applySceneBatch(sceneRef.current, operations);
            sceneRef.current = next;
            if (next.chapter !== previousChapter) {
              const encounter = next.chapter ? eventDataState.data?.result.encounters.get(next.chapter) : null;
              if (encounter) {
                setTimelineCursorMs(encounter.startMs);
                setTimelinePlaying(true);
              } else {
                setTimelinePlaying(false);
              }
            }
            dispatch({ type: "scene", scene: next });
          } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            controller?.stop("invalid scene batch");
            runtimeRef.current = null;
            registry.revoke();
            dispatch({ type: "error", error: failure });
          }
        },
        onError: (error) => {
          if (!active) return;
          controller?.stop("runtime error");
          runtimeRef.current = null;
          registry.revoke();
          dispatch({ type: "error", error });
        },
      });
      runtimeRef.current = controller;
      controller.start({ guide, viewport: viewportOf(hostRef.current) });
    } catch (error) {
      dispatch({ type: "error", error: error instanceof Error ? error : new Error(String(error)) });
      return;
    }

    return () => {
      active = false;
      controller?.stop("host cleanup");
      if (runtimeRef.current === controller) runtimeRef.current = null;
      registry.revoke();
      if (assetRegistryRef.current === registry) assetRegistryRef.current = null;
    };
  }, [eventDataState.data, eventDataState.error, guide, restartKey, runtimeFactory]);

  useEffect(() => {
    const element = hostRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let last = viewportOf(element);
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      const next = box
        ? { width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) }
        : viewportOf(element);
      if (next.width === last.width && next.height === last.height) return;
      last = next;
      runtimeRef.current?.resize(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setFullscreen(document.fullscreenElement === hostRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const stop = useCallback(() => {
    setWalking(false);
    runtimeRef.current?.stop("user stopped");
    runtimeRef.current = null;
    assetRegistryRef.current?.revoke();
    assetRegistryRef.current = null;
    sceneRef.current = createInitialScene();
    dispatch({ type: "stop" });
  }, []);

  const restart = useCallback(() => {
    setWalking(false);
    runtimeRef.current?.stop("user restarted");
    setRestartKey((key) => key + 1);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await hostRef.current?.requestFullscreen();
  }, []);

  const handleNodeClick = useCallback((node: SceneNode, event: ReactMouseEvent) => {
    if (!node.listeners.includes("click")) return;
    const bounds = hostRef.current?.getBoundingClientRect();
    runtimeRef.current?.event({
      nodeId: node.id,
      event: "click",
      x: bounds ? event.clientX - bounds.left : undefined,
      y: bounds ? event.clientY - bounds.top : undefined,
      button: event.button,
    });
  }, []);

  const handleUnitClick = useCallback((nodeId: string) => {
    if (authoring) setSelectedAuthoringUnit(nodeId);
    const node = sceneRef.current.nodes.get(nodeId);
    if (node?.listeners.includes("click")) runtimeRef.current?.event({ nodeId, event: "click" });
  }, [authoring]);

  const canWalk = Boolean(mapQuery.data?.dungeonMesh && !mapUnavailable);

  const mapScene = useMemo(() => mapId !== null && mapQuery.data
    ? adaptGuideMapScene(scene, mapQuery.data, mapId, assets, activeEventEncounter, activeEventEncounter ? timelineCursorMs : null)
    : null, [activeEventEncounter, assets, mapId, mapQuery.data, scene, timelineCursorMs]);
  const selectedAuthoringMarker = selectedAuthoringUnit ? mapScene?.markers.find((marker) => marker.guid === selectedAuthoringUnit) ?? null : null;
  const view = useMemo(() => ({
    viewport: clampViewport({ centerX: scene.camera.x, centerY: scene.camera.y, zoom: scene.camera.zoom }),
    key: `${scene.camera.x}:${scene.camera.y}:${scene.camera.zoom}`,
  }), [scene.camera.x, scene.camera.y, scene.camera.zoom]);

  return (
    <div ref={hostRef} className={`relative isolate min-h-[32rem] w-full overflow-hidden bg-slate-950 text-slate-100 ${className}`}>
      <TrustedGuideControls
        status={state.status}
        guideName={guide.manifest.name}
        fullscreen={fullscreen}
        walking={walking}
        canWalk={canWalk}
        onStart={restart}
        onStop={stop}
        onRestart={restart}
        onFullscreen={() => void toggleFullscreen()}
        onWalkingChange={setWalking}
        onExit={onExit}
      />

      <div data-guide-layer className="absolute inset-0 z-10">
        <div className="absolute inset-x-0 bottom-0 top-[57px] overflow-hidden bg-[radial-gradient(circle_at_50%_15%,rgba(120,84,36,0.14),transparent_42%),linear-gradient(180deg,#071018,#020617)]">
          {mapId === null ? (
            <div className="grid size-full place-items-center text-sm text-slate-400">This guide does not declare a map.</div>
          ) : mapQuery.isPending ? (
            <div className="grid size-full place-items-center text-sm text-slate-400"><Expand className="mr-2 inline size-4 animate-pulse" />Loading map…</div>
          ) : mapQuery.isError || !mapQuery.data ? (
            <div className="grid size-full place-items-center px-6 text-center text-sm text-amber-200">Map assets are unavailable. Guide controls remain active.</div>
          ) : mapUnavailable ? (
            <div className="grid size-full place-items-center px-6 text-center text-sm text-amber-200"><TriangleAlert className="mb-2 size-6" />WebGL is unavailable for this map.</div>
          ) : mapScene ? (
            <MapRenderer
              cursorMs={activeEventEncounter ? timelineCursorMs : 0}
              playing={Boolean(activeEventEncounter && timelinePlaying)}
              playbackSpeed={timelineSpeed}
              ground={mapQuery.data.ground}
              markers={mapScene.markers}
              projectSample={mapQuery.data.projectSample}
              view={view}
              planItems={mapScene.planItems}
              dungeonMesh={mapQuery.data.dungeonMesh}
              effects={mapScene.effects}
              miniatureUrls={miniatureQuery.data}
              bossGuids={mapScene.bossGuids}
              walking={walking}
              onWalkingChange={setWalking}
              onUnitClick={handleUnitClick}
              onUnavailable={() => { setWalking(false); setMapUnavailableRun(restartKey); }}
            />
          ) : null}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[57px] z-20">
          <GuideUiScene scene={scene} assets={assets} onNodeClick={handleNodeClick} />
        </div>
      </div>

      {state.status === "running" && authoring && activeEventEncounter && mapScene && (
        <GuideAuthoringOverlay
          markers={mapScene.markers}
          unitId={selectedAuthoringMarker?.guid ?? null}
          sample={selectedAuthoringMarker?.sample ?? null}
          elapsedMs={timelineCursorMs - activeEventEncounter.startMs}
          onUnit={setSelectedAuthoringUnit}
        />
      )}

      {state.status === "running" && activeEventEncounter && (
        <GuidePlaybackControls
          startMs={activeEventEncounter.startMs}
          endMs={activeEventEncounter.endMs}
          cursorMs={timelineCursorMs}
          playing={timelinePlaying}
          speed={timelineSpeed}
          onCursor={setTimelineCursorMs}
          onPlaying={setTimelinePlaying}
          onSpeed={setTimelineSpeed}
        />
      )}

      {state.status !== "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[57px] z-[900] grid place-items-center bg-slate-950/55 p-6 backdrop-blur-[2px]">
          <div className="pointer-events-auto max-w-md rounded-lg border border-amber-200/15 bg-slate-950/90 p-5 text-center shadow-2xl">
            {state.status === "loading" && <><RefreshCw className="mx-auto mb-3 size-6 animate-spin text-amber-300" /><p className="text-sm text-slate-300">Starting the isolated guide runtime…</p></>}
            {state.status === "stopped" && <><Pause className="mx-auto mb-3 size-6 text-slate-400" /><p className="text-sm text-slate-300">Guide stopped. Use the trusted play control to start a fresh runtime.</p></>}
            {state.status === "error" && <><TriangleAlert className="mx-auto mb-3 size-6 text-red-300" /><p className="font-medium text-red-100">Guide stopped for safety</p><p className="styled-scrollbar mt-2 max-h-32 overflow-auto text-xs text-slate-400">{state.error}</p></>}
          </div>
        </div>
      )}
    </div>
  );
}
