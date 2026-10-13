import { useEffect, useRef, useState } from "react";
import { Scan } from "lucide-react";
import { useSmoothReplayTime } from "../RotationTimeline/useSmoothReplayTime";
import type { MapPositionSample } from "./map.processor";
import { interpolatedPositionAt, type MapPoint } from "./mapModel";
import { MapScene3D, type MapScene3DUnit } from "./MapScene3D";
import type { MapSceneGround, MapSceneMarker } from "./useMapScene";

export interface MapView3DProps {
  ground: MapSceneGround;
  markers: MapSceneMarker[];
  projectSample: (sample: MapPositionSample) => MapPoint | null;
  cursorMs: number;
  playing: boolean;
  playbackSpeed: number;
  /** Called when WebGL cannot be created or the context is lost. */
  onUnavailable: () => void;
}

const SMOOTH_STORAGE_KEY = "chronicle.map.smooth3d";

function readStoredSmooth(): boolean {
  try {
    return localStorage.getItem(SMOOTH_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

// three.js needs concrete colors; class colors are CSS custom properties.
function resolveCssColor(color: string, element: Element, cache: Map<string, string>): string {
  const variable = /^var\((--[^)]+)\)$/.exec(color)?.[1];
  if (!variable) return color;
  let resolved = cache.get(variable);
  if (resolved === undefined) {
    resolved = getComputedStyle(element).getPropertyValue(variable).trim() || "#ffffff";
    cache.set(variable, resolved);
  }
  return resolved;
}

export default function MapView3D({
  ground,
  markers,
  projectSample,
  cursorMs,
  playing,
  playbackSpeed,
  onUnavailable,
}: MapView3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MapScene3D | null>(null);
  const onUnavailableRef = useRef(onUnavailable);
  const colorCacheRef = useRef(new Map<string, string>());
  const [smooth, setSmooth] = useState(readStoredSmooth);
  const smoothMs = useSmoothReplayTime(cursorMs, playing && smooth, playbackSpeed);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let scene: MapScene3D;
    try {
      scene = new MapScene3D(container, () => onUnavailableRef.current());
    } catch {
      onUnavailableRef.current();
      return;
    }
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setGround(ground);
  }, [ground]);

  useEffect(() => {
    const container = containerRef.current;
    const scene = sceneRef.current;
    if (!container || !scene) return;
    const units = markers.flatMap((marker): MapScene3DUnit[] => {
      const sample = smooth && smoothMs !== null
        ? interpolatedPositionAt(marker.positions, smoothMs) ?? marker.sample
        : marker.sample;
      const point = sample === marker.sample ? marker.point : projectSample(sample) ?? marker.point;
      return [{
        guid: marker.guid,
        point,
        facing: sample.facing,
        color: resolveCssColor(marker.color, container, colorCacheRef.current),
        kind: marker.kind,
        muted: marker.muted,
        name: marker.name,
      }];
    });
    scene.setUnits(units);
  }, [markers, projectSample, smooth, smoothMs]);

  const toggleSmooth = () => {
    const next = !smooth;
    setSmooth(next);
    try {
      localStorage.setItem(SMOOTH_STORAGE_KEY, String(next));
    } catch {
      // Storage may be unavailable; the toggle still applies for this session.
    }
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute right-2 top-2 flex gap-1 text-[10px]">
        <button
          type="button"
          aria-pressed={smooth}
          onClick={toggleSmooth}
          title="Interpolate positions between samples during playback"
          className={`rounded border border-white/15 px-1.5 py-0.5 font-medium ${smooth ? "bg-primary/30 text-foreground" : "bg-black/70 text-muted-foreground hover:text-foreground"}`}
        >
          Smooth
        </button>
        <button
          type="button"
          onClick={() => sceneRef.current?.resetCamera(true)}
          title="Top-down view"
          className="flex items-center gap-1 rounded border border-white/15 bg-black/70 px-1.5 py-0.5 font-medium text-muted-foreground hover:text-foreground"
        >
          <Scan className="h-3 w-3" />
          Top-down
        </button>
      </div>
    </div>
  );
}
