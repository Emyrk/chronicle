import type {
  WowMap,
  WowMapAssignment,
  WowMapFloorBounds,
  WowMapInstance,
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
  const index = latestPositionIndex(positions, timestampMs);
  return index >= 0 ? positions[index] : null;
}

function latestPositionIndex(positions: MapPositionSample[], timestampMs: number): number {
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
  return match;
}

const MAX_INTERPOLATION_GAP_MS = 2_000;

function lerpAngle(from: number, to: number, t: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

// Like latestPositionAt, but blends toward the next sample when both are on
// the same map and close enough in time that the unit plausibly moved
// between them. Longer gaps hold the latest sample, matching the 2D view.
export function interpolatedPositionAt(
  positions: MapPositionSample[],
  timestampMs: number,
  maxGapMs = MAX_INTERPOLATION_GAP_MS,
): MapPositionSample | null {
  const index = latestPositionIndex(positions, timestampMs);
  if (index < 0) return null;
  const latest = positions[index];
  const next = positions[index + 1];
  if (!next || next.mapId !== latest.mapId || next.timestampMs <= latest.timestampMs) return latest;
  if (next.timestampMs - latest.timestampMs > maxGapMs) return latest;
  const t = (timestampMs - latest.timestampMs) / (next.timestampMs - latest.timestampMs);
  return {
    timestampMs,
    x: latest.x + (next.x - latest.x) * t,
    y: latest.y + (next.y - latest.y) * t,
    mapId: latest.mapId,
    facing: lerpAngle(latest.facing, next.facing, t),
  };
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

export interface DungeonMapCalibration {
  anchorSample: MapPositionSample;
  anchorPoint: MapPoint;
}

// Adventure Guide boss pins in artwork percentages. Advanced combat logs use
// canonical map-space coordinates, but Wailing Caverns' flattened artwork does
// not have one affine transform that fits every cavern region. Each boss
// encounter therefore uses its boss as a local artwork anchor while retaining
// the corrected DungeonMap scale and orientation for nearby movement.
const WAILING_CAVERNS_BOSS_PINS = new Map<number, MapPoint>([
  [3671, { leftPercent: 30.6, topPercent: 43 }],
  [3670, { leftPercent: 19.1, topPercent: 39.5 }],
  [3669, { leftPercent: 16.7, topPercent: 56.8 }],
  [3653, { leftPercent: 38.5, topPercent: 36.1 }],
  [3674, { leftPercent: 62.3, topPercent: 74.4 }],
  [3673, { leftPercent: 61.6, topPercent: 53.9 }],
  [5775, { leftPercent: 55.5, topPercent: 46.5 }],
  [3654, { leftPercent: 34.6, topPercent: 13.7 }],
]);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function terminalMedianPosition(positions: MapPositionSample[]): MapPositionSample | null {
  const last = positions.at(-1);
  if (!last) return null;
  const terminal = positions.filter((sample) => sample.timestampMs >= last.timestampMs - 5_000);
  return {
    ...last,
    x: median(terminal.map((sample) => sample.x)),
    y: median(terminal.map((sample) => sample.y)),
  };
}

export function resolveDungeonMapCalibration(
  mapId: number,
  encounter: MapEncounterPositions,
  unitEntry: (guid: string) => number | undefined,
): DungeonMapCalibration | null {
  if (mapId !== 43) return null;
  for (const [guid, positions] of encounter.positionsByUnit) {
    const anchorPoint = WAILING_CAVERNS_BOSS_PINS.get(unitEntry(guid) ?? 0);
    const anchorSample = terminalMedianPosition(positions);
    if (anchorPoint && anchorSample) return { anchorSample, anchorPoint };
  }
  return null;
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function calibratedDungeonMapPoint(
  sample: MapPositionSample,
  bounds: WowMapFloorBounds,
  calibration: DungeonMapCalibration,
): MapPoint | null {
  if (bounds.maxX === bounds.minX || bounds.maxY === bounds.minY) return null;
  return {
    leftPercent: clampPercentage(calibration.anchorPoint.leftPercent
      + ((calibration.anchorSample.y - sample.y) / (bounds.maxX - bounds.minX)) * 100),
    topPercent: clampPercentage(calibration.anchorPoint.topPercent
      + ((calibration.anchorSample.x - sample.x) / (bounds.maxY - bounds.minY)) * 100),
  };
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

export interface ScenePoint {
  x: number;
  z: number;
}

// Places a 2D artwork point on a ground plane centred on the origin that is
// `width` wide and keeps the artwork's aspect ratio (`aspect` = height/width).
// Artwork left grows along +x and artwork top grows along +z.
export function mapPointToScene(point: MapPoint, aspect: number, width = 1): ScenePoint {
  return {
    x: (point.leftPercent / 100 - 0.5) * width,
    z: (point.topPercent / 100 - 0.5) * width * aspect,
  };
}
