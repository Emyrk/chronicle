import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Map as MapIcon, RotateCcw, Skull } from "lucide-react";
import type { Encounter } from "../../InstancePage";
import {
  mapAssetUrl,
  overlayTilePlacement,
  tilePlacement,
  type WowMapInstanceFloor,
  type WowMapLayer,
  type WowMapManualRender,
  type WowMapRenderedInstance,
  type WowMapOverlay,
} from "@/pages/Technical/mapGallery";
import { fetchMapManifest } from "@/pages/Technical/mapManifest";
import type { PanelRenderProps } from "../types";
import { isMeshOnlyInstance } from "./dungeonMeshes";
import type { MapEncounterPositions, MapPositionSample, MapResult } from "./map.processor";
import {
  clampFreeMapCamera,
  containScaleForCover,
  coverMapCanvasRect,
  dominantMapId,
  encounterRouteSamples,
  fitFreeMapCameraToPoints,
  fitMapViewport,
  pointInMapViewport,
  overviewDungeonCanvas,
  projectDungeonMapPoint,
  resolveDungeonMapCalibration,
  resolveMapArtwork,
  selectMapJourneyEncounters,
  uiMapPoint,
  zoneMapPoint,
  zoomFreeMapCamera,
  type MapCamera,
  type MapCanvasRect,
  type MapPoint,
} from "./mapModel";

function useMapManifest(iconBaseUrl: string | undefined) {
  return useQuery({
    queryKey: ["wow-map-manifest", iconBaseUrl],
    enabled: Boolean(iconBaseUrl),
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchMapManifest(iconBaseUrl!),
  });
}

function MapTiles({
  canvas,
  iconBaseUrl,
  overlays,
}: {
  canvas: WowMapLayer | WowMapInstanceFloor;
  iconBaseUrl: string;
  overlays?: WowMapOverlay[];
}) {
  return (
    <>
      {canvas.tiles.map((tile) => (
        <img
          key={`base-${tile.row}-${tile.column}-${tile.fileDataID}`}
          src={mapAssetUrl(iconBaseUrl, tile.path)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none select-none"
          style={tilePlacement(canvas, tile)}
        />
      ))}
      {overlays?.flatMap((overlay) => overlay.tiles.map((tile) => (
        <img
          key={`overlay-${overlay.id}-${tile.row}-${tile.column}-${tile.fileDataID}`}
          src={mapAssetUrl(iconBaseUrl, tile.path)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none select-none"
          style={overlayTilePlacement(canvas as WowMapLayer, overlay, tile)}
        />
      )))}
    </>
  );
}

function MapBackground({
  canvas,
  iconBaseUrl,
  overlays,
}: {
  canvas: WowMapLayer | WowMapInstanceFloor | WowMapRenderedInstance | WowMapManualRender;
  iconBaseUrl: string;
  overlays?: WowMapOverlay[];
}) {
  if ("path" in canvas) {
    return (
      <img
        src={mapAssetUrl(iconBaseUrl, canvas.path)}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 size-full select-none object-fill"
      />
    );
  }
  return <MapTiles canvas={canvas} iconBaseUrl={iconBaseUrl} overlays={overlays} />;
}

interface EncounterRoute {
  encounter: Encounter;
  points: MapPoint[];
  selected: boolean;
}

const ENCOUNTER_STATUS = {
  clean: { label: "Cleared", color: "#22c55e", icon: <CheckCircle2 className="size-3" /> },
  partial: { label: "Partial", color: "#eab308", icon: <AlertTriangle className="size-3" /> },
  reset: { label: "Reset", color: "#f97316", icon: <RotateCcw className="size-3" /> },
  wipe: { label: "Wipe", color: "#f43f5e", icon: <Skull className="size-3" /> },
} satisfies Record<Encounter["kill_type"], { label: string; color: string; icon: ReactNode }>;

function formatDuration(startTime: string, endTime: string): string {
  const durationSeconds = Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1_000));
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, "0")}` : `${seconds}s`;
}

/** A marker's hover card: the fight, how long it lasted, and how far into the instance it started. */
function MarkerTooltip({ route, instanceStartMs, small = false }: { route: EncounterRoute; instanceStartMs: number; small?: boolean }) {
  const status = ENCOUNTER_STATUS[route.encounter.kill_type];
  const offset = formatDuration(new Date(instanceStartMs).toISOString(), route.encounter.start_time);
  return (
    <span className={`pointer-events-none absolute left-1/2 top-full mt-1 hidden -translate-x-1/2 flex-col items-center whitespace-nowrap rounded bg-black/95 text-white shadow-lg group-hover:flex ${small ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"}`}>
      <span className="font-medium">{route.encounter.name} · {status.label}</span>
      <span className="text-white/60">{formatDuration(route.encounter.start_time, route.encounter.end_time)} long · {offset} into the run</span>
    </span>
  );
}

function cameraPointStyle(point: MapPoint, camera: MapCamera) {
  return {
    left: `calc(${point.leftPercent * camera.scale}% + ${camera.x}px)`,
    top: `calc(${point.topPercent * camera.scale}% + ${camera.y}px)`,
  };
}

function RouteMarker({ route, index, viewport, camera, highlighted, instanceStartMs }: {
  route: EncounterRoute;
  index: number;
  viewport: ReturnType<typeof fitMapViewport>;
  camera: MapCamera;
  highlighted: boolean;
  instanceStartMs: number;
}) {
  const point = pointInMapViewport(route.points.at(-1)!, viewport);
  const status = ENCOUNTER_STATUS[route.encounter.kill_type];
  return (
    <div
      className={`group absolute -translate-x-1/2 -translate-y-1/2 transition-transform ${highlighted ? "z-30 scale-125 animate-pulse" : route.encounter.boss ? "z-20" : "z-10 opacity-60"}`}
      style={cameraPointStyle(point, camera)}
      role="img"
      aria-label={`${index + 1}. ${route.encounter.name}, ${status.label}`}
    >
      <div
        className={`flex items-center justify-center rounded-full bg-black/90 text-white ${route.encounter.boss
          ? "size-7 border-2 border-white/90 text-[11px] font-bold shadow-[0_2px_10px_rgba(0,0,0,.95)]"
          : "size-4 border border-white/45 text-[8px] font-medium shadow-[0_1px_5px_rgba(0,0,0,.8)]"
        }`}
        style={{ boxShadow: route.encounter.boss
          ? `0 0 0 2px ${status.color}, 0 2px 10px rgba(0,0,0,.95)`
          : `0 0 0 1px ${status.color}88, 0 1px 5px rgba(0,0,0,.8)` }}
      >
        {index + 1}
      </div>
      <MarkerTooltip route={route} instanceStartMs={instanceStartMs} />
    </div>
  );
}

function JourneyEndpoint({ point, camera, kind }: {
  point: MapPoint;
  camera: MapCamera;
  kind: "start" | "end";
}) {
  const color = kind === "start" ? "#22c55e" : "#ef4444";
  return (
    <div
      className="absolute z-30 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_7px_rgba(0,0,0,.95)]"
      style={{ ...cameraPointStyle(point, camera), backgroundColor: color }}
      role="img"
      aria-label={`${kind === "start" ? "Start" : "End"} of selected route`}
      title={kind === "start" ? "Start" : "End"}
    />
  );
}

function TransitMarker({ route, viewport, camera, instanceStartMs }: {
  route: EncounterRoute;
  viewport: ReturnType<typeof fitMapViewport>;
  camera: MapCamera;
  instanceStartMs: number;
}) {
  const point = pointInMapViewport(route.points.at(-1)!, viewport);
  const status = ENCOUNTER_STATUS[route.encounter.kill_type];
  return (
    <div
      className="group absolute z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/80 opacity-65 shadow-[0_1px_4px_rgba(0,0,0,.9)]"
      style={{ ...cameraPointStyle(point, camera), backgroundColor: status.color }}
      role="img"
      aria-label={`${route.encounter.name}, unselected ${status.label.toLowerCase()} encounter`}
    >
      <MarkerTooltip route={route} instanceStartMs={instanceStartMs} small />
    </div>
  );
}

function RouteLegend({ routes, onHoverEncounter, onFocusEncounter }: {
  routes: EncounterRoute[];
  onHoverEncounter: (encounterId: string | null) => void;
  onFocusEncounter: (route: EncounterRoute) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside data-map-controls className={`absolute right-2 top-2 z-30 flex max-h-[calc(100%-1rem)] flex-col overflow-hidden rounded-md border border-white/15 bg-black/85 shadow-xl backdrop-blur-sm ${collapsed ? "w-auto" : "w-60 max-w-[44%]"}`}>
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className={`flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 ${collapsed ? "rounded-md" : "border-b border-white/10"}`}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} selected route legend`}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">Selected route</div>
          <div className="mt-0.5 whitespace-nowrap text-xs font-medium text-white">{routes.length} encounter{routes.length === 1 ? "" : "s"}</div>
        </div>
        {collapsed ? <ChevronDown className="size-3.5 text-white/55" /> : <ChevronUp className="size-3.5 text-white/55" />}
      </button>
      {!collapsed && <ol className="styled-scrollbar min-h-0 overflow-y-auto p-1.5">
        {routes.map((route, index) => {
          const status = ENCOUNTER_STATUS[route.encounter.kill_type];
          return (
            <li key={route.encounter.id} className={route.encounter.boss ? "py-0.5" : "opacity-50"}>
              <button
                type="button"
                onMouseEnter={() => onHoverEncounter(route.encounter.id)}
                onMouseLeave={() => onHoverEncounter(null)}
                onFocus={() => onHoverEncounter(route.encounter.id)}
                onBlur={() => onHoverEncounter(null)}
                onClick={() => onFocusEncounter(route)}
                className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-white/90 transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
              >
              <span
                className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full text-black ${route.encounter.boss ? "size-5 text-[9px] font-bold" : "size-4 text-[8px] font-medium"}`}
                style={{ backgroundColor: status.color }}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[10px] ${route.encounter.boss ? "font-semibold" : "font-normal italic"}`} title={route.encounter.name}>{route.encounter.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-white/50">
                  <span className="flex items-center gap-1" style={{ color: status.color }}>{status.icon}{status.label}</span>
                  <span>·</span>
                  <span>{route.encounter.boss ? "Boss" : "Trash"}</span>
                  <span>·</span>
                  <span className="font-mono">{formatDuration(route.encounter.start_time, route.encounter.end_time)}</span>
                </div>
              </div>
              </button>
            </li>
          );
        })}
      </ol>}
    </aside>
  );
}

/** `mini`: just the routes on the map, without the toolbar, zoom hints, route list or caption. */
export function MapOverview2D({ mini = false, ...props }: PanelRenderProps<MapResult> & { mini?: boolean }) {
  const iconBaseUrl = props.context.instance.iconBaseUrl;
  const manifestQuery = useMapManifest(iconBaseUrl);
  const mapShellRef = useRef<HTMLDivElement>(null);
  const mapFrameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [mapShellSize, setMapShellSize] = useState({ width: 0, height: 0 });
  // Null until the user pans or zooms: the camera is then the one framing the route.
  const [userCamera, setUserCamera] = useState<MapCamera | null>(null);
  const [hoveredEncounterId, setHoveredEncounterId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // The map covers the whole shell (no bars) and can be dragged partly off it.
  // The stable handlers below read the current layout from here.
  const layoutRef = useRef<{ rect: MapCanvasRect; minScale: number; home: MapCamera }>({
    rect: { left: 0, top: 0, width: 0, height: 0 },
    minScale: 1,
    home: { scale: 1, x: 0, y: 0 },
  });
  const setCamera = useCallback((update: (current: MapCamera) => MapCamera) => {
    setUserCamera((current) => update(current ?? layoutRef.current.home));
  }, []);

  // Ctrl (or Shift) + scroll zooms; a plain scroll still scrolls the page. Attached
  // natively below (React's wheel listener is passive, so it cannot stop Ctrl's page zoom).
  const handleWheel = useCallback((event: WheelEvent) => {
    if (!(event.ctrlKey || event.shiftKey) || event.target instanceof Element && event.target.closest("[data-map-controls]")) return;
    event.preventDefault();
    const frame = mapFrameRef.current;
    if (!frame) return;
    const bounds = frame.getBoundingClientRect();
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta === 0) return;
    const { rect, minScale } = layoutRef.current;
    setCamera((current) => zoomFreeMapCamera(
      current,
      current.scale * Math.exp(-delta * 0.0025),
      { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      rect,
      bounds,
      minScale,
    ));
  }, [setCamera]);

  const changeZoom = useCallback((multiplier: number) => {
    const frame = mapFrameRef.current;
    if (!frame) return;
    const bounds = frame.getBoundingClientRect();
    const { rect, minScale } = layoutRef.current;
    setCamera((current) => zoomFreeMapCamera(
      current,
      current.scale * multiplier,
      { x: bounds.width / 2, y: bounds.height / 2 },
      rect,
      bounds,
      minScale,
    ));
  }, [setCamera]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target instanceof Element && event.target.closest("[data-map-controls]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    const { rect, minScale } = layoutRef.current;
    setCamera((current) => clampFreeMapCamera({
      ...current,
      x: current.x + deltaX,
      y: current.y + deltaY,
    }, rect, bounds, minScale));
  }, [setCamera]);

  const stopDragging = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const selectedEncounters = useMemo(() => props.context.selectedEncounterIds
    .map((id) => {
      const encounter = props.context.instance.encounters.find((candidate) => candidate.id === id);
      const positions = props.result.encounters.get(id);
      return encounter && positions ? { encounter, positions } : null;
    })
    .filter((candidate): candidate is { encounter: Encounter; positions: MapEncounterPositions } => Boolean(candidate))
    .sort((left, right) => left.positions.startMs - right.positions.startMs), [
      props.context.instance.encounters,
      props.context.selectedEncounterIds,
      props.result.encounters,
    ]);
  const representativeSamples = useMemo(() => selectedEncounters.flatMap(({ positions }) =>
    Array.from(positions.positionsByUnit.values()).flatMap((samples) => samples.at(-1) ?? []),
  ), [selectedEncounters]);
  const mapId = dominantMapId(representativeSamples);
  const representativeSample = representativeSamples.find((sample) => sample.mapId === mapId);
  const encounterMapId = selectedEncounters.find(({ encounter }) => encounter.mapId !== 0)?.encounter.mapId ?? 0;
  const artworkMapId = encounterMapId || mapId;
  const normalizedUIMap = props.context.instance.positionCoordinateSpace === "ui-map-normalized";
  const artwork = manifestQuery.data && artworkMapId !== null
    ? resolveMapArtwork(
      manifestQuery.data,
      artworkMapId,
      normalizedUIMap ? undefined : representativeSample,
      props.context.instance.name,
    )
    : null;
  const [floorNumber, setFloorNumber] = useState<number | null>(null);
  const [mapSource, setMapSource] = useState<"styled" | "renders" | "art">("renders");

  const zoneSelection = artwork?.kind === "zone"
    ? artwork.map.art?.flatMap((art) => art.layers.map((layer) => ({ art, layer })))
      .find(({ layer }) => layer.width > 0 && layer.height > 0 && layer.tiles.length > 0)
    : undefined;
  const selectedFloorNumber = artwork?.kind === "instance"
    && artwork.instance.floors.some((floor) => floor.floor === floorNumber)
    ? floorNumber
    : artwork?.kind === "instance" ? artwork.instance.floors[0]?.floor ?? null : null;
  const selectedFloor = artwork?.kind === "instance"
    ? artwork.instance.floors.find((floor) => floor.floor === selectedFloorNumber) ?? artwork.instance.floors[0]
    : undefined;
  const instanceCanvas = artwork?.kind === "instance"
    ? overviewDungeonCanvas(artwork.instance, selectedFloor, normalizedUIMap ? "art" : mapSource)
    : null;
  const canvas = artwork?.kind === "zone" ? zoneSelection?.layer : instanceCanvas?.canvas;
  // Image bounds belong to that image alone; never substitute floor or mesh bounds.
  const dungeonBounds = artwork?.kind === "instance" ? instanceCanvas?.canvas?.bounds ?? null : null;
  const imageProjection = instanceCanvas?.source !== "art";

  const mapCanvasRect = useMemo(() => coverMapCanvasRect(
    mapShellSize,
    canvas ? { width: canvas.width, height: canvas.height } : { width: 0, height: 0 },
  ), [canvas, mapShellSize]);
  // Zooming out as far as the whole map fitting the shell.
  const minScale = canvas ? containScaleForCover(mapShellSize, canvas) : 1;

  const projectSample = useCallback((sample: MapPositionSample, calibration: ReturnType<typeof resolveDungeonMapCalibration>): MapPoint | null => {
    if (!artwork || sample.mapId !== mapId) return null;
    if (normalizedUIMap) return uiMapPoint(sample);
    if (artwork.kind === "zone") return zoneMapPoint(sample, artwork.assignment);
    if (!dungeonBounds) return null;
    return projectDungeonMapPoint(sample, dungeonBounds, artwork.instance.mapID, calibration, imageProjection);
  }, [artwork, dungeonBounds, imageProjection, mapId, normalizedUIMap]);

  const journeyRoutes = useMemo<EncounterRoute[]>(() => {
    if (!artwork || selectedEncounters.length === 0) return [];
    const selectedIds = new Set(props.context.selectedEncounterIds);
    return selectMapJourneyEncounters(props.result.encounters, props.context.selectedEncounterIds).flatMap((positions) => {
      const encounter = props.context.instance.encounters.find((candidate) => candidate.id === positions.encounterId);
      if (!encounter) return [];
      const calibration = artwork.kind === "instance" && !imageProjection
        ? resolveDungeonMapCalibration(
          artwork.instance.mapID,
          positions,
          (guid) => props.context.instance.units?.[guid]?.entry,
        )
        : null;
      const samples = encounterRouteSamples(
        positions,
        (guid) => Boolean(props.context.instance.players?.[guid]),
      );
      const points = samples.flatMap((sample) => {
        const point = projectSample(sample, calibration);
        return point ? [point] : [];
      });
      return points.length > 0 ? [{ encounter, points, selected: selectedIds.has(encounter.id) }] : [];
    });
  }, [
    artwork,
    projectSample,
    props.context.instance.encounters,
    props.context.instance.players,
    props.context.instance.units,
    props.context.selectedEncounterIds,
    props.result.encounters,
    imageProjection,
    selectedEncounters,
  ]);
  const routes = journeyRoutes.filter((route) => route.selected);
  // The shell is conditionally mounted below. A cached manifest can resolve the canvas
  // while telemetry is still loading, so observe only once the shell actually exists.
  const showMap = Boolean(iconBaseUrl && !manifestQuery.isLoading && !props.loading
    && !manifestQuery.error && selectedEncounters.length > 0 && representativeSamples.length > 0
    && mapId !== null && artwork && canvas);
  useLayoutEffect(() => {
    const shell = mapShellRef.current;
    if (!shell || !canvas || !showMap) return;
    const updateSize = () => {
      const bounds = shell.getBoundingClientRect();
      const size = { width: bounds.width, height: bounds.height };
      const canvasSize = { width: canvas.width, height: canvas.height };
      const nextCanvasRect = coverMapCanvasRect(size, canvasSize);
      setMapShellSize(size);
      // The route-framing camera follows the size on its own; a user's one is kept in bounds.
      setUserCamera((current) => current && clampFreeMapCamera(current, nextCanvasRect, size, containScaleForCover(size, canvasSize)));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [canvas, showMap]);
  useEffect(() => {
    const frame = mapFrameRef.current;
    if (!frame || !showMap) return;
    frame.addEventListener("wheel", handleWheel, { passive: false });
    return () => frame.removeEventListener("wheel", handleWheel);
  }, [handleWheel, showMap]);

  const transitRoutes = journeyRoutes.filter((route) => !route.selected);
  const allPoints = journeyRoutes.flatMap((route) => route.points);
  const viewport = fitMapViewport(allPoints, 6, 32);
  const mapScale = 100 / viewport.spanPercent;
  // Until the user moves it, the camera frames the whole route (the covering
  // rect alone crops it); artwork beyond the route fills the rest of the shell.
  const homeCamera = fitFreeMapCameraToPoints(
    allPoints.map((point) => pointInMapViewport(point, viewport)),
    mapCanvasRect,
    mapShellSize,
    minScale,
  );
  const camera = userCamera ?? homeCamera;
  // Markers say how far into the instance each fight started.
  const instanceStartMs = Math.min(...props.context.instance.encounters.map((encounter) => new Date(encounter.start_time).getTime()));
  useLayoutEffect(() => {
    layoutRef.current = { rect: mapCanvasRect, minScale, home: homeCamera };
  });
  const focusEncounter = (route: EncounterRoute) => {
    setUserCamera(fitFreeMapCameraToPoints(
      route.points.map((point) => pointInMapViewport(point, viewport)),
      mapCanvasRect,
      mapShellSize,
      minScale,
      18,
    ));
  };
  const routeConnectors = journeyRoutes.slice(1).flatMap((route, index) => {
    const previous = journeyRoutes[index];
    const from = previous.points.at(-1);
    const to = route.points[0];
    return from && to ? [{ key: `${previous.encounter.id}-${route.encounter.id}`, points: [from, to] }] : [];
  });

  const journeyStartPoint = journeyRoutes[0]?.points[0];
  const journeyEndPoint = journeyRoutes.at(-1)?.points.at(-1);

  if (!iconBaseUrl) return <MapMessage title="Map assets unavailable" detail="This instance's dataset has no icon base URL." />;
  if (manifestQuery.isLoading || props.loading) return <MapMessage title="Loading map" detail="Fetching map assets and position telemetry…" />;
  if (manifestQuery.error) return <MapMessage title="Map assets unavailable" detail={manifestQuery.error.message} />;
  if (selectedEncounters.length === 0 || representativeSamples.length === 0 || mapId === null) {
    return <MapMessage title="No position telemetry" detail="The selected encounters do not contain unit-position data." />;
  }
  if (!artwork) return <MapMessage title={`Map ${artworkMapId} is unavailable`} detail="The active dataset does not publish artwork or rendered geometry for this world map." />;
  if (artwork.kind === "instance" && isMeshOnlyInstance(artwork.instance)) {
    return <MapMessage title="No map artwork for this instance" detail={`${artwork.instance.name} has no 2D map; it is 3D only. Select a single encounter to open its 3D Replay Map.`} />;
  }
  if (!canvas) return <MapMessage title="Map assets unavailable" detail="No renderable map layer was published." />;

  const mapName = artwork.kind === "zone" ? artwork.map.name : artwork.instance.name;
  const displayedMapId = artwork.kind === "instance" ? artwork.instance.mapID : mapId;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!mini && <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] text-muted-foreground">
        <div className="min-w-0 truncate">
          <span className="font-semibold text-foreground">{mapName}</span>
          <span className="ml-1.5 font-mono">world {displayedMapId}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!normalizedUIMap && artwork.kind === "instance" && [artwork.instance.renders, artwork.instance.styled, selectedFloor].filter(Boolean).length > 1 && (
            <select
              aria-label="Map source"
              value={instanceCanvas?.source}
              onChange={(event) => setMapSource(event.target.value as "styled" | "renders" | "art")}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground [color-scheme:dark]"
            >
              {artwork.instance.renders && <option value="renders">Raw render</option>}
              {artwork.instance.styled && <option value="styled">Stylized</option>}
              {selectedFloor && <option value="art">Original artwork</option>}
            </select>
          )}
          <span>{Math.round(mapScale * camera.scale * 100)}%</span>
          <span>{routes.length} encounters</span>
          {artwork.kind === "instance" && !imageProjection && artwork.instance.floors.length > 1 && (
            <select
              aria-label="Map floor"
              value={selectedFloorNumber ?? ""}
              onChange={(event) => setFloorNumber(Number(event.target.value))}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground [color-scheme:dark]"
            >
              {artwork.instance.floors.map((floor) => <option key={floor.floor} value={floor.floor}>Floor {floor.floor}</option>)}
            </select>
          )}
        </div>
      </div>}
      <div ref={mapShellRef} className={`relative min-h-0 flex-1 overflow-hidden bg-[#11100d] ${mini ? "" : "mx-1 rounded-sm border border-white/15"}`}>
        <div
          ref={mapFrameRef}
          className={`absolute inset-0 touch-none overflow-hidden bg-[#11100d] select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onLostPointerCapture={stopDragging}
          onDoubleClick={() => setUserCamera(null)}
        >
          {/* The whole shell drags; the map's covering rect sits inside it and clips at the shell. */}
          <div className="absolute" style={mapCanvasRect}>
          <div
            className="absolute inset-0 origin-top-left"
            style={{ transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})` }}
          >
          <div
            className="absolute overflow-hidden"
            style={{
              left: `${-viewport.leftPercent * mapScale}%`,
              top: `${-viewport.topPercent * mapScale}%`,
              width: `${mapScale * 100}%`,
              height: `${mapScale * 100}%`,
            }}
          >
            <MapBackground canvas={canvas} iconBaseUrl={iconBaseUrl} overlays={artwork.kind === "zone" ? zoneSelection?.art.overlays : undefined} />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,.35))]" />
          </div>
          <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {routeConnectors.map((connector) => {
              const points = connector.points.map((point) => pointInMapViewport(point, viewport));
              return (
                <polyline
                  key={connector.key}
                  points={points.map((point) => `${point.leftPercent},${point.topPercent}`).join(" ")}
                  fill="none"
                  stroke="rgba(255,255,255,.45)"
                  strokeWidth="1.1"
                  strokeDasharray="2 2.5"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {transitRoutes.map((route) => {
              const points = route.points.map((point) => pointInMapViewport(point, viewport));
              const path = points.map((point) => `${point.leftPercent},${point.topPercent}`).join(" ");
              return (
                <g key={`transit-${route.encounter.id}`} opacity="0.48">
                  <polyline points={path} fill="none" stroke="rgba(0,0,0,.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <polyline points={path} fill="none" stroke="rgb(148 163 184)" strokeWidth="0.85" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
            {routes.map((route) => {
              const status = ENCOUNTER_STATUS[route.encounter.kill_type];
              const points = route.points.map((point) => pointInMapViewport(point, viewport));
              const path = points.map((point) => `${point.leftPercent},${point.topPercent}`).join(" ");
              const boss = route.encounter.boss;
              const highlighted = hoveredEncounterId === route.encounter.id;
              return (
                <g key={route.encounter.id} opacity={highlighted || boss ? 1 : 0.42}>
                  <polyline points={path} fill="none" stroke="rgba(0,0,0,.85)" strokeWidth={boss ? 3.5 : 1.7} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <polyline points={path} fill="none" stroke={status.color} strokeWidth={boss ? 1.8 : 0.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  {highlighted && (
                    <polyline className="animate-pulse" points={path} fill="none" stroke="white" strokeWidth={boss ? 4.5 : 3} strokeOpacity="0.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  )}
                </g>
              );
            })}
          </svg>
          </div>
          {journeyStartPoint && (
            <JourneyEndpoint point={pointInMapViewport(journeyStartPoint, viewport)} camera={camera} kind="start" />
          )}
          {journeyEndPoint && (
            <JourneyEndpoint point={pointInMapViewport(journeyEndPoint, viewport)} camera={camera} kind="end" />
          )}
          {transitRoutes.map((route) => (
            <TransitMarker key={`transit-marker-${route.encounter.id}`} route={route} viewport={viewport} camera={camera} instanceStartMs={instanceStartMs} />
          ))}
          {routes.slice(0, -1).map((route, index) => (
            <RouteMarker
              key={route.encounter.id}
              route={route}
              index={index}
              viewport={viewport}
              camera={camera}
              highlighted={hoveredEncounterId === route.encounter.id}
              instanceStartMs={instanceStartMs}
            />
          ))}
          </div>
        </div>
        {mini && (
          <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-30 rounded-sm bg-black/70 px-1.5 py-0.5 text-[9px] text-white/65">
            Ctrl+scroll to zoom, click and drag to pan
          </div>
        )}
        {!mini && <div data-map-controls className="absolute bottom-2 left-2 z-30 flex items-center gap-1.5 rounded-md border border-white/10 bg-black/80 px-2 py-1 text-[9px] text-white/65 shadow-lg backdrop-blur-sm">
          <span>Ctrl + scroll to zoom</span>
          <span className="text-white/25">·</span>
          <span>drag to pan</span>
          <div className="ml-1 flex overflow-hidden rounded border border-white/15 text-white/85">
            <button type="button" aria-label="Zoom out" onClick={() => changeZoom(0.8)} className="px-2 py-0.5 hover:bg-white/10">−</button>
            <button type="button" aria-label="Zoom in" onClick={() => changeZoom(1.25)} className="border-l border-white/15 px-2 py-0.5 hover:bg-white/10">+</button>
          </div>
          {userCamera !== null && (
            <button
              type="button"
              onClick={() => setUserCamera(null)}
              className="rounded border border-white/15 px-1.5 py-0.5 font-medium text-white/85 hover:bg-white/10"
            >
              Reset
            </button>
          )}
        </div>}
        {!mini && routes.length > 0 && <RouteLegend
          routes={routes}
          onHoverEncounter={setHoveredEncounterId}
          onFocusEncounter={focusEncounter}
        />}
      </div>
      {!mini && <p className="px-3 py-1.5 text-[9px] text-muted-foreground">
        {routes.length > 0
          ? "Colored lines show selected encounters. Muted gray lines and small dots retain unselected fights. Dashed lines mark remaining telemetry gaps."
          : !dungeonBounds && imageProjection
            ? "This render has no calibrated bounds; routes and positions cannot be placed on it. Choose another map source to view them."
            : "The selected encounters have no positions that can be projected onto this map."}
      </p>}
    </div>
  );
}

function MapMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
      <MapIcon className="h-8 w-8 text-muted-foreground/50" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
