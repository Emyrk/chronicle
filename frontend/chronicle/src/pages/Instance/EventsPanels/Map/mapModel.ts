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

/** The canvas scaled to cover the container (no bars) and centred, overflowing on one axis. */
export function coverMapCanvasRect(container: MapCameraBounds, canvas: MapCameraBounds): MapCanvasRect {
  if (container.width <= 0 || container.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.max(container.width / canvas.width, container.height / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  return {
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
    width,
    height,
  };
}

/** The zoom at which a covering canvas shrinks to fit the container whole (≤ 1). */
export function containScaleForCover(container: MapCameraBounds, canvas: MapCameraBounds): number {
  if (container.width <= 0 || container.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return 1;
  const contain = Math.min(container.width / canvas.width, container.height / canvas.height);
  const cover = Math.max(container.width / canvas.width, container.height / canvas.height);
  return contain / cover;
}

const MAX_MAP_SCALE = 5;

/**
 * A free camera over a canvas laid out at `rect` inside `viewport`: zoom between
 * `minScale` and 5, and pan anywhere that leaves `keepVisible` px of the map on
 * screen (the rest clips at the viewport). Camera x/y are offsets from the rect.
 */
export function clampFreeMapCamera(
  camera: MapCamera,
  rect: MapCanvasRect,
  viewport: MapCameraBounds,
  minScale: number,
  keepVisible = 48,
): MapCamera {
  const scale = Math.max(minScale, Math.min(MAX_MAP_SCALE, camera.scale));
  if (rect.width <= 0 || rect.height <= 0) return { scale, x: 0, y: 0 };
  const width = rect.width * scale;
  const height = rect.height * scale;
  const keepX = Math.min(keepVisible, width, viewport.width);
  const keepY = Math.min(keepVisible, height, viewport.height);
  return {
    scale,
    x: Math.max(keepX - rect.left - width, Math.min(viewport.width - keepX - rect.left, camera.x)),
    y: Math.max(keepY - rect.top - height, Math.min(viewport.height - keepY - rect.top, camera.y)),
  };
}

/**
 * The free camera that frames these points (percentages of `rect`) in the middle
 * of `viewport`, leaving `paddingPercent` of the viewport around them.
 */
export function fitFreeMapCameraToPoints(
  points: MapPoint[],
  rect: MapCanvasRect,
  viewport: MapCameraBounds,
  minScale: number,
  paddingPercent = 8,
  maximumScale = 4,
): MapCamera {
  if (points.length === 0 || rect.width <= 0 || rect.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { scale: 1, x: 0, y: 0 };
  }
  let left = points[0].leftPercent;
  let right = left;
  let top = points[0].topPercent;
  let bottom = top;
  for (const point of points) {
    left = Math.min(left, point.leftPercent);
    right = Math.max(right, point.leftPercent);
    top = Math.min(top, point.topPercent);
    bottom = Math.max(bottom, point.topPercent);
  }
  const available = Math.max(0.1, 1 - (2 * paddingPercent) / 100);
  const width = Math.max(((right - left) / 100) * rect.width, 1);
  const height = Math.max(((bottom - top) / 100) * rect.height, 1);
  const scale = Math.max(minScale, Math.min(maximumScale, (viewport.width * available) / width, (viewport.height * available) / height));
  const centreX = ((left + right) / 2 / 100) * rect.width;
  const centreY = ((top + bottom) / 2 / 100) * rect.height;
  return clampFreeMapCamera({
    scale,
    x: viewport.width / 2 - rect.left - centreX * scale,
    y: viewport.height / 2 - rect.top - centreY * scale,
  }, rect, viewport, minScale);
}

/** Zoom a free camera about a point given in viewport coordinates. */
export function zoomFreeMapCamera(
  camera: MapCamera,
  nextScale: number,
  focalPoint: { x: number; y: number },
  rect: MapCanvasRect,
  viewport: MapCameraBounds,
  minScale: number,
): MapCamera {
  const scale = Math.max(minScale, Math.min(MAX_MAP_SCALE, nextScale));
  const ratio = scale / camera.scale;
  const focusX = focalPoint.x - rect.left;
  const focusY = focalPoint.y - rect.top;
  return clampFreeMapCamera({
    scale,
    x: focusX - (focusX - camera.x) * ratio,
    y: focusY - (focusY - camera.y) * ratio,
  }, rect, viewport, minScale);
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
export function latestHealthAt<T extends { timestampMs: number }>(samples: readonly T[], timestampMs: number): T | null {
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

/** Small timestamp skew allowed when a unit's first position lands just after the replay start. */
export const INITIAL_POSITION_LEAD_MS = 10;

function lerpAngle(from: number, to: number, t: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

// Like latestPositionAt, but linearly blends toward the next sample while both
// are on the same map. Players may use their first known location before their
// first sample so the raid is visible at 0:00; every unit gets a small allowance
// for stream timestamp skew at the encounter boundary.
export function replayPositionAt(
  positions: MapPositionSample[],
  timestampMs: number,
  showInitialPosition = false,
  maxInterpolationGapMs = Number.POSITIVE_INFINITY,
): MapPositionSample | null {
  const index = latestPositionIndex(positions, timestampMs);
  if (index < 0) {
    const first = positions[0];
    return first && (showInitialPosition || first.timestampMs - timestampMs <= INITIAL_POSITION_LEAD_MS) ? first : null;
  }
  const latest = positions[index];
  const next = positions[index + 1];
  if (!next || next.mapId !== latest.mapId || next.timestampMs <= latest.timestampMs || next.timestampMs - latest.timestampMs > maxInterpolationGapMs) return latest;
  const t = (timestampMs - latest.timestampMs) / (next.timestampMs - latest.timestampMs);
  const sample: MapPositionSample = {
    timestampMs,
    x: latest.x + (next.x - latest.x) * t,
    y: latest.y + (next.y - latest.y) * t,
    mapId: latest.mapId,
  };
  // Facing blends when both samples have it, else holds the earlier one's (if any).
  if (latest.facing !== undefined && next.facing !== undefined) sample.facing = lerpAngle(latest.facing, next.facing, t);
  else if (latest.facing !== undefined) sample.facing = latest.facing;
  // A logged height follows a smooth curve through the samples around it, so a
  // knock-up arcs rather than zigzags; with only one side logged it holds that sample's.
  if (latest.z !== undefined && next.z !== undefined) sample.z = smoothHeight(positions, index, t);
  else if (latest.z !== undefined) sample.z = latest.z;
  return sample;
}

// The height `t` (0-1) of the way from sample `index` to the next: a cubic
// Hermite curve (Catmull-Rom tangents over each sample's neighbours, scaled
// for uneven gaps), which passes through every sample. Both samples have z.
function smoothHeight(positions: readonly MapPositionSample[], index: number, t: number): number {
  const p0 = positions[index];
  const p1 = positions[index + 1];
  const z0 = p0.z!;
  const z1 = p1.z!;
  const gap = p1.timestampMs - p0.timestampMs;
  // A neighbour counts when it is logged, on the same map, and later/earlier.
  const neighbour = (at: number, from: MapPositionSample) => {
    const candidate = positions[at];
    return candidate && candidate.z !== undefined && candidate.mapId === from.mapId && candidate.timestampMs !== from.timestampMs ? candidate : null;
  };
  // Slope (yards per ms) at a sample, from its neighbours on either side.
  const slope = (before: MapPositionSample | null, after: MapPositionSample | null, at: MapPositionSample) => {
    const from = before ?? at;
    const to = after ?? at;
    return to.timestampMs === from.timestampMs ? 0 : (to.z! - from.z!) / (to.timestampMs - from.timestampMs);
  };
  const m0 = slope(neighbour(index - 1, p0), p1, p0) * gap;
  const m1 = slope(p0, neighbour(index + 2, p1), p1) * gap;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * z0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * z1 + (t3 - t2) * m1;
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

  // The journey runs from the start of the run (the way to the first selected
  // fight included) to the end of the last selected fight.
  const endMs = Math.max(...selected.map((encounter) => encounter.endMs));
  return Array.from(encounters.values())
    .filter((encounter) => encounter.startMs <= endMs)
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

export type OverviewMapSource = "renders" | "styled" | "art";

/** Choose 2D artwork without borrowing calibration from a different image. */
export function overviewDungeonCanvas(
  instance: WowMapInstance,
  floor: WowMapInstance["floors"][number] | undefined,
  source: OverviewMapSource,
) {
  const render = instance.renders && instance.renders.width > 0 && instance.renders.height > 0 ? instance.renders : undefined;
  const styled = instance.styled && instance.styled.width > 0 && instance.styled.height > 0 ? instance.styled : undefined;
  if (source === "art" && floor) return { canvas: floor, source: "art" as const };
  if (source === "styled" && styled) return { canvas: styled, source: "styled" as const };
  if (render) return { canvas: render, source: "renders" as const };
  if (styled) return { canvas: styled, source: "styled" as const };
  return { canvas: floor, source: "art" as const };
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

  const zoneCandidates = manifest.maps.flatMap((map) => {
    if (!map.art?.some((art) => art.layers.some((layer) => layer.tiles.length > 0))) return [];
    return (map.assignments ?? [])
      .filter((assignment) => assignment.mapID === mapId && (!sample || assignmentContains(assignment, sample)))
      .map((assignment) => ({ kind: "zone" as const, map, assignment }));
  });
  const zone = zoneCandidates.length > 0
    ? zoneCandidates.reduce((best, candidate) =>
      assignmentArea(candidate.assignment) < assignmentArea(best.assignment) ? candidate : best)
    : null;

  // Several legacy instance floors publish artwork without the world bounds
  // needed to place telemetry. Prefer the matching zone assignment when it
  // can project the sample. Wailing Caverns is the exception because its
  // original floor is projected through boss calibration below.
  const instanceHasProjection = instance && (
    instance.mapID === 43
      || Boolean(instance.renders?.bounds)
      || Boolean(instance.styled?.bounds)
      || instance.floors.some((floor) => Boolean(floor.bounds))
  );
  if (instance && (!sample || instanceHasProjection || !zone)) return { kind: "instance", instance };
  if (zone) return zone;
  if (instance) return { kind: "instance", instance };

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

export interface OverviewMapViewport {
  leftPercent: number;
  topPercent: number;
  spanPercent: number;
}

export function fitMapViewport(
  points: MapPoint[],
  paddingPercent = 7,
  minimumSpanPercent = 28,
): OverviewMapViewport {
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

export function pointInMapViewport(point: MapPoint, viewport: OverviewMapViewport): MapPoint {
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

// The world point a fit centres on: the median of the boss samples (`fromFocus`)
// or of every unit's samples when no boss is known.
export function focusCentre(
  positionsByUnit: Map<string, MapPositionSample[]>,
  mapId: number,
  focusGuids: ReadonlySet<string> = new Set(),
): { sample: MapPositionSample; fromFocus: boolean } | null {
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
  return {
    sample: {
      ...centreSamples[0],
      x: median(centreSamples.map((sample) => sample.x)),
      y: median(centreSamples.map((sample) => sample.y)),
    },
    fromFocus: focus.length > 0,
  };
}

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
  const centre = focusCentre(positionsByUnit, mapId, focusGuids)?.sample;
  if (!centre) return null;

  let bounds: MapPointBounds | null = null;
  for (const positions of positionsByUnit.values()) {
    for (const sample of positions) {
      if (sample.mapId !== mapId) continue;
      if (Math.hypot(sample.x - centre.x, sample.y - centre.y) > maxRadius) continue;
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
  }
  return bounds;
}

/** Artwork percent per world yard along each artwork axis. */
export interface MapProjectionScale {
  left: number;
  top: number;
}

// Both projections are axis-aligned (world Y moves left, world X moves top),
// so one diagonal step measures both axes. Steps both ways so a point at the
// artwork's edge, where projection clamps, still measures.
export function projectionScale(
  project: (sample: MapPositionSample) => MapPoint | null,
  at: MapPositionSample,
  stepYards = 10,
): MapProjectionScale | null {
  const origin = project(at);
  if (!origin) return null;
  let left = 0;
  let top = 0;
  for (const step of [stepYards, -stepYards]) {
    const moved = project({ ...at, x: at.x + step, y: at.y + step });
    if (!moved) continue;
    left = Math.max(left, Math.abs(moved.leftPercent - origin.leftPercent) / stepYards);
    top = Math.max(top, Math.abs(moved.topPercent - origin.topPercent) / stepYards);
  }
  return left > 0 && top > 0 ? { left, top } : null;
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

/**
 * The smallest span, in yards across the view's longer axis, that the auto
 * fit frames before padding. A five-player fight packed into ~20 yd would
 * otherwise fit at the maximum zoom, a few blurry tiles with the boss tiny in
 * the frame. 45 yd keeps a melee pack, its ranged and some room around them
 * in view (≈ 58 yd with padding); manual zoom is not limited by it.
 */
export const AUTO_FIT_MIN_SPAN_YARDS = 45;

export interface AutoFitOptions {
  /** Smallest visible span in yards across the longer axis, before padding; needs `scale`. */
  minSpanYards?: number;
  /** Artwork percent per yard around the fight (projectionScale). */
  scale?: MapProjectionScale | null;
  /** Move the centre towards this point (the boss) as far as keeps `bounds` in view. */
  centre?: MapPoint | null;
}

// Frames `bounds` plus padding in a view with the artwork's aspect ratio,
// where a zoom of z shows 1/z of the artwork's width and of its height.
// The bias towards `centre` never zooms out: it only uses the slack the
// minimum span or the other axis leaves, keeping half the padding as margin.
export function autoFitViewport(bounds: MapPointBounds, options: AutoFitOptions = {}): MapViewport {
  const spanX = (bounds.maxLeft - bounds.minLeft) / 100;
  const spanY = (bounds.maxTop - bounds.minTop) / 100;
  // The longer visible axis in yards is the one with fewer percent per yard.
  const minSpan = options.scale && options.minSpanYards
    ? options.minSpanYards * Math.min(options.scale.left, options.scale.top) / 100
    : 0;
  const span = Math.max(FIT_MIN_SPAN, Math.max(minSpan, spanX, spanY) * (1 + FIT_PADDING * 2));
  const centreAlong = (min: number, max: number, target: number | undefined) => {
    const middle = (min + max) / 200;
    if (target === undefined) return middle;
    const slack = Math.max(0, (span - ((max - min) / 100) * (1 + FIT_PADDING)) / 2);
    return Math.max(middle - slack, Math.min(middle + slack, target / 100));
  };
  return clampViewport({
    centerX: centreAlong(bounds.minLeft, bounds.maxLeft, options.centre?.leftPercent),
    centerY: centreAlong(bounds.minTop, bounds.maxTop, options.centre?.topPercent),
    zoom: 1 / span,
  });
}

export function fitViewportToBounds(bounds: MapPointBounds): MapViewport {
  return autoFitViewport(bounds);
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

/**
 * How the Map panel frames its view. `viewport` null follows the default
 * (the auto fit for one boss encounter, else the full map); Fit and Reset pin
 * one, and a manual zoom or pan stores where the user left it. Once `manual`
 * is set nothing re-frames until the selection changes or Fit / Reset is
 * pressed. The views apply the framing only when `revision` changes, so
 * replay ticks, filter changes and the user's own reports never move the
 * camera; a view that mounts (2D <-> 3D, or after a loading state) starts
 * from it.
 */
export interface MapFraming {
  selectionKey: string;
  revision: number;
  viewport: MapViewport | null;
  manual: boolean;
  /** The default framing last applied, to re-fit when it changes before any manual input. */
  defaultKey: string;
}

export const INITIAL_MAP_FRAMING: MapFraming = { selectionKey: "", revision: 0, viewport: null, manual: false, defaultKey: "" };

function viewportKey(viewport: MapViewport): string {
  return `${viewport.centerX.toFixed(5)},${viewport.centerY.toFixed(5)},${viewport.zoom.toFixed(4)}`;
}

/** The framing for this render: unchanged (same object) unless the selection or an untouched default changed. */
export function reconcileMapFraming(framing: MapFraming, selectionKey: string, defaultViewport: MapViewport): MapFraming {
  const defaultKey = viewportKey(defaultViewport);
  if (framing.selectionKey !== selectionKey) {
    return { selectionKey, revision: framing.revision + 1, viewport: null, manual: false, defaultKey };
  }
  if (!framing.manual && framing.viewport === null && framing.defaultKey !== defaultKey) {
    return { ...framing, revision: framing.revision + 1, defaultKey };
  }
  return framing;
}

/** Fit / Reset: apply `viewport` now and leave manual mode. */
export function pinMapFraming(framing: MapFraming, viewport: MapViewport): MapFraming {
  return { ...framing, revision: framing.revision + 1, viewport, manual: false };
}

/** The user zoomed or panned to `viewport`; the views already show it, so the revision stays. */
export function manualMapFraming(framing: MapFraming, viewport: MapViewport): MapFraming {
  return { ...framing, viewport, manual: true };
}

/** How long a re-framing animates; instant with prefers-reduced-motion. */
export const VIEW_TRANSITION_MS = 250;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** The viewport `t` (0..1) of the way from `from` to `to`; zoom moves geometrically so it feels even. */
export function interpolateViewport(from: MapViewport, to: MapViewport, t: number): MapViewport {
  if (t >= 1) return to;
  return {
    centerX: from.centerX + (to.centerX - from.centerX) * t,
    centerY: from.centerY + (to.centerY - from.centerY) * t,
    zoom: from.zoom * (to.zoom / from.zoom) ** t,
  };
}

/** Where an artwork point lands in a view showing `viewport`, in view percentages. */
export function viewportPoint(point: MapPoint, viewport: MapViewport): MapPoint {
  return {
    leftPercent: ((point.leftPercent / 100 - viewport.centerX) * viewport.zoom + 0.5) * 100,
    topPercent: ((point.topPercent / 100 - viewport.centerY) * viewport.zoom + 0.5) * 100,
  };
}
