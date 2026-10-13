import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Navigation, PawPrint, Skull } from "lucide-react";
import {
  mapAssetUrl,
  overlayTilePlacement,
  tilePlacement,
  type WowMapLayer,
} from "@/pages/Technical/mapGallery";
import { clampViewport, viewportPoint, zoomViewportAt, type MapViewport } from "./mapModel";
import type { MapSceneGround, MapSceneMarker } from "./useMapScene";

/** A framing for the views to apply; a new object re-applies it (Fit / Reset). */
export interface MapViewRequest {
  viewport: MapViewport;
  key: string;
}

const WHEEL_ZOOM_SPEED = 0.0015;

function MapTiles({ ground: { canvas, iconBaseUrl, overlays } }: { ground: MapSceneGround }) {
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
        <Navigation
          className="absolute h-3 w-3 fill-black/65 text-black/80"
          style={{ transform: `rotate(${sample.facing}rad)` }}
        />
        {marker.kind === "pet" && <PawPrint className="absolute -bottom-1.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-black/80 p-0.5 text-cyan-200" />}
        {marker.kind === "hostile" && <Skull className="absolute -bottom-1.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-black/80 p-0.5 text-rose-200" />}
      </div>
      <span className="pointer-events-none absolute left-1/2 top-full mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 text-[9px] font-medium text-white shadow-lg group-hover:block">
        {marker.name}
      </span>
    </div>
  );
}

export function MapView2D({ ground, markers, view }: { ground: MapSceneGround; markers: MapSceneMarker[]; view: MapViewRequest }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [state, setState] = useState({ view, viewport: view.viewport });
  let viewport = state.viewport;
  if (state.view !== view) {
    setState({ view, viewport: view.viewport });
    viewport = view.viewport;
  }

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
      setState((current) => ({ ...current, viewport: zoomViewportAt(current.viewport, factor, viewX, viewY) }));
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - drag.x) / rect.width;
    const dy = (event.clientY - drag.y) / rect.height;
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
    setState((current) => ({
      ...current,
      viewport: clampViewport({
        ...current.viewport,
        centerX: current.viewport.centerX - dx / current.viewport.zoom,
        centerY: current.viewport.centerY - dy / current.viewport.zoom,
      }),
    }));
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
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
      <div
        className="absolute inset-0 origin-top-left"
        style={{
          transform: `translate(${(0.5 - viewport.centerX * viewport.zoom) * 100}%, ${(0.5 - viewport.centerY * viewport.zoom) * 100}%) scale(${viewport.zoom})`,
        }}
      >
        <MapTiles ground={ground} />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,.28))]" />
      {markers.map((marker) => <MapMarker key={marker.guid} marker={marker} viewport={viewport} />)}
    </div>
  );
}
