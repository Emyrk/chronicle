import type { WowMapFloorBounds } from "@/pages/Technical/mapGallery";

/**
 * Real dungeon meshes for the 3D Replay Map: a glTF rendered from the game's
 * WMO, used as the ground instead of the flat map tiles. Served from the icon
 * CDN next to the tiles (`<iconBaseUrl>/maps/meshes/<mapId>.glb`) or, with
 * `VITE_DUNGEON_MESH_BASE`, from a local directory (`.env.development` points
 * `pnpm dev` and Storybook at `public/dungeon-meshes`, which is gitignored:
 * the files carry Blizzard textures and never ship in the repo).
 */

/** Map ids with a mesh, and the file that holds it. */
export const DUNGEON_MESH_FILES: ReadonlyMap<number, string> = new Map([
  // Wailing Caverns
  [43, "43.glb"],
]);

export function hasDungeonMesh(mapId: number): boolean {
  return DUNGEON_MESH_FILES.has(mapId);
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** The mesh URL for `mapId`, or null when it has none. */
export function dungeonMeshUrl(
  mapId: number,
  iconBaseUrl: string,
  base: string | undefined = import.meta.env.VITE_DUNGEON_MESH_BASE as string | undefined,
): string | null {
  const file = DUNGEON_MESH_FILES.get(mapId);
  if (!file) return null;
  const directory = base ? stripTrailingSlash(base) : `${stripTrailingSlash(iconBaseUrl)}/maps/meshes`;
  return `${directory}/${file}`;
}

/**
 * The icon CDN's response to a request without Origin has no CORS headers and
 * no `Vary: Origin`, and the 2D view loads the same tiles as plain <img>s. The
 * browser would reuse that cached response for a texture's CORS request, which
 * fails. A distinct query string gives cross-origin textures their own cache
 * entry; a same-origin or relative URL needs no CORS and is left alone.
 */
export function corsAssetUrl(url: string, origin: string | undefined = globalThis.location?.origin): string {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  if (origin && (url === origin || url.startsWith(`${origin}/`))) return url;
  return `${url}${url.includes("?") ? "&" : "?"}cors`;
}

/**
 * How a mesh in raw WoW coordinates lands in the scene. The meshes are glTF
 * Y-up with `(x, y, z) = (-wow_x, wow_z, wow_y)` (checked against the Kresh
 * log: his pool's water plane sits under his position in this frame, and the
 * player left at the entrance has floor beneath him; the mirror-free
 * alternative `(wow_x, wow_z, -wow_y)` puts both off the mesh). The ground is
 * the floor's artwork `width` wide with `dungeonMapPoint` + `mapPointToScene`
 * placing world points on it. That composition is linear: world Y runs along
 * -x and world X along -z, both at `width / (bounds.maxX - bounds.minX)` scene
 * units per yard, so the mesh needs a quarter turn about Y, that uniform
 * scale, and the translation that puts the bounds' centre at the origin.
 * Scene y stays `scale * wow_z`.
 */
export interface DungeonMeshPlacement {
  /** Scene units per yard. */
  scale: number;
  rotationY: number;
  x: number;
  z: number;
}

export function dungeonMeshPlacement(bounds: WowMapFloorBounds, width: number): DungeonMeshPlacement {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const scale = width / spanX;
  return {
    scale,
    rotationY: -Math.PI / 2,
    x: scale * (bounds.maxX - spanX / 2),
    z: scale * (bounds.maxY - spanY / 2),
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

interface FloorHeightEntry {
  x: number;
  z: number;
  y: number;
}

/**
 * Floor heights under the units, from a downward probe (`sample`, null for no
 * hit) that is only re-run when a unit's ground position changes. Where there
 * is no floor the unit keeps its last height, or 0 if it never had one.
 */
export class FloorHeightCache {
  private readonly entries = new Map<string, FloorHeightEntry>();
  private readonly sample: (x: number, z: number) => number | null;

  constructor(sample: (x: number, z: number) => number | null) {
    this.sample = sample;
  }

  heightAt(key: string, x: number, z: number): number {
    const entry = this.entries.get(key);
    if (entry && entry.x === x && entry.z === z) return entry.y;
    const y = this.sample(x, z) ?? entry?.y ?? 0;
    if (entry) {
      entry.x = x;
      entry.z = z;
      entry.y = y;
    } else {
      this.entries.set(key, { x, z, y });
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
