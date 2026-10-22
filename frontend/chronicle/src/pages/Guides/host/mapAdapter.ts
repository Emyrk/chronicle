import { fetchMapManifest } from "@/pages/Technical/mapManifest";
import type {
  WowMapAssignment,
  WowMapFloorBounds,
  WowMapInstance,
  WowMapManifest,
  WowMapRenderedInstance,
} from "@/pages/Technical/mapGallery";
import { dungeonMeshLiquid, dungeonMeshUrl, placeableDungeonMesh } from "../../Instance/EventsPanels/Map/dungeonMeshes";
import type { MapPositionSample } from "../../Instance/EventsPanels/Map/map.processor";
import { dungeonMapPoint, renderedDungeonMapPoint, replayPositionAt, zoneMapPoint } from "../../Instance/EventsPanels/Map/mapModel";
import type { MapEncounterPositions } from "../../Instance/EventsPanels/Map/map.processor";
import type { EncounterEffects } from "../../Instance/EventsPanels/Map/replayEffects";
import type { PlanItem, PlanMarkerIcon, PlanPoint } from "../../Instance/EventsPanels/Map/plan/mapPlan";
import type { MapSceneMarker } from "../../Instance/EventsPanels/Map/useMapScene";
import type { RetainedScene, SceneNode } from "../protocol";
import type { GuideMapResolver, GuideResolvedMap } from "./types";

const ROLE_COLORS: Readonly<Record<string, string>> = {
  tank: "#60a5fa",
  healer: "#34d399",
  melee: "#f59e0b",
  ranged: "#a78bfa",
  boss: "#ef4444",
  enemy: "#ef4444",
  add: "#fb7185",
  player: "#e5e7eb",
  pet: "#c084fc",
};

const PLAN_ICONS = new Set<PlanMarkerIcon>(["star", "circle", "diamond", "triangle", "moon", "square", "cross", "skull"]);

interface AxisMapping {
  project(sample: MapPositionSample): { leftPercent: number; topPercent: number } | null;
  toWorld(x: number, y: number): PlanPoint;
  radius(radius: number): number;
}

function renderedMapping(bounds: WowMapFloorBounds): AxisMapping {
  return {
    project: (sample) => renderedDungeonMapPoint(sample, bounds),
    toWorld: (x, y) => ({
      x: bounds.maxX - y * (bounds.maxX - bounds.minX),
      y: bounds.maxY - x * (bounds.maxY - bounds.minY),
    }),
    radius: (radius) => radius * Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY),
  };
}

function floorMapping(bounds: WowMapFloorBounds): AxisMapping {
  return {
    project: (sample) => dungeonMapPoint(sample, bounds),
    toWorld: (x, y) => ({
      x: bounds.maxY - y * (bounds.maxY - bounds.minY),
      y: bounds.maxX - x * (bounds.maxX - bounds.minX),
    }),
    radius: (radius) => radius * Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY),
  };
}

function zoneMapping(assignment: WowMapAssignment): AxisMapping {
  const [minWorldX, minWorldY, , maxWorldX, maxWorldY] = assignment.region;
  const uiWidth = assignment.uiMax[0] - assignment.uiMin[0];
  const uiHeight = assignment.uiMax[1] - assignment.uiMin[1];
  return {
    project: (sample) => zoneMapPoint(sample, assignment),
    toWorld: (x, y) => {
      const normalizedX = uiWidth === 0 ? x : (x - assignment.uiMin[0]) / uiWidth;
      const normalizedY = uiHeight === 0 ? y : (y - assignment.uiMin[1]) / uiHeight;
      return {
        x: maxWorldX - normalizedY * (maxWorldX - minWorldX),
        y: maxWorldY - normalizedX * (maxWorldY - minWorldY),
      };
    },
    radius: (radius) => radius * Math.min(Math.abs(maxWorldX - minWorldX), Math.abs(maxWorldY - minWorldY)),
  };
}

function normalizedMapping(mapId: number): AxisMapping {
  return {
    project: (sample) => sample.mapId === mapId ? { leftPercent: sample.y * 100, topPercent: sample.x * 100 } : null,
    toWorld: (x, y) => ({ x: y, y: x }),
    radius: (radius) => radius,
  };
}

function meshCanvas(instance: WowMapInstance) {
  const mesh = placeableDungeonMesh(instance.mesh);
  if (!mesh) return null;
  return {
    floor: 0,
    width: mesh.bounds.maxY - mesh.bounds.minY,
    height: mesh.bounds.maxX - mesh.bounds.minX,
    tileWidth: 0,
    tileHeight: 0,
    bounds: mesh.bounds,
    tiles: [],
  };
}

function renderedCanvas(instance: WowMapInstance): WowMapRenderedInstance | null {
  if (instance.renders?.bounds && instance.renders.width > 0 && instance.renders.height > 0) {
    return { ...instance.renders, bounds: instance.renders.bounds, source: "renders" };
  }
  return instance.styled?.bounds ? instance.styled : null;
}

export function resolveGuideMap(manifest: WowMapManifest, mapId: number, iconBaseUrl: string): GuideResolvedMap | null {
  const instance = manifest.instances?.find((candidate) => candidate.mapID === mapId);
  if (instance) {
    const mesh = placeableDungeonMesh(instance.mesh);
    const render = renderedCanvas(instance);
    const floor = instance.floors.find((candidate) => candidate.bounds) ?? instance.floors[0];
    const canvas = render ?? floor ?? meshCanvas(instance);
    if (!canvas) return null;
    const bounds = render?.bounds ?? floor?.bounds ?? mesh?.bounds;
    const mapping = bounds ? (render || mesh ? renderedMapping(bounds) : floorMapping(bounds)) : normalizedMapping(mapId);
    return {
      ground: { iconBaseUrl, canvas },
      dungeonMesh: mesh ? { url: dungeonMeshUrl(mesh, iconBaseUrl), bounds: mesh.bounds, liquid: dungeonMeshLiquid(mesh) } : null,
      projectSample: mapping.project,
      normalizedToWorld: mapping.toWorld,
      normalizedRadiusToYards: mapping.radius,
    };
  }

  for (const map of manifest.maps) {
    const assignment = map.assignments?.find((candidate) => candidate.mapID === mapId);
    const art = map.art?.find((candidate) => candidate.layers.some((layer) => layer.tiles.length > 0));
    const layer = art?.layers.find((candidate) => candidate.tiles.length > 0);
    if (!assignment || !art || !layer) continue;
    const mapping = zoneMapping(assignment);
    return {
      ground: { iconBaseUrl, canvas: layer, overlays: art.overlays },
      dungeonMesh: null,
      projectSample: mapping.project,
      normalizedToWorld: mapping.toWorld,
      normalizedRadiusToYards: mapping.radius,
    };
  }
  return null;
}

export const defaultGuideMapResolver: GuideMapResolver = async (mapId, iconBaseUrl) =>
  resolveGuideMap(await fetchMapManifest(iconBaseUrl), mapId, iconBaseUrl);

function numberProp(node: SceneNode, key: string, fallback = 0): number {
  const value = node.props[key];
  return typeof value === "number" ? value : fallback;
}

function stringProp(node: SceneNode, key: string, fallback = ""): string {
  const value = node.props[key];
  return typeof value === "string" ? value : fallback;
}

function pointProp(value: unknown): { x: number; y: number }[] {
  return Array.isArray(value)
    ? value.flatMap((point) => {
        if (!point || typeof point !== "object") return [];
        const candidate = point as { x?: unknown; y?: unknown };
        return typeof candidate.x === "number" && typeof candidate.y === "number" ? [{ x: candidate.x, y: candidate.y }] : [];
      })
    : [];
}

function opaqueColor(color: string, fallback = "#ffffff"): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7);
  if (/^#[0-9a-f]{3,4}$/i.test(color)) return `#${[...color.slice(1, 4)].map((digit) => digit + digit).join("")}`;
  return fallback;
}

export function parseUnitEntry(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string") return undefined;
  const direct = /^(?:npc:|creature:)?(\d+)$/i.exec(value.trim());
  if (direct) return Number(direct[1]);
  const guid = /^(?:Creature|Vehicle)-[^-]*-[^-]*-[^-]*-[^-]*-(\d+)-/i.exec(value);
  return guid ? Number(guid[1]) : undefined;
}

export interface GuideMapScene {
  markers: MapSceneMarker[];
  planItems: PlanItem[];
  bossGuids: ReadonlySet<string>;
  effects?: EncounterEffects;
}

function markerKind(role: string): MapSceneMarker["kind"] {
  if (role === "pet") return "pet";
  if (role === "boss" || role === "enemy" || role === "add") return "hostile";
  return "player";
}

export function adaptGuideMapScene(
  scene: RetainedScene,
  map: GuideResolvedMap,
  mapId: number,
  assets: ReadonlyMap<string, string> = new Map(),
  eventEncounter: MapEncounterPositions | null = null,
  cursorMs: number | null = null,
): GuideMapScene {
  const markers: MapSceneMarker[] = [];
  const planItems: PlanItem[] = [];
  const bossGuids = new Set<string>();

  for (const node of scene.nodes.values()) {
    if (node.props.visible === false) continue;
    const color = opaqueColor(stringProp(node, "color", ROLE_COLORS[stringProp(node, "role")] ?? "#ffffff"));
    if (node.kind === "unit") {
      const x = numberProp(node, "x");
      const y = numberProp(node, "y");
      const world = map.normalizedToWorld(x, y);
      const role = stringProp(node, "role", "player").toLowerCase();
      if (role === "boss") bossGuids.add(node.id);
      const staticSample: MapPositionSample = {
        timestampMs: 0,
        x: world.x,
        y: world.y,
        ...(world.z === undefined ? {} : { z: world.z }),
        mapId,
        facing: numberProp(node, "facing", 0),
      };
      const positions = eventEncounter?.positionsByUnit.get(node.id) ?? [staticSample];
      const sample = cursorMs === null ? positions.at(-1)! : replayPositionAt(positions, cursorMs, true) ?? positions[0];
      const point = map.projectSample(sample) ?? { leftPercent: x * 100, topPercent: y * 100 };
      markers.push({
        guid: node.id,
        sample,
        positions,
        point,
        color,
        kind: markerKind(role),
        muted: false,
        name: stringProp(node, "label", stringProp(node, "unit", node.id)),
        health: null,
        entry: parseUnitEntry(node.props.entry) ?? parseUnitEntry(node.props.unit),
        icon: null,
        healthFraction: null,
      });
      continue;
    }

    const at = () => map.normalizedToWorld(numberProp(node, "x"), numberProp(node, "y"));
    if (node.kind === "icon") {
      const asset = assets.get(stringProp(node, "asset"));
      const requested = stringProp(node, "label").toLowerCase() as PlanMarkerIcon;
      if (!asset && PLAN_ICONS.has(requested)) planItems.push({ id: node.id, kind: "marker", at: at(), icon: requested });
      else planItems.push({ id: node.id, kind: "token", at: at(), label: stringProp(node, "label", ""), color, ...(asset ? { icon: asset } : {}) });
    } else if (node.kind === "map-text") {
      planItems.push({ id: node.id, kind: "text", at: at(), text: stringProp(node, "text"), color });
    } else if (node.kind === "circle") {
      planItems.push({ id: node.id, kind: "circle", at: at(), radius: map.normalizedRadiusToYards(numberProp(node, "radius")), color });
    } else if (node.kind === "cone") {
      planItems.push({
        id: node.id,
        kind: "cone",
        at: at(),
        radius: map.normalizedRadiusToYards(numberProp(node, "radius")),
        width: numberProp(node, "angle") * 180 / Math.PI,
        facing: numberProp(node, "facing"),
        color,
      });
    } else if (node.kind === "line" || node.kind === "arrow" || node.kind === "polygon") {
      const points = pointProp(node.props.points).map((point) => map.normalizedToWorld(point.x, point.y));
      if (node.kind === "arrow") planItems.push({ id: node.id, kind: "arrow", points, color });
      else planItems.push({ id: node.id, kind: "pen", points: node.kind === "polygon" && points.length > 0 ? [...points, points[0]] : points, color });
    }
  }
  return { markers, planItems, bossGuids, ...(eventEncounter ? { effects: eventEncounter.effects } : {}) };
}
