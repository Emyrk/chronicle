import type {
  WowMap,
  WowMapAssignment,
  WowMapFloorBounds,
  WowMapInstance,
  WowMapInstanceFloor,
  WowMapManifest,
} from "@/pages/Technical/mapGallery";
import type { MapEncounterPositions, MapPositionSample } from "./map.processor";

export interface MapPoint {
  leftPercent: number;
  topPercent: number;
}

export type ResolvedMapArtwork =
  | { kind: "instance"; instance: WowMapInstance }
  | { kind: "zone"; map: WowMap; assignment: WowMapAssignment };

export function latestPositionAt(
  positions: MapPositionSample[],
  timestampMs: number,
): MapPositionSample | null {
  let low = 0;
  let high = positions.length - 1;
  let match = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (positions[middle].timestampMs <= timestampMs) {
      match = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match >= 0 ? positions[match] : null;
}

export function selectMapEncounter(
  encounters: Map<string, MapEncounterPositions>,
  selectedEncounterIds: string[],
  timestampMs: number | null,
): MapEncounterPositions | null {
  const selected = selectedEncounterIds
    .map((id) => encounters.get(id))
    .filter((encounter): encounter is MapEncounterPositions => Boolean(encounter))
    .sort((left, right) => left.startMs - right.startMs);
  if (selected.length === 0) return null;
  if (timestampMs === null) return selected[selected.length - 1];
  const containing = selected.find((encounter) => timestampMs >= encounter.startMs && timestampMs <= encounter.endMs);
  if (containing) return containing;
  for (let index = selected.length - 1; index >= 0; index--) {
    if (selected[index].startMs <= timestampMs) return selected[index];
  }
  return selected[0];
}

export function dominantMapId(samples: MapPositionSample[]): number | null {
  const counts = new Map<number, number>();
  for (const sample of samples) counts.set(sample.mapId, (counts.get(sample.mapId) ?? 0) + 1);
  let selected: number | null = null;
  let count = 0;
  for (const [mapId, candidateCount] of counts) {
    if (candidateCount > count) {
      selected = mapId;
      count = candidateCount;
    }
  }
  return selected;
}

function assignmentContains(assignment: WowMapAssignment, sample: MapPositionSample): boolean {
  const [minWorldX, minWorldY, , maxWorldX, maxWorldY] = assignment.region;
  return sample.x >= Math.min(minWorldX, maxWorldX)
    && sample.x <= Math.max(minWorldX, maxWorldX)
    && sample.y >= Math.min(minWorldY, maxWorldY)
    && sample.y <= Math.max(minWorldY, maxWorldY);
}

function assignmentArea(assignment: WowMapAssignment): number {
  const [minWorldX, minWorldY, , maxWorldX, maxWorldY] = assignment.region;
  return Math.abs(maxWorldX - minWorldX) * Math.abs(maxWorldY - minWorldY);
}

function normalizedMapName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function resolveMapArtwork(
  manifest: WowMapManifest,
  mapId: number,
  sample?: MapPositionSample,
  instanceName?: string,
): ResolvedMapArtwork | null {
  const normalizedInstanceName = instanceName ? normalizedMapName(instanceName) : "";
  const instance = manifest.instances?.find((candidate) =>
    candidate.mapID === mapId
      || (mapId === 0 && normalizedInstanceName !== "" && normalizedMapName(candidate.name) === normalizedInstanceName),
  );
  if (instance) return { kind: "instance", instance };

  const zoneCandidates = manifest.maps.flatMap((map) => {
    if (!map.art?.some((art) => art.layers.some((layer) => layer.tiles.length > 0))) return [];
    return (map.assignments ?? [])
      .filter((assignment) => assignment.mapID === mapId && (!sample || assignmentContains(assignment, sample)))
      .map((assignment) => ({ kind: "zone" as const, map, assignment }));
  });
  if (zoneCandidates.length > 0) {
    return zoneCandidates.reduce((best, candidate) =>
      assignmentArea(candidate.assignment) < assignmentArea(best.assignment) ? candidate : best);
  }

  const map = manifest.maps.find((candidate) => candidate.id === mapId);
  const assignment = map?.assignments?.[0];
  return map && assignment ? { kind: "zone", map, assignment } : null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value * 100));
}

export function zoneMapPoint(sample: MapPositionSample, assignment: WowMapAssignment): MapPoint | null {
  const [minWorldX, minWorldY, , maxWorldX, maxWorldY] = assignment.region;
  if (maxWorldX === minWorldX || maxWorldY === minWorldY) return null;
  const normalizedX = (maxWorldY - sample.y) / (maxWorldY - minWorldY);
  const normalizedY = (maxWorldX - sample.x) / (maxWorldX - minWorldX);
  const uiX = assignment.uiMin[0] + normalizedX * (assignment.uiMax[0] - assignment.uiMin[0]);
  const uiY = assignment.uiMin[1] + normalizedY * (assignment.uiMax[1] - assignment.uiMin[1]);
  return { leftPercent: clampPercent(uiX), topPercent: clampPercent(uiY) };
}

export function usableDungeonBounds(mapId: number, floor: WowMapInstanceFloor | undefined): WowMapFloorBounds | null {
  // Forever's Wailing Caverns telemetry uses multiple coordinate frames that
  // do not consistently project through the 3.3.5 DungeonMap bounds.
  if (mapId === 43) return null;
  return floor?.bounds ?? null;
}

export function dungeonMapPoint(sample: MapPositionSample, bounds: WowMapFloorBounds): MapPoint | null {
  if (bounds.maxX === bounds.minX || bounds.maxY === bounds.minY) return null;
  // DungeonMap's horizontal bounds apply to world Y and its vertical bounds
  // apply to world X, both descending from the artwork's top-left origin.
  return {
    leftPercent: clampPercent((bounds.maxX - sample.y) / (bounds.maxX - bounds.minX)),
    topPercent: clampPercent((bounds.maxY - sample.x) / (bounds.maxY - bounds.minY)),
  };
}
