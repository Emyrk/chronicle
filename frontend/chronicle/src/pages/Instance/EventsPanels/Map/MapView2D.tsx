import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Navigation, PawPrint, Skull } from "lucide-react";
import {
  mapAssetUrl,
  overlayTilePlacement,
  tilePlacement,
  type WowMapLayer,
} from "@/pages/Technical/mapGallery";
import {
  clampViewport,
  healthBarColor,
  interpolateViewport,
  movementTrailPoints,
  prefersReducedMotion,
  VIEW_TRANSITION_MS,
  viewportPoint,
  zoomViewportAt,
  type MapPoint,
  type MapViewport,
} from "./mapModel";
import type { MapPositionSample } from "./map.processor";
import type { MapSceneGround, MapSceneMarker, MapUnitHealth } from "./useMapScene";
import { MapCompass } from "./MapCompass";

/**
 * A framing for the views to apply. A view applies `viewport` when it mounts
 * and again whenever `key` changes (Fit / Reset / a new encounter); otherwise
 * it keeps the user's own zoom and pan.
 */
export interface MapViewRequest {
  viewport: MapViewport;
  key: string;
}

const WHEEL_ZOOM_SPEED = 0.0015;
// A wheel gesture is many events; report the viewport once it settles.
const WHEEL_REPORT_DELAY_MS = 150;

function MapTiles({ ground: { canvas, iconBaseUrl, overlays } }: { ground: MapSceneGround }) {
  if ("source" in canvas) {
    // A rendered instance map is one image covering the whole canvas.
    return (
      <img
        src={mapAssetUrl(iconBaseUrl, canvas.path)}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 size-full select-none object-fill"
      />
    );
  }
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

export function MapArtworkLayer({ ground, viewport }: { ground: MapSceneGround; viewport: MapViewport }) {
  return (
    <div
      className="absolute inset-0 origin-top-left"
      style={{
        transform: `translate(${(0.5 - viewport.centerX * viewport.zoom) * 100}%, ${(0.5 - viewport.centerY * viewport.zoom) * 100}%) scale(${viewport.zoom})`,
      }}
    >
      <MapTiles ground={ground} />
    </div>
  );
}

// Same colour rule as the 3D bars: fill by percentage, a pale green chunk
// for recent healing at its end, a pale absorb segment past current health,
// grey when dead.
function HealthBar({ health }: { health: MapUnitHealth }) {
  const fraction = health.max > 0 ? Math.min(1, Math.max(0, health.current / health.max)) : 0;
  const absorb = health.max > 0 ? Math.min(1 - fraction, Math.max(0, health.absorb / health.max)) : 0;
  const healed = health.max > 0 ? Math.min(fraction, Math.max(0, (health.healGain ?? 0) / health.max)) : 0;
  return (
    <div className={`pointer-events-none absolute left-1/2 top-full flex h-1 w-6 -translate-x-1/2 overflow-hidden rounded-sm border border-black/80 ${health.dead ? "bg-stone-600" : "bg-black/80"}`}>
      {!health.dead && (
        <>
          <div style={{ width: `${(fraction - healed) * 100}%`, backgroundColor: healthBarColor(fraction) }} />
          <div className="bg-green-200" style={{ width: `${healed * 100}%` }} />
          <div className="bg-stone-200" style={{ width: `${absorb * 100}%` }} />
        </>
      )}
    </div>
  );
}

function EncounterRoute({ points, viewport }: { points: MapPoint[]; viewport: MapViewport }) {
  if (points.length < 2) return null;
  const path = points
    .map((point) => viewportPoint(point, viewport))
    .map((point) => `${point.leftPercent},${point.topPercent}`)
    .join(" ");
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={path} fill="none" stroke="rgba(0,0,0,.88)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <polyline points={path} fill="none" stroke="rgba(251,191,36,.92)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MovementTrails({
  markers,
  viewport,
  trailSeconds,
  projectSample,
}: {
  markers: MapSceneMarker[];
  viewport: MapViewport;
  trailSeconds: number;
  projectSample: (sample: MapPositionSample) => MapPoint | null;
}) {
  if (trailSeconds <= 0) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {markers.flatMap((marker) => {
        const trail = movementTrailPoints(
          marker.positions,
          marker.sample,
          trailSeconds * 1000,
          marker.kind === "player",
          projectSample,
        ).map(({ point }) => viewportPoint(point, viewport));
        return trail.slice(0, -1).map((from, index) => {
          const to = trail[index + 1];
          const fade = 1 - index / Math.max(1, trail.length - 1);
          return (
            <line
              key={`${marker.guid}-${index}`}
              x1={from.leftPercent}
              y1={from.topPercent}
              x2={to.leftPercent}
              y2={to.topPercent}
              stroke={marker.color}
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={(marker.muted ? 0.2 : 0.75) * fade}
            />
          );
        });
      })}
    </svg>
  );
}

// Markers live in an un-scaled overlay positioned from the zoomed
// coordinates, so they keep their pixel size and spread apart as the
// artwork zooms in.
function MapMarker({ marker, viewport }: { marker: MapSceneMarker; viewport: MapViewport }) {
  const { sample } = marker;
  const point = viewportPoint(marker.point, viewport);
  return (
    <div
      className="group absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${point.leftPercent}%`, top: `${point.topPercent}%`, opacity: marker.muted ? 0.28 : 1 }}
      title={`${marker.name} · ${sample.x.toFixed(1)}, ${sample.y.toFixed(1)}`}
    >
      <div className="relative flex h-5 w-5 items-center justify-center">
        <span
          className="absolute h-3.5 w-3.5 rounded-full border-2 border-black/80 shadow-[0_0_8px_rgba(0,0,0,.9)]"
          style={{ backgroundColor: marker.color }}
        />
        {sample.facing !== undefined && (
          <Navigation
            className="absolute h-3 w-3 fill-black/65 text-black/80"
            style={{ transform: `rotate(${sample.facing}rad)` }}
          />
        )}
        {marker.kind === "pet" && <PawPrint className="absolute -bottom-1.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-black/80 p-0.5 text-cyan-200" />}
        {marker.kind === "hostile" && <Skull className="absolute -bottom-1.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-black/80 p-0.5 text-rose-200" />}
      </div>
      {marker.health && <HealthBar health={marker.health} />}
      <span className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 text-[9px] font-medium text-white shadow-lg group-hover:block">
        {marker.name}
      </span>
    </div>
  );
}

export function MapView2D({ ground, markers, routePoints, projectSample, trailSeconds, view, onUserViewport }: {
  ground: MapSceneGround;
  markers: MapSceneMarker[];
  routePoints: MapPoint[];
  projectSample: (sample: MapPositionSample) => MapPoint | null;
  trailSeconds: number;
  view: MapViewRequest;
  /** Called with the viewport after the user zooms or pans. */
  onUserViewport?: (viewport: MapViewport) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  // The 3D view can zoom past MAX_MAP_ZOOM and pan off the artwork; 2D keeps to them.
  const [viewport, setViewport] = useState(() => clampViewport(view.viewport));
  // The source of truth for handlers and the animation; `viewport` mirrors it for rendering.
  const viewportRef = useRef(viewport);
  const appliedKeyRef = useRef(view.key);
  const animationRef = useRef(0);
  const wheelReportRef = useRef(0);
  const onUserViewportRef = useRef(onUserViewport);

  useEffect(() => {
    onUserViewportRef.current = onUserViewport;
  }, [onUserViewport]);

  const userMoved = (next: MapViewport) => {
    cancelAnimationFrame(animationRef.current);
    viewportRef.current = next;
    setViewport(next);
  };

  // A new request eases from the current view to its viewport.
  useEffect(() => {
    if (appliedKeyRef.current === view.key) return;
    appliedKeyRef.current = view.key;
    cancelAnimationFrame(animationRef.current);
    // A wheel report still pending would mark this new framing as manual.
    clearTimeout(wheelReportRef.current);
    const from = viewportRef.current;
    const to = clampViewport(view.viewport);
    const duration = prefersReducedMotion() ? 0 : VIEW_TRANSITION_MS;
    const start = performance.now();
    const step = (now: number) => {
      const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
      viewportRef.current = interpolateViewport(from, to, 1 - (1 - t) ** 3);
      setViewport(viewportRef.current);
      if (t < 1) animationRef.current = requestAnimationFrame(step);
    };
    animationRef.current = requestAnimationFrame(step);
  }, [view]);

  useEffect(() => () => {
    cancelAnimationFrame(animationRef.current);
    clearTimeout(wheelReportRef.current);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // React's onWheel is passive, so it cannot stop the page from scrolling.
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);
      const viewX = (event.clientX - rect.left) / rect.width;
      const viewY = (event.clientY - rect.top) / rect.height;
      cancelAnimationFrame(animationRef.current);
      viewportRef.current = zoomViewportAt(viewportRef.current, factor, viewX, viewY);
      setViewport(viewportRef.current);
      clearTimeout(wheelReportRef.current);
      wheelReportRef.current = window.setTimeout(() => onUserViewportRef.current?.(viewportRef.current), WHEEL_REPORT_DELAY_MS);
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - drag.x) / rect.width;
    const dy = (event.clientY - drag.y) / rect.height;
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY, moved: drag.moved || dx !== 0 || dy !== 0 };
    const current = viewportRef.current;
    userMoved(clampViewport({
      ...current,
      centerX: current.centerX - dx / current.zoom,
      centerY: current.centerY - dy / current.zoom,
    }));
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (dragRef.current.moved) onUserViewport?.(viewportRef.current);
    dragRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative mx-auto h-full max-w-full touch-none overflow-hidden bg-[#11100d] ${viewport.zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ aspectRatio: `${ground.canvas.width} / ${ground.canvas.height}` }}
    >
      <MapArtworkLayer ground={ground} viewport={viewport} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,.28))]" />
      <EncounterRoute points={routePoints} viewport={viewport} />
      <MovementTrails markers={markers} viewport={viewport} trailSeconds={trailSeconds} projectSample={projectSample} />
      {markers.map((marker) => <MapMarker key={marker.guid} marker={marker} viewport={viewport} />)}
      <MapCompass />
    </div>
  );
}
