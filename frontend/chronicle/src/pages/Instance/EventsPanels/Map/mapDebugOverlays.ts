import type { WowMapFloorBounds } from "@/pages/Technical/mapGallery";
import { extendedDeepBreathLane, ONYXIA_DEEP_BREATH_LANES } from "./deepBreathLanes";
import { mapPointToScene, renderedDungeonMapPoint } from "./mapModel";

export interface MapDebugWorldPoint {
  x: number;
  y: number;
}

/** Data-only overlay rendered by map diagnostics, independent of React/Three.js. */
export interface MapDebugPathOverlay {
  kind: "path";
  id: string;
  mapId: number;
  label: string;
  points: readonly MapDebugWorldPoint[];
  widthYards: number;
  color: string;
  opacity: number;
}

export type MapDebugOverlay = MapDebugPathOverlay;

export interface ProjectedMapDebugPath {
  from: { x: number; z: number };
  to: { x: number; z: number };
  centre: { x: number; z: number };
  direction: { x: number; z: number };
  length: number;
}

/** Projects a two-point world path with the same transform as the dungeon mesh. */
export function projectMapDebugPath(
  overlay: MapDebugPathOverlay,
  bounds: WowMapFloorBounds,
  aspect: number,
  sceneWidth: number,
): ProjectedMapDebugPath | null {
  if (overlay.points.length < 2) return null;
  const project = (point: MapDebugWorldPoint) => {
    const mapped = renderedDungeonMapPoint({ timestampMs: 0, x: point.x, y: point.y, mapId: overlay.mapId }, bounds);
    return mapped ? mapPointToScene(mapped, aspect, sceneWidth) : null;
  };
  const from = project(overlay.points[0]);
  const to = project(overlay.points[overlay.points.length - 1]);
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-4) return null;
  return {
    from,
    to,
    centre: { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 },
    direction: { x: dx / length, z: dz / length },
    length,
  };
}

const ONYXIA_LANE_COLORS = ["#ffb347", "#ff6b35", "#ff3158"] as const;

const OVERLAYS_BY_MAP = new Map<number, readonly MapDebugOverlay[]>([
  [249, ONYXIA_DEEP_BREATH_LANES.map((lane, index): MapDebugPathOverlay => ({
    kind: "path",
    id: `onyxia-deep-breath-${lane.id}`,
    mapId: 249,
    label: `Deep Breath: ${lane.id.replaceAll("_", " ")}`,
    points: extendedDeepBreathLane(lane.from, lane.to),
    widthYards: 18,
    color: ONYXIA_LANE_COLORS[index],
    opacity: 0.34,
  }))],
]);

/** Encounter-specific diagnostics registered for a world map. */
export function mapDebugOverlays(mapId: number): readonly MapDebugOverlay[] {
  return OVERLAYS_BY_MAP.get(mapId) ?? [];
}
