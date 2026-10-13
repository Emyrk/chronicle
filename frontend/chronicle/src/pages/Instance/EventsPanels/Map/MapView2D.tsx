import { Navigation, PawPrint, Skull } from "lucide-react";
import {
  mapAssetUrl,
  overlayTilePlacement,
  tilePlacement,
  type WowMapLayer,
} from "@/pages/Technical/mapGallery";
import type { MapSceneGround, MapSceneMarker } from "./useMapScene";

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

function MapMarker({ marker }: { marker: MapSceneMarker }) {
  const { point, sample } = marker;
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

export function MapView2D({ ground, markers }: { ground: MapSceneGround; markers: MapSceneMarker[] }) {
  return (
    <div className="relative mx-auto h-full max-w-full overflow-hidden bg-[#11100d]" style={{ aspectRatio: `${ground.canvas.width} / ${ground.canvas.height}` }}>
      <MapTiles ground={ground} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,.28))]" />
      {markers.map((marker) => <MapMarker key={marker.guid} marker={marker} />)}
    </div>
  );
}
