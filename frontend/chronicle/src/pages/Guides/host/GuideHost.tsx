import { useQuery } from "@tanstack/react-query";
import { Expand, LogOut, Maximize2, Minimize2, Pause, Play, RefreshCw, TriangleAlert } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import MapView3D from "../../Instance/EventsPanels/Map/MapView3D";
import { clampViewport } from "../../Instance/EventsPanels/Map/mapModel";
import { applySceneBatch, createInitialScene, UI_ROOT_ID, type RetainedScene, type SceneNode, type Viewport } from "../protocol";
import { createAssetUrlRegistry, guideHostReducer, INITIAL_GUIDE_HOST_STATE, type GuideHostAction, type GuideHostState } from "./lifecycle";
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

export interface GuideHostProps {
  guide: GuidePackageLike;
  runtimeFactory: GuideRuntimeFactory;
  iconBaseUrl: string;
  onExit(): void;
  mapResolver?: GuideMapResolver;
  MapRenderer?: GuideMapRenderer;
  className?: string;
}

function DefaultGuideMapRenderer(props: GuideMapRenderProps) {
  return (
    <MapView3D
      ground={props.ground}
      markers={props.markers}
      projectSample={props.projectSample}
      cursorMs={0}
      playing={false}
      playbackSpeed={1}
      view={props.view}
      planItems={props.planItems}
      dungeonMesh={props.dungeonMesh}
      onUnitClick={props.onUnitClick}
      onUnavailable={props.onUnavailable}
    />
  );
}

function px(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function anchorTransform(anchor: unknown): string | undefined {
  switch (anchor) {
    case "top": return "translateX(-50%)";
    case "top-right": return "translateX(-100%)";
    case "left": return "translateY(-50%)";
    case "center": return "translate(-50%, -50%)";
    case "right": return "translate(-100%, -50%)";
    case "bottom-left": return "translateY(-100%)";
    case "bottom": return "translate(-50%, -100%)";
    case "bottom-right": return "translate(-100%, -100%)";
    default: return undefined;
  }
}

function anchoredPosition(anchor: unknown, x: number, y: number): Pick<CSSProperties, "left" | "top"> {
  const horizontal = anchor === "top" || anchor === "center" || anchor === "bottom"
    ? "50%"
    : anchor === "top-right" || anchor === "right" || anchor === "bottom-right" ? "100%" : "0%";
  const vertical = anchor === "left" || anchor === "center" || anchor === "right"
    ? "50%"
    : anchor === "bottom-left" || anchor === "bottom" || anchor === "bottom-right" ? "100%" : "0%";
  return {
    left: `calc(${horizontal} + ${x}px)`,
    top: `calc(${vertical} - ${y}px)`,
  };
}

function nodeStyle(node: SceneNode): CSSProperties {
  const props = node.props;
  const x = px(props.x) ?? 0;
  const y = px(props.y) ?? 0;
  return {
    position: "absolute",
    ...anchoredPosition(props.anchor, x, y),
    width: px(props.width),
    height: px(props.height),
    transform: anchorTransform(props.anchor),
    zIndex: px(props.zIndex),
    display: props.visible === false ? "none" : undefined,
    opacity: px(props.alpha),
    color: text(props.color) || undefined,
    backgroundColor: text(props.backgroundColor) || undefined,
    borderColor: text(props.borderColor) || undefined,
    borderStyle: props.borderColor ? "solid" : undefined,
    borderWidth: props.borderColor ? 1 : undefined,
    fontSize: px(props.fontSize),
    textAlign: props.align === "left" || props.align === "center" || props.align === "right" ? props.align : undefined,
    pointerEvents: node.kind === "button" || node.listeners.includes("click") ? "auto" : "none",
  };
}

interface GuideUiSceneProps {
  scene: RetainedScene;
  assets: ReadonlyMap<string, string>;
  onNodeClick(node: SceneNode, event: ReactMouseEvent): void;
}

export function GuideUiScene({ scene, assets, onNodeClick }: GuideUiSceneProps) {
  const childrenByParent = new Map<string, SceneNode[]>();
  for (const node of scene.nodes.values()) {
    if (node.parentId === null || node.kind === "unit" || node.kind === "icon" || node.kind === "map-text"
      || node.kind === "line" || node.kind === "arrow" || node.kind === "circle" || node.kind === "cone" || node.kind === "polygon") continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }
  for (const children of childrenByParent.values()) children.sort((left, right) => (px(left.props.zIndex) ?? 0) - (px(right.props.zIndex) ?? 0));

  const renderNode = (node: SceneNode): ReactNode => {
    const style = nodeStyle(node);
    const click = node.listeners.includes("click") ? (event: ReactMouseEvent) => onNodeClick(node, event) : undefined;
    const children = childrenByParent.get(node.id)?.map(renderNode);
    if (node.kind === "frame") return <div key={node.id} data-guide-node={node.id} style={style} onClick={click}>{children}</div>;
    if (node.kind === "text") {
      return <div key={node.id} data-guide-node={node.id} className="styled-scrollbar overflow-auto whitespace-pre-wrap" style={style} onClick={click}>{text(node.props.text)}</div>;
    }
    if (node.kind === "texture") {
      const source = assets.get(text(node.props.asset));
      return source ? (
        <img
          key={node.id}
          data-guide-node={node.id}
          src={source}
          alt=""
          draggable={false}
          style={{ ...style, objectFit: "contain", filter: node.props.tint ? `drop-shadow(0 0 0 ${text(node.props.tint)})` : undefined }}
          onClick={click}
        />
      ) : null;
    }
    if (node.kind === "button") {
      return (
        <button
          key={node.id}
          data-guide-node={node.id}
          type="button"
          disabled={node.props.enabled === false}
          style={style}
          onClick={(event) => onNodeClick(node, event)}
          className="rounded border px-3 py-1 font-medium shadow-lg backdrop-blur-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {text(node.props.text)}
        </button>
      );
    }
    return null;
  };

  return <>{(childrenByParent.get(UI_ROOT_ID) ?? []).map(renderNode)}</>;
}

export interface TrustedGuideControlsProps {
  status: "loading" | "running" | "stopped" | "error";
  guideName: string;
  fullscreen: boolean;
  onStart(): void;
  onStop(): void;
  onRestart(): void;
  onFullscreen(): void;
  onExit(): void;
}

export function TrustedGuideControls({
  status,
  guideName,
  fullscreen,
  onStart,
  onStop,
  onRestart,
  onFullscreen,
  onExit,
}: TrustedGuideControlsProps) {
  return (
    <div data-guide-trusted-controls className="pointer-events-auto absolute inset-x-0 top-0 z-[1000] flex items-center justify-between gap-3 border-b border-amber-200/15 bg-slate-950/88 px-3 py-2 text-slate-100 shadow-2xl backdrop-blur-md">
      <div className="min-w-0">
        <div className="truncate font-serif text-sm font-semibold tracking-wide text-amber-100">{guideName}</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Trusted Chronicle controls · {status}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {status === "stopped" ? (
          <button type="button" onClick={onStart} className="rounded-md border border-emerald-300/25 bg-emerald-950/80 p-2 text-emerald-200 hover:bg-emerald-900" aria-label="Start guide"><Play className="size-4" /></button>
        ) : (
          <button type="button" onClick={onStop} disabled={status === "error"} className="rounded-md border border-slate-500/30 bg-slate-900/80 p-2 text-slate-200 hover:bg-slate-800 disabled:opacity-40" aria-label="Stop guide"><Pause className="size-4" /></button>
        )}
        <button type="button" onClick={onRestart} className="rounded-md border border-slate-500/30 bg-slate-900/80 p-2 text-slate-200 hover:bg-slate-800" aria-label="Restart guide"><RefreshCw className="size-4" /></button>
        <button type="button" onClick={onFullscreen} className="rounded-md border border-slate-500/30 bg-slate-900/80 p-2 text-slate-200 hover:bg-slate-800" aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button type="button" onClick={onExit} className="rounded-md border border-amber-300/25 bg-amber-950/70 p-2 text-amber-100 hover:bg-amber-900" aria-label="Exit guide"><LogOut className="size-4" /></button>
      </div>
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
  const [mapUnavailableRun, setMapUnavailableRun] = useState<number | null>(null);
  const { lifecycle: state, scene, assets } = model;
  const mapUnavailable = mapUnavailableRun === restartKey;
  const mapId = guide.manifest.map_id ?? guide.manifest.mapId ?? null;

  const mapQuery = useQuery({
    queryKey: ["guide-map", mapId, iconBaseUrl],
    enabled: mapId !== null && iconBaseUrl.length > 0,
    staleTime: 60 * 60 * 1000,
    queryFn: () => mapResolver(mapId!, iconBaseUrl),
  });

  useEffect(() => {
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
            const next = applySceneBatch(sceneRef.current, operations);
            sceneRef.current = next;
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
  }, [guide, restartKey, runtimeFactory]);

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
    runtimeRef.current?.stop("user stopped");
    runtimeRef.current = null;
    assetRegistryRef.current?.revoke();
    assetRegistryRef.current = null;
    sceneRef.current = createInitialScene();
    dispatch({ type: "stop" });
  }, []);

  const restart = useCallback(() => {
    runtimeRef.current?.stop("user restarted");
    setRestartKey((key) => key + 1);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await hostRef.current?.requestFullscreen();
  }, []);

  const handleNodeClick = useCallback((node: SceneNode, event: ReactMouseEvent) => {
    if (!node.listeners.includes("click") && node.kind !== "button") return;
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
    const node = sceneRef.current.nodes.get(nodeId);
    if (!node?.listeners.includes("click")) return;
    runtimeRef.current?.event({ nodeId, event: "click" });
  }, []);

  const mapScene = useMemo(() => mapId !== null && mapQuery.data ? adaptGuideMapScene(scene, mapQuery.data, mapId, assets) : null, [assets, mapId, mapQuery.data, scene]);
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
        onStart={restart}
        onStop={stop}
        onRestart={restart}
        onFullscreen={() => void toggleFullscreen()}
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
              ground={mapQuery.data.ground}
              markers={mapScene.markers}
              projectSample={mapQuery.data.projectSample}
              view={view}
              planItems={mapScene.planItems}
              dungeonMesh={mapQuery.data.dungeonMesh}
              onUnitClick={handleUnitClick}
              onUnavailable={() => setMapUnavailableRun(restartKey)}
            />
          ) : null}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[57px] z-20">
          <GuideUiScene scene={scene} assets={assets} onNodeClick={handleNodeClick} />
        </div>
      </div>

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
