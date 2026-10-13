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

export interface MapViewport {
  leftPercent: number;
  topPercent: number;
  spanPercent: number;
}

export interface MapCamera {
  scale: number;
  x: number;
  y: number;
}

export interface MapCameraBounds {
  width: number;
  height: number;
}

export interface MapCanvasRect extends MapCameraBounds {
  left: number;
  top: number;
}

export function fitMapCanvasRect(container: MapCameraBounds, canvas: MapCameraBounds): MapCanvasRect {
  if (container.width <= 0 || container.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(container.width / canvas.width, container.height / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  return {
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
    width,
    height,
  };
}

export function clampMapCamera(camera: MapCamera, bounds: MapCameraBounds): MapCamera {
  const scale = Math.max(1, Math.min(5, camera.scale));
  if (bounds.width <= 0 || bounds.height <= 0 || scale === 1) return { scale, x: 0, y: 0 };
  return {
    scale,
    x: Math.max(bounds.width * (1 - scale), Math.min(0, camera.x)),
    y: Math.max(bounds.height * (1 - scale), Math.min(0, camera.y)),
  };
}

export function fitMapCameraToPoints(
  points: MapPoint[],
  bounds: MapCameraBounds,
  paddingPercent = 18,
  maximumScale = 4,
): MapCamera {
  if (points.length === 0 || bounds.width <= 0 || bounds.height <= 0) return { scale: 1, x: 0, y: 0 };

  let left = points[0].leftPercent;
  let right = left;
  let top = points[0].topPercent;
  let bottom = top;
  for (const point of points.slice(1)) {
    left = Math.min(left, point.leftPercent);
    right = Math.max(right, point.leftPercent);
    top = Math.min(top, point.topPercent);
    bottom = Math.max(bottom, point.topPercent);
  }

  const availableRatio = Math.max(0.1, 1 - paddingPercent / 50);
  const widthRatio = Math.max((right - left) / 100, 0.04);
  const heightRatio = Math.max((bottom - top) / 100, 0.04);
  const scale = Math.max(1, Math.min(maximumScale, availableRatio / widthRatio, availableRatio / heightRatio));
  const centerX = ((left + right) / 2 / 100) * bounds.width;
  const centerY = ((top + bottom) / 2 / 100) * bounds.height;
  return clampMapCamera({
    scale,
    x: bounds.width / 2 - centerX * scale,
    y: bounds.height / 2 - centerY * scale,
  }, bounds);
}

export function zoomMapCameraAtPoint(
  camera: MapCamera,
  nextScale: number,
  focalPoint: { x: number; y: number },
  bounds: MapCameraBounds,
): MapCamera {
  const scale = Math.max(1, Math.min(5, nextScale));
  const ratio = scale / camera.scale;
  return clampMapCamera({
    scale,
    x: focalPoint.x - (focalPoint.x - camera.x) * ratio,
    y: focalPoint.y - (focalPoint.y - camera.y) * ratio,
  }, bounds);
}

export type ResolvedMapArtwork =
  | { kind: "instance"; instance: WowMapInstance }
  | { kind: "zone"; map: WowMap; assignment: WowMapAssignment };

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

export function latestPositionAt(
  positions: MapPositionSample[],
  timestampMs: number,
): MapPositionSample | null {
  const match = latestPositionIndex(positions, timestampMs);
  return match >= 0 ? positions[match] : null;
}

function interpolateFacing(from: number, to: number, progress: number): number {
  const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + turn * progress;
}

export function interpolatedPositionAt(
  positions: MapPositionSample[],
  timestampMs: number,
): MapPositionSample | null {
  const previousIndex = latestPositionIndex(positions, timestampMs);
  if (previousIndex < 0) return null;

  const previous = positions[previousIndex];
  const next = positions[previousIndex + 1];
  if (!next || next.mapId !== previous.mapId || next.timestampMs <= previous.timestampMs) return previous;

  const progress = Math.max(0, Math.min(1,
    (timestampMs - previous.timestampMs) / (next.timestampMs - previous.timestampMs),
  ));
  return {
    timestampMs,
    x: previous.x + (next.x - previous.x) * progress,
    y: previous.y + (next.y - previous.y) * progress,
    mapId: previous.mapId,
    facing: interpolateFacing(previous.facing, next.facing, progress),
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

export function selectMapJourneyEncounters(
  encounters: Map<string, MapEncounterPositions>,
  selectedEncounterIds: string[],
): MapEncounterPositions[] {
  const selected = selectedEncounterIds
    .map((id) => encounters.get(id))
    .filter((encounter): encounter is MapEncounterPositions => Boolean(encounter));
  if (selected.length === 0) return [];

  const startMs = Math.min(...selected.map((encounter) => encounter.startMs));
  const endMs = Math.max(...selected.map((encounter) => encounter.endMs));
  return Array.from(encounters.values())
    .filter((encounter) => encounter.endMs >= startMs && encounter.startMs <= endMs)
    .sort((left, right) => left.startMs - right.startMs);
}

export function encounterRouteSamples(
  encounter: MapEncounterPositions,
  includeUnit: (guid: string) => boolean,
  minimumBucketMs = 2_000,
  maximumPoints = 240,
): MapPositionSample[] {
  const included = Array.from(encounter.positionsByUnit.entries())
    .filter(([guid]) => includeUnit(guid));
  const sources = included.length > 0 ? included : Array.from(encounter.positionsByUnit.entries());
  const samples = sources.flatMap(([, positions]) => positions);
  if (samples.length === 0) return [];

  const durationMs = Math.max(0, encounter.endMs - encounter.startMs);
  const bucketMs = Math.max(minimumBucketMs, Math.ceil(durationMs / maximumPoints));
  const buckets = new Map<number, MapPositionSample[]>();
  for (const sample of samples) {
    const bucket = Math.floor((sample.timestampMs - encounter.startMs) / bucketMs);
    const values = buckets.get(bucket) ?? [];
    values.push(sample);
    buckets.set(bucket, values);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left - right)
    .map(([, values]) => {
      const mapId = dominantMapId(values);
      const mapSamples = values.filter((sample) => sample.mapId === mapId);
      return {
        timestampMs: median(mapSamples.map((sample) => sample.timestampMs)),
        x: median(mapSamples.map((sample) => sample.x)),
        y: median(mapSamples.map((sample) => sample.y)),
        mapId: mapId!,
        facing: 0,
      };
    });
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

export function fitMapViewport(
  points: MapPoint[],
  paddingPercent = 7,
  minimumSpanPercent = 28,
): MapViewport {
  if (points.length === 0) return { leftPercent: 0, topPercent: 0, spanPercent: 100 };

  let left = points[0].leftPercent;
  let right = left;
  let top = points[0].topPercent;
  let bottom = top;
  for (const point of points.slice(1)) {
    left = Math.min(left, point.leftPercent);
    right = Math.max(right, point.leftPercent);
    top = Math.min(top, point.topPercent);
    bottom = Math.max(bottom, point.topPercent);
  }
  const spanPercent = Math.min(100, Math.max(
    minimumSpanPercent,
    right - left + paddingPercent * 2,
    bottom - top + paddingPercent * 2,
  ));
  const maxOffset = 100 - spanPercent;
  return {
    leftPercent: Math.max(0, Math.min(maxOffset, (left + right - spanPercent) / 2)),
    topPercent: Math.max(0, Math.min(maxOffset, (top + bottom - spanPercent) / 2)),
    spanPercent,
  };
}

export function pointInMapViewport(point: MapPoint, viewport: MapViewport): MapPoint {
  return {
    leftPercent: ((point.leftPercent - viewport.leftPercent) / viewport.spanPercent) * 100,
    topPercent: ((point.topPercent - viewport.topPercent) / viewport.spanPercent) * 100,
  };
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

export function projectDungeonMapPoint(
  sample: MapPositionSample,
  bounds: WowMapFloorBounds,
  mapId: number,
  calibration: DungeonMapCalibration | null,
  rendered = false,
): MapPoint | null {
  if (rendered) return renderedDungeonMapPoint(sample, bounds);
  if (mapId === 43 && !calibration) return null;
  return calibration
    ? calibratedDungeonMapPoint(sample, bounds, calibration)
    : dungeonMapPoint(sample, bounds);
}

export function renderedDungeonMapPoint(sample: MapPositionSample, bounds: WowMapFloorBounds): MapPoint | null {
  if (bounds.maxX === bounds.minX || bounds.maxY === bounds.minY) return null;
  return {
    leftPercent: clampPercent((bounds.maxY - sample.y) / (bounds.maxY - bounds.minY)),
    topPercent: clampPercent((bounds.maxX - sample.x) / (bounds.maxX - bounds.minX)),
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
