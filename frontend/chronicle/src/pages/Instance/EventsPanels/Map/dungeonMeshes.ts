import {
  mapAssetUrl,
  mapFloorMesh,
  type WowMapFloorBounds,
  type WowMapInstance,
  type WowMapInstanceFloor,
  type WowMapMeshInstance,
  type WowMapMeshLiquid,
} from "@/pages/Technical/mapGallery";

/**
 * Real dungeon meshes for the 3D Replay Map: a glTF rendered from the game's
 * WMO, used as the ground instead of the flat map tiles. The map manifest
 * announces one per instance (`instances[].mesh`, published beside the tiles
 * under `<iconBaseUrl>/maps/3d/`) together with the world bounds that
 * place it, so no artwork or rendered layer is needed. Dev, Storybook and
 * production all read the icon CDN; the GLBs carry Blizzard textures and
 * never ship in the repo.
 */

/**
 * The one glTF axis convention the scene places: Y-up with X mirrored,
 * `(x, y, z) = (-wow_x, wow_z, wow_y)`. Checked against the Kresh log: his
 * pool's water plane sits under his position in this frame, and the player
 * left at the entrance has floor beneath him; the mirror-free alternative
 * `(wow_x, wow_z, -wow_y)` puts both off the mesh.
 */
export const DUNGEON_MESH_FRAME = "wow-yup-mirrored-x";

/** The manifest's mesh entry when the scene can place it, else null. */
export function placeableDungeonMesh(mesh: WowMapMeshInstance | undefined): WowMapMeshInstance | null {
  if (!mesh || !mesh.path || mesh.frame !== DUNGEON_MESH_FRAME) return null;
  const { bounds } = mesh;
  if (!(bounds.maxX > bounds.minX) || !(bounds.maxY > bounds.minY)) return null;
  return mesh;
}

/**
 * The selected floor's mesh (or the legacy instance mesh), when placeable.
 * Callers must separately register UI-map-normalized telemetry through the
 * native floor bounds before placing it on this mesh.
 */
export function replayDungeonMesh(
  instance: WowMapInstance,
  floor: WowMapInstanceFloor | undefined,
): WowMapMeshInstance | null {
  return placeableDungeonMesh(mapFloorMesh(instance, floor));
}

/**
 * A mesh-only instance has no map artwork (vanilla Ragefire Chasm has no
 * in-game dungeon map), only a placeable mesh: the Replay Map has nothing but
 * the "3D map" to show and the 2D views have no tiles to draw.
 */
export function isMeshOnlyInstance(instance: WowMapInstance): boolean {
  return instance.floors.length === 0 && !instance.renders && !instance.styled && placeableDungeonMesh(instance.mesh) !== null;
}

const LIQUID_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * The entry's liquid tint when it is well-formed (a `#rrggbb` colour and an
 * opacity in (0, 1]), else null: the GLB's own translucent water then shows,
 * as it does for an entry without `liquid`.
 */
export function dungeonMeshLiquid(mesh: WowMapMeshInstance): WowMapMeshLiquid | null {
  const liquid = mesh.liquid;
  if (!liquid || typeof liquid.color !== "string" || !LIQUID_COLOR.test(liquid.color)) return null;
  if (typeof liquid.opacity !== "number" || !(liquid.opacity > 0) || liquid.opacity > 1) return null;
  return liquid;
}

/** The URL of a mesh entry: its manifest path under the icon CDN. */
export function dungeonMeshUrl(mesh: WowMapMeshInstance, iconBaseUrl: string): string {
  return mapAssetUrl(iconBaseUrl, mesh.path);
}

// Mesh files are large (tens of MB); their bytes are fetched once, as early
// as the map knows which mesh it wants, and handed to the scene's parser.
const meshBytes = new Map<string, Promise<ArrayBuffer>>();
const MAX_MESH_BYTES = 2;

/**
 * The mesh file's bytes, fetched (once, with CORS) on first call: the map
 * calls this to prefetch while the encounter still processes and the 3D
 * renderer still loads, and the scene awaits the same promise to parse.
 */
export function dungeonMeshBytes(url: string): Promise<ArrayBuffer> {
  let bytes = meshBytes.get(url);
  if (!bytes) {
    bytes = fetch(url, { mode: "cors" }).then((response) => {
      if (!response.ok) throw new Error(`Dungeon mesh ${response.status}: ${url}`);
      return response.arrayBuffer();
    });
    bytes.catch(() => meshBytes.delete(url));
    meshBytes.set(url, bytes);
    for (const oldest of meshBytes.keys()) {
      if (meshBytes.size <= MAX_MESH_BYTES) break;
      meshBytes.delete(oldest);
    }
  }
  return bytes;
}

/** Drops a mesh's bytes once they are parsed (the scene keeps the parsed mesh). */
export function releaseDungeonMeshBytes(url: string) {
  meshBytes.delete(url);
}

/**
 * How a mesh in raw WoW coordinates (`DUNGEON_MESH_FRAME`) lands in the
 * scene. `bounds` are the mesh entry's world-axis bounds, which also form the
 * ground the units project onto with `renderedDungeonMapPoint`: world Y spans
 * the ground's `width` and world X its depth, both descending from the
 * top-left. That composition is linear: world Y runs along -x and world X
 * along -z at one uniform scale, so the mesh needs a quarter turn about Y,
 * that scale, and the translation that puts the bounds' centre at the
 * origin. Scene y stays `scale * wow_z`.
 */
export interface DungeonMeshPlacement {
  /** Scene units per yard. */
  scale: number;
  rotationY: number;
  x: number;
  z: number;
}

export function dungeonMeshPlacement(bounds: WowMapFloorBounds, width: number): DungeonMeshPlacement {
  const scale = width / (bounds.maxY - bounds.minY);
  return {
    scale,
    rotationY: -Math.PI / 2,
    x: scale * ((bounds.maxY + bounds.minY) / 2),
    z: scale * ((bounds.maxX + bounds.minX) / 2),
  };
}

export interface GroundPoint {
  x: number;
  z: number;
}

/**
 * Pulls `point` back to within `radius` of `centre` (on the ground plane),
 * returning `point` itself when it is already inside.
 */
export function clampToRadius<T extends GroundPoint>(point: T, centre: GroundPoint, radius: number): T | GroundPoint {
  const dx = point.x - centre.x;
  const dz = point.z - centre.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= radius) return point;
  const factor = radius / distance;
  return { x: centre.x + dx * factor, z: centre.z + dz * factor };
}

/** A logged-height probe starts this far (yards) above the unit's feet. */
export const LOGGED_Z_CLEARANCE_YARDS = 2.5;

/**
 * A unit logged more than this far (yards) above the floor under it is in the
 * air (knocked up, falling, flying) and is drawn at its logged height; closer
 * than that it stands on the floor, so small log/mesh mismatches never float it.
 */
export const AIRBORNE_YARDS = 2;

/**
 * The floor under a point, from `cast` (the highest surface below a start
 * height, null for a miss). With a logged height (`ceiling`, the probe start
 * just above the unit's feet) it is the first surface below it, so a unit
 * under a canopy, a roof or a bridge stands on the ground it was logged on.
 * A miss there, or no logged height, falls back to the highest surface below
 * `top`.
 */
export function floorBelow(
  cast: (fromY: number) => number | null,
  top: number,
  ceiling: number | undefined,
): number | null {
  if (ceiling !== undefined) {
    const hit = cast(ceiling);
    if (hit !== null) return hit;
  }
  return cast(top);
}

/** The median of the defined heights, or undefined when there are none. */
export function medianHeight(heights: Iterable<number | undefined>): number | undefined {
  const values: number[] = [];
  for (const height of heights) if (height !== undefined) values.push(height);
  if (values.length === 0) return undefined;
  values.sort((a, b) => a - b);
  const middle = values.length >> 1;
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

interface FloorHeightEntry {
  x: number;
  z: number;
  ceiling: number | undefined;
  y: number;
}

/**
 * Floor heights under the units, from a downward probe (`sample`, null for no
 * hit) that is only re-run when a unit's ground position or probe start
 * (`ceiling`, from its logged height) changes. Where there is no floor the
 * unit keeps its last height, or 0 if it never had one.
 */
export class FloorHeightCache {
  private readonly entries = new Map<string, FloorHeightEntry>();
  private readonly sample: (x: number, z: number, ceiling: number | undefined) => number | null;

  constructor(sample: (x: number, z: number, ceiling: number | undefined) => number | null) {
    this.sample = sample;
  }

  heightAt(key: string, x: number, z: number, ceiling?: number): number {
    const entry = this.entries.get(key);
    if (entry && entry.x === x && entry.z === z && entry.ceiling === ceiling) return entry.y;
    const y = this.sample(x, z, ceiling) ?? entry?.y ?? 0;
    if (entry) {
      entry.x = x;
      entry.z = z;
      entry.ceiling = ceiling;
      entry.y = y;
    } else {
      this.entries.set(key, { x, z, ceiling, y });
    }
    return y;
  }

  delete(key: string) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}
