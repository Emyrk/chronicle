import type {
  WowMap,
  WowMapAssignment,
  WowMapFloorBounds,
  WowMapInstance,
  WowMapManifest,
} from "@/pages/Technical/mapGallery";
import type { MapEncounterPositions, MapHealthSample, MapPositionSample } from "./map.processor";

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

/** Most health bars drawn at once. */
export const MAX_HEALTH_BARS = 48;
/** Units whose health changed this recently get a bar. */
export const RECENT_HEALTH_MS = 3_000;

const HEALTH_RED = [239, 68, 68];
const HEALTH_AMBER = [245, 158, 11];
const HEALTH_GREEN = [34, 197, 94];

/** Bar fill colour: red at 0, amber at half, green at full health. */
export function healthBarColor(fraction: number): string {
  const t = Math.min(1, Math.max(0, fraction)) * 2;
  const [from, to] = t <= 1 ? [HEALTH_RED, HEALTH_AMBER] : [HEALTH_AMBER, HEALTH_GREEN];
  const mix = t <= 1 ? t : t - 1;
  const channel = (index: number) => Math.round(from[index] + (to[index] - from[index]) * mix);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

/** The unit's latest health sample at or before `timestampMs`, or null. */
export function latestHealthAt(samples: MapHealthSample[], timestampMs: number): MapHealthSample | null {
  const index = latestPositionIndex(samples, timestampMs);
  return index >= 0 ? samples[index] : null;
}

/**
 * Declutters health bars: bosses, then selected players, then units whose
 * health changed in the last RECENT_HEALTH_MS (most recent first), up to
 * MAX_HEALTH_BARS. Units without a sample at or before the cursor get none.
 * Returns each chosen unit's sample at the cursor.
 */
export function selectHealthBars(
  guids: readonly string[],
  healthByUnit: Map<string, MapHealthSample[]>,
  cursorMs: number,
  bossGuids: ReadonlySet<string>,
  selectedGuids: ReadonlySet<string>,
): Map<string, MapHealthSample> {
  const candidates = guids.flatMap((guid) => {
    const sample = latestHealthAt(healthByUnit.get(guid) ?? [], cursorMs);
    if (!sample) return [];
    const priority = bossGuids.has(guid) ? 0
      : selectedGuids.has(guid) ? 1
      : cursorMs - sample.timestampMs <= RECENT_HEALTH_MS ? 2 : -1;
    return priority < 0 ? [] : [{ guid, sample, priority }];
  });
  candidates.sort((left, right) => left.priority - right.priority || right.sample.timestampMs - left.sample.timestampMs);
  return new Map(candidates.slice(0, MAX_HEALTH_BARS).map(({ guid, sample }) => [guid, sample]));
}

function latestPositionIndex(positions: readonly { timestampMs: number }[], timestampMs: number): number {
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

/** A box in artwork percentages, like MapPoint. */
export interface MapPointBounds {
  minLeft: number;
  maxLeft: number;
  minTop: number;
  maxTop: number;
}

/** Units further than this from the focus centre (in world yards) are left out of the fit. */
export const FOCUS_RADIUS_YARDS = 80;

// Frames the encounter's whole unit track rather than the current frame, so
// the view stays put during replay. The track is centred on the boss (or on
// every unit when no boss is known) and clamped to `maxRadius` world yards
// around that centre, so a straggler or a pet left at the entrance does not
// blow the framing out to the whole map.
export function unitFocusBounds(
  positionsByUnit: Map<string, MapPositionSample[]>,
  mapId: number,
  project: (sample: MapPositionSample) => MapPoint | null,
  focusGuids: ReadonlySet<string> = new Set(),
  maxRadius = FOCUS_RADIUS_YARDS,
): MapPointBounds | null {
  const all: MapPositionSample[] = [];
  const focus: MapPositionSample[] = [];
  for (const [guid, positions] of positionsByUnit) {
    for (const sample of positions) {
      if (sample.mapId !== mapId) continue;
      all.push(sample);
      if (focusGuids.has(guid)) focus.push(sample);
    }
  }
  if (all.length === 0) return null;
  const centreSamples = focus.length > 0 ? focus : all;
  const centreX = median(centreSamples.map((sample) => sample.x));
  const centreY = median(centreSamples.map((sample) => sample.y));

  let bounds: MapPointBounds | null = null;
  for (const sample of all) {
    if (Math.hypot(sample.x - centreX, sample.y - centreY) > maxRadius) continue;
    const point = project(sample);
    if (!point) continue;
    if (!bounds) {
      bounds = { minLeft: point.leftPercent, maxLeft: point.leftPercent, minTop: point.topPercent, maxTop: point.topPercent };
      continue;
    }
    bounds.minLeft = Math.min(bounds.minLeft, point.leftPercent);
    bounds.maxLeft = Math.max(bounds.maxLeft, point.leftPercent);
    bounds.minTop = Math.min(bounds.minTop, point.topPercent);
    bounds.maxTop = Math.max(bounds.maxTop, point.topPercent);
  }
  return bounds;
}

/**
 * The visible part of the artwork: its centre in artwork fractions (0..1)
 * and a zoom relative to the whole artwork fitting the view (1 = full map).
 */
export interface MapViewport {
  centerX: number;
  centerY: number;
  zoom: number;
}

export const FULL_MAP_VIEWPORT: MapViewport = { centerX: 0.5, centerY: 0.5, zoom: 1 };
export const MAX_MAP_ZOOM = 50;
const FIT_PADDING = 0.15;
const FIT_MIN_SPAN = 1 / MAX_MAP_ZOOM;

export function clampViewport(viewport: MapViewport): MapViewport {
  const zoom = Math.max(1, Math.min(MAX_MAP_ZOOM, viewport.zoom));
  const half = 0.5 / zoom;
  return {
    centerX: Math.max(half, Math.min(1 - half, viewport.centerX)),
    centerY: Math.max(half, Math.min(1 - half, viewport.centerY)),
    zoom,
  };
}

// Frames `bounds` plus padding in a view with the artwork's aspect ratio,
// where a zoom of z shows 1/z of the artwork's width and of its height.
export function fitViewportToBounds(bounds: MapPointBounds): MapViewport {
  const spanX = (bounds.maxLeft - bounds.minLeft) / 100;
  const spanY = (bounds.maxTop - bounds.minTop) / 100;
  const span = Math.max(FIT_MIN_SPAN, Math.max(spanX, spanY) * (1 + FIT_PADDING * 2));
  return clampViewport({
    centerX: (bounds.minLeft + bounds.maxLeft) / 200,
    centerY: (bounds.minTop + bounds.maxTop) / 200,
    zoom: 1 / span,
  });
}

/** Zooms by `factor` keeping the artwork point under view fraction (`viewX`, `viewY`) fixed. */
export function zoomViewportAt(viewport: MapViewport, factor: number, viewX: number, viewY: number): MapViewport {
  const anchorX = viewport.centerX + (viewX - 0.5) / viewport.zoom;
  const anchorY = viewport.centerY + (viewY - 0.5) / viewport.zoom;
  const zoom = Math.max(1, Math.min(MAX_MAP_ZOOM, viewport.zoom * factor));
  return clampViewport({
    centerX: anchorX - (viewX - 0.5) / zoom,
    centerY: anchorY - (viewY - 0.5) / zoom,
    zoom,
  });
}

/** Where an artwork point lands in a view showing `viewport`, in view percentages. */
export function viewportPoint(point: MapPoint, viewport: MapViewport): MapPoint {
  return {
    leftPercent: ((point.leftPercent / 100 - viewport.centerX) * viewport.zoom + 0.5) * 100,
    topPercent: ((point.topPercent / 100 - viewport.centerY) * viewport.zoom + 0.5) * 100,
  };
}
