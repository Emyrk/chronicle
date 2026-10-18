import * as THREE from "three";
import type { UnitTokenTextures } from "../unitTokens";
import type { PlanItem, PlanPoint } from "./mapPlan";
import { drawPlanMarker, MARKER_COLORS, PLAN_ART_SIZE } from "./planArt";

/**
 * Draws a plan's items on the 3D map: strokes, arrows and shapes draped over
 * the dungeon floor (true size, in yards), and markers, text and player
 * tokens standing on it (sized like the map's unit tokens). Owned by
 * MapScene3D, which supplies the floor and the world <-> scene transform.
 */

/** Where the plan is drawn: the scene's world transform and floor. */
export interface PlanSurface {
  /** A plan point's scene x/z. */
  toScene(point: PlanPoint): { x: number; z: number };
  /** The floor's scene height under (x, z), the floor nearest below `hintY` (scene) when given. */
  floorAt(x: number, z: number, hintY: number | undefined): number;
  /** Scene units per yard. */
  scale: number;
}

// Sizes in yards.
const LIFT = 0.12;
const PEN_WIDTH = 0.45;
const ARROW_WIDTH = 0.7;
const ARROW_HEAD = 2.2;
const OUTLINE_WIDTH = 0.35;
const SAMPLE_SPACING = 0.6;
const FILL_OPACITY = 0.16;
const MARKER_RING_YARDS = 1.3;
const TEXT_LIFT_YARDS = 1.2;
// Sizes in token geometry units (scaled by the scene's unit scale, like unit tokens).
const MARKER_SIZE = 3.2;
const MARKER_HEIGHT = 0.6;
const TOKEN_RADIUS = 1.25;
const TOKEN_LABEL_HEIGHT = 2.4;
/** Labels keep one size on screen (their height, in view heights), as the map's presence names. */
const LABEL_HEIGHT = 0.026;

interface Built {
  item: PlanItem;
  selected: boolean;
  object: THREE.Object3D;
  /** Parts sized by the unit scale: [object, base size, height above the floor in token units]. */
  scaled: { object: THREE.Object3D; size: number; lift: number; floor: number }[];
}

export class PlanLayer {
  readonly group = new THREE.Group();
  private readonly built = new Map<string, Built>();
  private surface: PlanSurface | null = null;
  private unitScale = 1;
  private readonly markerTextures = new Map<string, THREE.CanvasTexture>();
  private readonly flatDisc = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  private readonly tokenTextures: UnitTokenTextures;

  constructor(tokenTextures: UnitTokenTextures) {
    this.tokenTextures = tokenTextures;
    this.group.renderOrder = 4;
  }

  /** The items to draw (the current step's, plus any being drawn), on `surface` (null: draw nothing). */
  setItems(items: readonly PlanItem[], selectedId: string | null, surface: PlanSurface | null) {
    if (surface !== this.surface) {
      this.clear();
      this.surface = surface;
    }
    if (!surface) return;
    const seen = new Set<string>();
    for (const item of items) {
      seen.add(item.id);
      const selected = item.id === selectedId;
      const current = this.built.get(item.id);
      if (current && current.item === item && current.selected === selected) continue;
      if (current) this.remove(item.id);
      const built = this.build(item, selected, surface);
      this.built.set(item.id, built);
      this.group.add(built.object);
      this.applyScale(built);
    }
    for (const id of [...this.built.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  /** Markers, tokens and labels follow the map's unit scale (so they stay visible zoomed out). */
  setUnitScale(scale: number) {
    if (scale === this.unitScale) return;
    this.unitScale = scale;
    for (const built of this.built.values()) this.applyScale(built);
  }

  dispose() {
    this.clear();
    for (const texture of this.markerTextures.values()) texture.dispose();
    this.markerTextures.clear();
    this.flatDisc.dispose();
  }

  private applyScale(built: Built) {
    for (const part of built.scaled) {
      part.object.scale.setScalar(part.size * this.unitScale);
      if (part.object instanceof THREE.Sprite && part.object.material.sizeAttenuation === false) {
        part.object.scale.set(part.object.userData.aspect * LABEL_HEIGHT, LABEL_HEIGHT, 1);
      }
      part.object.position.y = part.floor + part.lift * this.unitScale;
    }
  }

  private clear() {
    for (const id of [...this.built.keys()]) this.remove(id);
  }

  private remove(id: string) {
    const built = this.built.get(id);
    if (!built) return;
    this.group.remove(built.object);
    built.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry && mesh.geometry !== this.flatDisc) mesh.geometry.dispose();
      const material = (mesh as THREE.Mesh).material as THREE.Material | undefined;
      if (material) {
        const map = (material as THREE.SpriteMaterial).map;
        // Marker and token textures are shared; label textures are the item's own.
        if (map && child.userData.ownTexture) map.dispose();
        material.dispose();
      }
    });
    this.built.delete(id);
  }

  private markerTexture(icon: string): THREE.CanvasTexture {
    let texture = this.markerTextures.get(icon);
    if (!texture) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = PLAN_ART_SIZE;
      drawPlanMarker(canvas.getContext("2d")!, icon as Parameters<typeof drawPlanMarker>[1]);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.markerTextures.set(icon, texture);
    }
    return texture;
  }

  private build(item: PlanItem, selected: boolean, surface: PlanSurface): Built {
    const object = new THREE.Group();
    const scaled: Built["scaled"] = [];
    const yards = surface.scale;
    const color = selected ? "#ffffff" : "color" in item ? item.color : MARKER_COLORS[item.kind === "marker" ? item.icon : "skull"];
    const ground = (point: PlanPoint) => {
      const { x, z } = surface.toScene(point);
      return new THREE.Vector3(x, surface.floorAt(x, z, point.z === undefined ? undefined : point.z * yards), z);
    };
    const ribbon = (points: THREE.Vector3[], width: number, closed = false, tint = color) => {
      const mesh = drapedRibbon(points, width * yards, LIFT * yards, surface, closed, tint);
      if (mesh) object.add(mesh);
    };
    const fill = (outline: THREE.Vector3[], centre: THREE.Vector3, tint = color) => {
      object.add(drapedFan(centre, outline, LIFT * yards * 0.5, surface, tint));
    };
    switch (item.kind) {
      case "pen":
        ribbon(item.points.map(ground), PEN_WIDTH);
        break;
      case "arrow": {
        const points = item.points.map(ground);
        ribbon(points, ARROW_WIDTH);
        const head = arrowHead(points, ARROW_HEAD * yards, LIFT * yards, surface, color);
        if (head) object.add(head);
        break;
      }
      case "circle": {
        const centre = ground(item.at);
        const ring = circlePoints(centre, item.radius * yards, 64);
        ribbon(ring, OUTLINE_WIDTH, true);
        fill(ring, centre);
        break;
      }
      case "cone": {
        const centre = ground(item.at);
        const outline = conePoints(centre, item.radius * yards, item.facing, (item.width * Math.PI) / 180);
        ribbon([centre, ...outline, centre], OUTLINE_WIDTH);
        fill(outline, centre);
        break;
      }
      case "rect": {
        const from = surface.toScene(item.from);
        const to = surface.toScene(item.to);
        const hint = item.from.z === undefined ? undefined : item.from.z * yards;
        const corners = [[from.x, from.z], [to.x, from.z], [to.x, to.z], [from.x, to.z]].map(([x, z]) => new THREE.Vector3(x, surface.floorAt(x, z, hint), z));
        ribbon(corners, OUTLINE_WIDTH, true);
        const centre = new THREE.Vector3((from.x + to.x) / 2, 0, (from.z + to.z) / 2);
        centre.y = surface.floorAt(centre.x, centre.z, hint);
        fill(densify(corners, SAMPLE_SPACING * yards * 4, true), centre);
        break;
      }
      case "marker": {
        const at = ground(item.at);
        ribbon(circlePoints(at, MARKER_RING_YARDS * yards, 32), OUTLINE_WIDTH * 0.8, true, MARKER_COLORS[item.icon]);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTexture(item.icon), transparent: true, depthWrite: false }));
        sprite.center.set(0.5, 0);
        sprite.position.set(at.x, at.y, at.z);
        sprite.renderOrder = 6;
        object.add(sprite);
        scaled.push({ object: sprite, size: MARKER_SIZE, lift: MARKER_HEIGHT, floor: at.y });
        break;
      }
      case "text": {
        const at = ground(item.at);
        const label = labelSprite(item.text, item.color);
        label.position.set(at.x, at.y + TEXT_LIFT_YARDS * yards, at.z);
        object.add(label);
        scaled.push({ object: label, size: 1, lift: 0, floor: at.y + TEXT_LIFT_YARDS * yards });
        break;
      }
      case "token": {
        const at = ground(item.at);
        const disc = new THREE.Mesh(this.flatDisc, new THREE.MeshBasicMaterial({
          map: this.tokenTextures.disc(item.icon ?? null, item.color, false, null),
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
        }));
        disc.position.set(at.x, at.y, at.z);
        object.add(disc);
        scaled.push({ object: disc, size: TOKEN_RADIUS, lift: 0.45, floor: at.y });
        if (item.label) {
          const label = labelSprite(item.label, item.color);
          label.position.set(at.x, at.y, at.z);
          object.add(label);
          scaled.push({ object: label, size: 1, lift: TOKEN_LABEL_HEIGHT, floor: at.y });
        }
        break;
      }
    }
    if (selected) {
      // A dashed white ring round the item's anchor marks the selection.
      const anchor = item.kind === "arrow" || item.kind === "pen" ? item.points[0] : item.kind === "rect" ? item.from : item.at;
      const at = ground(anchor);
      object.add(drapedRibbon(dashed(circlePoints(at, 1.8 * yards, 48)), OUTLINE_WIDTH * 0.9 * yards, LIFT * yards * 1.5, surface, false, "#ffffff", true)!);
    }
    return { item, selected, object, scaled };
  }
}

// Points round a circle on the ground (heights draped later).
function circlePoints(centre: THREE.Vector3, radius: number, segments: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(centre.x + Math.cos(angle) * radius, centre.y, centre.z + Math.sin(angle) * radius));
  }
  return points;
}

// A cone's arc from `facing` - width/2 to + width/2 (WoW facing: rotating
// scene -z by the angle about y, as unit tokens turn).
function conePoints(centre: THREE.Vector3, radius: number, facing: number, width: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const segments = Math.max(4, Math.ceil((width / (Math.PI * 2)) * 64));
  for (let index = 0; index <= segments; index++) {
    const angle = facing - width / 2 + (index / segments) * width;
    points.push(new THREE.Vector3(centre.x - Math.sin(angle) * radius, centre.y, centre.z - Math.cos(angle) * radius));
  }
  return points;
}

// Adds points so no segment is longer than `spacing` (so draping follows the floor).
function densify(points: THREE.Vector3[], spacing: number, closed = false): THREE.Vector3[] {
  if (points.length < 2) return points;
  const out: THREE.Vector3[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index++) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const steps = Math.max(1, Math.ceil(from.distanceTo(to) / spacing));
    for (let step = 0; step < steps; step++) out.push(from.clone().lerp(to, step / steps));
  }
  if (!closed) out.push(points[points.length - 1].clone());
  return out;
}

// Every other run of a closed loop's points, as one open polyline per run joined by NaN breaks.
function dashed(points: THREE.Vector3[]): THREE.Vector3[][] {
  const runs: THREE.Vector3[][] = [];
  for (let index = 0; index < points.length; index += 4) runs.push([points[index], points[(index + 1) % points.length], points[(index + 2) % points.length]]);
  return runs;
}

function material(color: string, opacity = 0.95): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
}

/**
 * A flat ribbon `width` wide along `paths` (one polyline, or several for a
 * dashed loop), each sample draped onto the floor and lifted by `lift`.
 */
function drapedRibbon(
  paths: THREE.Vector3[] | THREE.Vector3[][],
  width: number,
  lift: number,
  surface: PlanSurface,
  closed: boolean,
  color: string,
  alreadySplit = false,
): THREE.Mesh | null {
  const lines = alreadySplit ? (paths as THREE.Vector3[][]) : [paths as THREE.Vector3[]];
  const positions: number[] = [];
  const indices: number[] = [];
  for (const line of lines) {
    const samples = densify(line, SAMPLE_SPACING * surface.scale, closed && !alreadySplit);
    if (closed && !alreadySplit && samples.length > 0) samples.push(samples[0].clone());
    if (samples.length < 2) continue;
    for (const sample of samples) sample.y = surface.floorAt(sample.x, sample.z, sample.y + 2 * surface.scale);
    const base = positions.length / 3;
    for (let index = 0; index < samples.length; index++) {
      const previous = samples[Math.max(0, index - 1)];
      const next = samples[Math.min(samples.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      const nx = (-dz / length) * (width / 2);
      const nz = (dx / length) * (width / 2);
      const sample = samples[index];
      positions.push(sample.x + nx, sample.y + lift, sample.z + nz, sample.x - nx, sample.y + lift, sample.z - nz);
      if (index > 0) {
        const a = base + (index - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  if (indices.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.renderOrder = 5;
  return mesh;
}

// A translucent fill from `centre` out to `outline`, draped in rings.
function drapedFan(centre: THREE.Vector3, outline: THREE.Vector3[], lift: number, surface: PlanSurface, color: string): THREE.Mesh {
  const rings = 4;
  const positions: number[] = [centre.x, centre.y + lift, centre.z];
  const indices: number[] = [];
  const hint = centre.y + 2 * surface.scale;
  for (let ring = 1; ring <= rings; ring++) {
    for (const point of outline) {
      const t = ring / rings;
      const x = centre.x + (point.x - centre.x) * t;
      const z = centre.z + (point.z - centre.z) * t;
      positions.push(x, surface.floorAt(x, z, hint) + lift, z);
    }
  }
  const count = outline.length;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    indices.push(0, 1 + index, 1 + next);
    for (let ring = 1; ring < rings; ring++) {
      const inner = 1 + (ring - 1) * count;
      const outer = 1 + ring * count;
      indices.push(inner + index, outer + index, outer + next, inner + index, outer + next, inner + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material(color, FILL_OPACITY));
  mesh.renderOrder = 4;
  return mesh;
}

function arrowHead(points: THREE.Vector3[], size: number, lift: number, surface: PlanSurface, color: string): THREE.Mesh | null {
  if (points.length < 2) return null;
  const tip = points[points.length - 1];
  let from = points[points.length - 2];
  for (let index = points.length - 2; index >= 0 && from.distanceTo(tip) < size * 0.5; index--) from = points[index];
  const dx = tip.x - from.x;
  const dz = tip.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length === 0) return null;
  const ux = dx / length;
  const uz = dz / length;
  const corner = (along: number, side: number) => {
    const x = tip.x - ux * along - uz * side;
    const z = tip.z - uz * along + ux * side;
    return [x, surface.floorAt(x, z, tip.y + 2 * surface.scale) + lift * 1.5, z];
  };
  const tipY = surface.floorAt(tip.x, tip.z, tip.y + 2 * surface.scale) + lift * 1.5;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([tip.x + ux * size * 0.2, tipY, tip.z + uz * size * 0.2, ...corner(size, size * 0.55), ...corner(size, -size * 0.55)], 3));
  geometry.setIndex([0, 1, 2]);
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.renderOrder = 5;
  return mesh;
}

// A text label that keeps its size on screen.
function labelSprite(text: string, color: string): THREE.Sprite {
  const scale = 2;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const font = `600 ${12 * scale}px ui-sans-serif, system-ui, sans-serif`;
  context.font = font;
  const padding = 6 * scale;
  canvas.width = Math.ceil(context.measureText(text).width + padding * 2);
  canvas.height = 20 * scale;
  context.font = font;
  context.fillStyle = "rgba(0, 0, 0, 0.78)";
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, 4 * scale);
  context.fill();
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, padding, canvas.height / 2 + scale);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false }));
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 10;
  sprite.userData.aspect = canvas.width / canvas.height;
  sprite.userData.ownTexture = true;
  return sprite;
}
