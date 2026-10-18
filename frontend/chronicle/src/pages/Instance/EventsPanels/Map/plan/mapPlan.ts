/**
 * Raid and strategy plans drawn on the 3D map: markers, arrows, pen strokes,
 * text, range shapes and player tokens, in steps (Pull, Phase 2, …). Points
 * are world coordinates in yards (the log's x/y, with z the floor height),
 * so a plan fits every log of its instance and its circles keep true radii.
 * Pure data: no three.js, no React.
 */

export const PLAN_VERSION = 1;

export interface PlanPoint {
  /** World x/y (yards), as the log's unit positions. */
  x: number;
  y: number;
  /** Floor height (yards) where it was drawn, to pick the floor on stacked levels. */
  z?: number;
}

export const PLAN_MARKER_ICONS = ["star", "circle", "diamond", "triangle", "moon", "square", "cross", "skull"] as const;
export type PlanMarkerIcon = (typeof PLAN_MARKER_ICONS)[number];

interface PlanItemBase {
  id: string;
}

export type PlanItem = PlanItemBase & (
  | { kind: "marker"; at: PlanPoint; icon: PlanMarkerIcon }
  | { kind: "arrow"; points: PlanPoint[]; color: string }
  | { kind: "pen"; points: PlanPoint[]; color: string }
  | { kind: "text"; at: PlanPoint; text: string; color: string }
  /** A range circle, `radius` yards. */
  | { kind: "circle"; at: PlanPoint; radius: number; color: string }
  /** A cone from `at`, `radius` yards long, `width` degrees wide, pointing `facing` radians (WoW facing). */
  | { kind: "cone"; at: PlanPoint; radius: number; width: number; facing: number; color: string }
  | { kind: "rect"; from: PlanPoint; to: PlanPoint; color: string }
  /** A player (or role) placed on the map: their spot for the step. */
  | { kind: "token"; at: PlanPoint; label: string; color: string; icon?: string; guid?: string }
);

export type PlanItemKind = PlanItem["kind"];

export interface PlanStep {
  id: string;
  name: string;
  items: PlanItem[];
}

export interface MapPlanData {
  version: typeof PLAN_VERSION;
  /** The instance's world map id the plan is drawn on. */
  mapId: number;
  steps: PlanStep[];
}

/** Colours offered for strokes, shapes and text. */
export const PLAN_COLORS = ["#facc15", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#f5f5f4"] as const;

export const PLAN_LIMITS = {
  steps: 30,
  itemsPerStep: 300,
  pointsPerStroke: 400,
  textLength: 80,
  nameLength: 40,
  radius: 200,
} as const;

let idCounter = 0;
/** A short id, unique within a plan (and, with the time and randomness, across live peers). */
export function planId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${idCounter.toString(36)}`;
}

export function emptyPlan(mapId: number): MapPlanData {
  return { version: PLAN_VERSION, mapId, steps: [{ id: planId(), name: "Pull", items: [] }] };
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function readPoint(value: unknown): PlanPoint | null {
  if (!value || typeof value !== "object") return null;
  const { x, y, z } = value as Partial<PlanPoint>;
  if (!finite(x) || !finite(y)) return null;
  return z === undefined ? { x, y } : finite(z) ? { x, y, z } : null;
}

function readPoints(value: unknown, min: number): PlanPoint[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > PLAN_LIMITS.pointsPerStroke) return null;
  const points = value.map(readPoint);
  return points.every((point): point is PlanPoint => point !== null) ? points : null;
}

const readColor = (value: unknown): string | null => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null);
const readText = (value: unknown, max: number): string | null => (typeof value === "string" && value.length <= max ? value : null);
const readRadius = (value: unknown): number | null => (finite(value) && value > 0 && value <= PLAN_LIMITS.radius ? value : null);

/** One item from untrusted data (a saved plan, a live peer), or null when malformed. */
export function readPlanItem(value: unknown): PlanItem | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = readText(raw.id, 40);
  if (!id) return null;
  switch (raw.kind) {
    case "marker": {
      const at = readPoint(raw.at);
      const icon = PLAN_MARKER_ICONS.find((candidate) => candidate === raw.icon);
      return at && icon ? { id, kind: "marker", at, icon } : null;
    }
    case "arrow":
    case "pen": {
      const points = readPoints(raw.points, raw.kind === "arrow" ? 2 : 1);
      const color = readColor(raw.color);
      return points && color ? { id, kind: raw.kind, points, color } : null;
    }
    case "text": {
      const at = readPoint(raw.at);
      const text = readText(raw.text, PLAN_LIMITS.textLength);
      const color = readColor(raw.color);
      return at && text && color ? { id, kind: "text", at, text, color } : null;
    }
    case "circle": {
      const at = readPoint(raw.at);
      const radius = readRadius(raw.radius);
      const color = readColor(raw.color);
      return at && radius && color ? { id, kind: "circle", at, radius, color } : null;
    }
    case "cone": {
      const at = readPoint(raw.at);
      const radius = readRadius(raw.radius);
      const color = readColor(raw.color);
      const width = finite(raw.width) && raw.width > 0 && raw.width <= 360 ? raw.width : null;
      const facing = finite(raw.facing) ? raw.facing : null;
      return at && radius && color && width !== null && facing !== null ? { id, kind: "cone", at, radius, width, facing, color } : null;
    }
    case "rect": {
      const from = readPoint(raw.from);
      const to = readPoint(raw.to);
      const color = readColor(raw.color);
      return from && to && color ? { id, kind: "rect", from, to, color } : null;
    }
    case "token": {
      const at = readPoint(raw.at);
      const label = readText(raw.label, PLAN_LIMITS.nameLength);
      const color = readColor(raw.color);
      if (!at || label === null || !color) return null;
      const icon = typeof raw.icon === "string" && raw.icon.length <= 200 ? raw.icon : undefined;
      const guid = typeof raw.guid === "string" && raw.guid.length <= 64 ? raw.guid : undefined;
      return { id, kind: "token", at, label, color, ...(icon ? { icon } : {}), ...(guid ? { guid } : {}) };
    }
    default:
      return null;
  }
}

/** A plan from untrusted data, dropping malformed items; null when it is not a plan at all. */
export function readMapPlan(value: unknown): MapPlanData | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== PLAN_VERSION || !finite(raw.mapId) || !Array.isArray(raw.steps)) return null;
  const steps: PlanStep[] = [];
  for (const step of raw.steps.slice(0, PLAN_LIMITS.steps)) {
    if (!step || typeof step !== "object") continue;
    const { id, name, items } = step as Record<string, unknown>;
    const stepId = readText(id, 40);
    const stepName = readText(name, PLAN_LIMITS.nameLength);
    if (!stepId || stepName === null || !Array.isArray(items)) continue;
    steps.push({
      id: stepId,
      name: stepName,
      items: items.slice(0, PLAN_LIMITS.itemsPerStep).map(readPlanItem).filter((item): item is PlanItem => item !== null),
    });
  }
  if (steps.length === 0) return null;
  return { version: PLAN_VERSION, mapId: raw.mapId, steps };
}

function distanceToSegment(point: PlanPoint, from: PlanPoint, to: PlanPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length));
  return Math.hypot(point.x - (from.x + dx * t), point.y - (from.y + dy * t));
}

const distance = (left: PlanPoint, right: PlanPoint) => Math.hypot(left.x - right.x, left.y - right.y);

/** How far (yards) `point` is from the item's drawn shape: what selecting and erasing pick by. */
export function planItemDistance(item: PlanItem, point: PlanPoint): number {
  switch (item.kind) {
    case "marker":
    case "text":
    case "token":
      return distance(item.at, point);
    case "circle":
      // On the ring, or anywhere inside it.
      return Math.max(0, distance(item.at, point) - item.radius);
    case "cone": {
      const away = distance(item.at, point);
      if (away > item.radius) return away - item.radius;
      const bearing = coneBearing(item.at, point);
      const off = Math.abs(normalizeAngle(bearing - item.facing));
      return off <= (item.width * Math.PI) / 360 ? 0 : away * Math.sin(Math.min(Math.PI / 2, off - (item.width * Math.PI) / 360));
    }
    case "rect": {
      const minX = Math.min(item.from.x, item.to.x);
      const maxX = Math.max(item.from.x, item.to.x);
      const minY = Math.min(item.from.y, item.to.y);
      const maxY = Math.max(item.from.y, item.to.y);
      const dx = Math.max(minX - point.x, 0, point.x - maxX);
      const dy = Math.max(minY - point.y, 0, point.y - maxY);
      return Math.hypot(dx, dy);
    }
    case "arrow":
    case "pen": {
      if (item.points.length === 1) return distance(item.points[0], point);
      let best = Infinity;
      for (let index = 1; index < item.points.length; index++) {
        best = Math.min(best, distanceToSegment(point, item.points[index - 1], item.points[index]));
      }
      return best;
    }
  }
}

/** The topmost item within `tolerance` yards of `point` (later items draw over earlier ones), or null. */
export function planItemAt(items: readonly PlanItem[], point: PlanPoint, tolerance: number): PlanItem | null {
  for (let index = items.length - 1; index >= 0; index--) {
    if (planItemDistance(items[index], point) <= tolerance) return items[index];
  }
  return null;
}

const shift = (point: PlanPoint, dx: number, dy: number): PlanPoint => ({ ...point, x: point.x + dx, y: point.y + dy });

/** The item moved by (dx, dy) yards. */
export function movePlanItem(item: PlanItem, dx: number, dy: number): PlanItem {
  switch (item.kind) {
    case "arrow":
    case "pen":
      return { ...item, points: item.points.map((point) => shift(point, dx, dy)) };
    case "rect":
      return { ...item, from: shift(item.from, dx, dy), to: shift(item.to, dx, dy) };
    default:
      return { ...item, at: shift(item.at, dx, dy) };
  }
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * WoW facing (radians, counter-clockwise from world +x, which the map draws
 * as up) from `from` toward `to`, as cones store it.
 */
export function coneBearing(from: PlanPoint, to: PlanPoint): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/** Distance in yards between two plan points (the measure tool). */
export function planDistance(from: PlanPoint, to: PlanPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/** A drawing tool's pointer handlers on the 3D map; points are null off the dungeon floor. */
export interface PlanInput {
  down(point: PlanPoint | null, event: PointerEvent): void;
  /** `pressed` while the left button that started a stroke is still down. */
  move(point: PlanPoint | null, event: PointerEvent, pressed: boolean): void;
  up(point: PlanPoint | null, event: PointerEvent): void;
}

/** Strokes keep a point only once the pointer has moved this far (yards). */
export const STROKE_SPACING = 0.6;
