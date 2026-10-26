import { useEffect, useMemo, useRef, useState } from "react";
import {
  dungeonMeshLiquid,
  dungeonMeshUrl,
  placeableDungeonMesh,
} from "@/pages/Instance/EventsPanels/Map/dungeonMeshes";
import { MapScene3D } from "@/pages/Instance/EventsPanels/Map/MapScene3D";
import type { MapDebugOverlay } from "@/pages/Instance/EventsPanels/Map/mapDebugOverlays";
import type { MapSceneGround } from "@/pages/Instance/EventsPanels/Map/useMapScene";
import type { WowMapMeshInstance } from "./mapGallery";

interface MapGallery3DProps {
  mesh: WowMapMeshInstance;
  iconBaseUrl: string;
  overlays: readonly MapDebugOverlay[];
}

function meshGround(meshEntry: WowMapMeshInstance, iconBaseUrl: string): MapSceneGround | null {
  const mesh = placeableDungeonMesh(meshEntry);
  if (!mesh) return null;
  return {
    iconBaseUrl,
    canvas: {
      floor: 0,
      width: mesh.bounds.maxY - mesh.bounds.minY,
      height: mesh.bounds.maxX - mesh.bounds.minX,
      tileWidth: 0,
      tileHeight: 0,
      bounds: mesh.bounds,
      tiles: [],
    },
  };
}

export default function MapGallery3D({ mesh: meshEntry, iconBaseUrl, overlays }: MapGallery3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mesh = useMemo(() => placeableDungeonMesh(meshEntry), [meshEntry]);
  const ground = useMemo(() => meshGround(meshEntry, iconBaseUrl), [iconBaseUrl, meshEntry]);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mesh || !ground) return;

    let scene: MapScene3D | null = null;
    try {
      scene = new MapScene3D(
        container,
        () => setStatus("failed"),
        () => {},
        () => {},
        (state) => {
          setStatus(state);
          if (state === "ready") scene?.resetCamera(false);
        },
      );
    } catch {
      queueMicrotask(() => setStatus("failed"));
      return;
    }
    const activeScene = scene;
    activeScene.setGround(ground);
    activeScene.setDebugOverlays(overlays);
    activeScene.setDungeonMesh({
      url: dungeonMeshUrl(mesh, iconBaseUrl),
      bounds: mesh.bounds,
      liquid: dungeonMeshLiquid(mesh),
    });

    return () => activeScene.dispose();
  }, [ground, iconBaseUrl, mesh, overlays]);

  const displayStatus = mesh && ground ? status : "failed";

  return (
    <div className="relative h-[min(72vh,900px)] min-h-[420px] w-full overflow-hidden rounded-md bg-[#11100d]">
      <div ref={containerRef} className="absolute inset-0" />
      {displayStatus !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
          <div className="rounded border border-amber-200/15 bg-black/70 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-100/70">
            {displayStatus === "failed" ? "3D mesh unavailable" : "Loading dungeon mesh…"}
          </div>
        </div>
      )}
      {overlays.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-amber-100/15 bg-black/70 p-2 backdrop-blur-sm">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-amber-100/50">Debug overlays</div>
          <div className="space-y-1">
            {overlays.map((overlay) => (
              <div key={overlay.id} className="flex items-center gap-2 text-[11px] text-amber-50/80">
                <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: overlay.color }} />
                <span>{overlay.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
