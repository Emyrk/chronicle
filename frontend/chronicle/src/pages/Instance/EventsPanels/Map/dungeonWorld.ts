/**
 * The read-only view of the dungeon for MapScene3D (chronicle-1970): the
 * loaded mesh and its BVHs, floor casting and sampling, the mesh hit test the
 * camera's collision and the Director's sight lines use, the yard scale, and
 * the floor-height caches. The scene sets `dungeonMesh` and `flatYards`;
 * everything else asks the world rather than raycasting the mesh itself.
 * Methods moved verbatim out of MapScene3D.ts.
 */
import * as THREE from "three";
import type { WowMapFloorBounds } from "@/pages/Technical/mapGallery";
import { floorBelow, FloorHeightCache } from "./dungeonMeshes";
import type { DungeonMeshRequest } from "./MapScene3D";
import type { MapPoint } from "./mapModel";
import { GROUND_WIDTH } from "./sceneConstants";
import { parsedDungeonMesh, type DungeonMeshCave } from "./sceneLoaders";

// Floor probes span these scene heights, outside any published dungeon mesh.
const FLOOR_PROBE_HEIGHT = 100;
// A face steeper than this is a wall, not a floor a unit without a logged height can stand on.
const FLOOR_MAX_SLOPE_DEG = 50;
const FLOOR_MIN_UP = Math.cos((FLOOR_MAX_SLOPE_DEG * Math.PI) / 180);

export interface DungeonMesh {
  url: string;
  /** The entry's world bounds: the plan layer's world <-> scene transform. */
  bounds: WowMapFloorBounds;
  group: THREE.Group;
  /** The walkable geometry (everything but the water planes). */
  caves: DungeonMeshCave[];
  /** Water (and other liquid) planes: units stand on them, but they never block the camera. */
  liquids: DungeonMeshCave[];
  /** Scene units per yard. */
  scale: number;
  /** Bounding-sphere radius, for the full-map zoom limit. */
  radius: number;
}

export class DungeonWorld {
  // The real dungeon mesh while "3D map" is on (MapScene3D.setDungeonMesh sets it).
  dungeonMesh: DungeonMesh | null = null;
  // On the flat artwork: the map-percent step of one yard along world x and
  // world y (setFlatYards), for walking there.
  flatYards: { x: MapPoint; y: MapPoint } | null = null;
  readonly floorHeights = new FloorHeightCache((x, z, ceiling) => this.sampleFloor(x, z, ceiling));
  readonly unitFloorHeights = new FloorHeightCache((x, z, ceiling) => this.sampleFloor(x, z, ceiling));
  private readonly floorRay = new THREE.Ray();
  // Probe scratch, owned here. The probes used to share the scene's `vector`
  // (the effect layer's); the other three keep the names they had there.
  private readonly vector = new THREE.Vector3();
  private readonly directorFrom = new THREE.Vector3();
  private readonly directorTo = new THREE.Vector3();
  private readonly collisionPoint = new THREE.Vector3();

  // The cave floor below (x, z) in scene units: the first surface below
  // `ceiling` when given and hit, else the highest; null when every probe
  // misses the mesh (or the tiles show).
  sampleFloor(x: number, z: number, ceiling: number | undefined): number | null {
    return floorBelow((fromY) => this.castFloor(x, z, fromY), FLOOR_PROBE_HEIGHT, ceiling);
  }

  // The highest cave or water surface below (x, fromY, z), or null for none:
  // a unit swimming near the surface stands on the water, not the lake bed.
  castFloor(x: number, z: number, fromY: number): number | null {
    const mesh = this.dungeonMesh;
    // The flat artwork is the floor everywhere.
    if (!mesh) return 0;
    let best: number | null = null;
    for (const cave of mesh.caves) best = this.highestHit(cave, x, z, fromY, THREE.FrontSide, best);
    // Liquid planes may be wound either way up.
    for (const liquid of mesh.liquids) best = this.highestHit(liquid, x, z, fromY, THREE.DoubleSide, best);
    return best;
  }

  // Every walkable surface under (x, z) in scene units, highest first: the
  // cave faces a downward probe meets (walls, steeper than FLOOR_MAX_SLOPE_DEG,
  // left out) and the water planes.
  floorCandidates(x: number, z: number): number[] {
    const mesh = this.dungeonMesh;
    if (!mesh) return [];
    const floors: number[] = [];
    for (const cave of mesh.caves) this.collectFloors(cave, x, z, THREE.FrontSide, floors);
    for (const liquid of mesh.liquids) this.collectFloors(liquid, x, z, THREE.DoubleSide, floors);
    return floors.sort((a, b) => b - a);
  }

  // Adds to `floors` every walkable surface a downward probe through (x, z) hits on `cave`.
  private collectFloors(cave: DungeonMeshCave, x: number, z: number, side: THREE.Side, floors: number[]) {
    this.floorRay.origin.set(x, FLOOR_PROBE_HEIGHT, z);
    this.floorRay.direction.set(0, -1, 0);
    this.floorRay.applyMatrix4(cave.inverse);
    for (const hit of cave.bvh.raycast(this.floorRay, side)) {
      if (!hit.face || Math.abs(this.vector.copy(hit.face.normal).transformDirection(cave.mesh.matrixWorld).y) < FLOOR_MIN_UP) continue;
      floors.push(this.vector.copy(hit.point).applyMatrix4(cave.mesh.matrixWorld).y);
    }
  }

  // The higher of `best` and the surface a downward probe from (x, fromY, z) hits on `cave`.
  private highestHit(cave: DungeonMeshCave, x: number, z: number, fromY: number, side: THREE.Side, best: number | null): number | null {
    this.floorRay.origin.set(x, fromY, z);
    this.floorRay.direction.set(0, -1, 0);
    this.floorRay.applyMatrix4(cave.inverse);
    const hit = cave.bvh.raycastFirst(this.floorRay, side);
    if (!hit) return best;
    const y = this.vector.copy(hit.point).applyMatrix4(cave.mesh.matrixWorld).y;
    return best === null || y > best ? y : best;
  }

  // Loads the mesh, zeroes its centring node translations so it sits in raw
  // WoW coordinates, places it under the artwork projection and builds a BVH
  // per cave mesh for floor probes. Resolves null on any failure.
  // The parsed mesh is shared (see parsedDungeonMesh); this scene draws its own
  // copy of the node tree, which shares the parsed geometry and materials.
  async loadDungeonMesh(request: DungeonMeshRequest): Promise<DungeonMesh | null> {
    const parsed = await parsedDungeonMesh(request);
    if (!parsed) return null;
    return { url: request.url, bounds: request.bounds, group: parsed.template.clone(), caves: parsed.caves, liquids: parsed.liquids, scale: parsed.scale, radius: parsed.radius };
  }

  // Whether the cave stands between the two points (the camera's line to the fight).
  meshBlocks(from: THREE.Vector3, to: THREE.Vector3): boolean {
    return this.meshHitDistance(from, to) !== null;
  }

  // How far (scene units) from `from` toward `to` the first cave surface is,
  // or null when the segment is clear. Walls count from either side.
  meshHitDistance(from: THREE.Vector3, to: THREE.Vector3): number | null {
    const mesh = this.dungeonMesh;
    if (!mesh) return null;
    let nearest: number | null = null;
    for (const cave of mesh.caves) {
      const origin = this.directorFrom.copy(from).applyMatrix4(cave.inverse);
      const end = this.directorTo.copy(to).applyMatrix4(cave.inverse);
      const length = origin.distanceTo(end);
      if (length <= 1e-6) continue;
      this.floorRay.origin.copy(origin);
      this.floorRay.direction.copy(end).sub(origin).divideScalar(length);
      const hit = cave.bvh.raycastFirst(this.floorRay, THREE.DoubleSide);
      if (!hit || hit.distance >= length) continue;
      const distance = from.distanceTo(this.collisionPoint.copy(hit.point).applyMatrix4(cave.mesh.matrixWorld));
      if (nearest === null || distance < nearest) nearest = distance;
    }
    return nearest;
  }

  // Scene units per yard: the mesh's, else the flat artwork's.
  yardScale(aspect: number): number | null {
    if (this.dungeonMesh) return this.dungeonMesh.scale;
    const perYard = this.flatYards;
    if (!perYard) return null;
    const length = (step: MapPoint) => Math.hypot((step.leftPercent / 100) * GROUND_WIDTH, (step.topPercent / 100) * GROUND_WIDTH * aspect);
    const scale = (length(perYard.x) + length(perYard.y)) / 2;
    return Number.isFinite(scale) && scale > 0 ? scale : null;
  }

  // The first hit of `raycaster` on the drawn mesh (picking a floor point), or undefined.
  intersectMesh(raycaster: THREE.Raycaster): THREE.Intersection | undefined {
    const mesh = this.dungeonMesh;
    return mesh ? raycaster.intersectObject(mesh.group, true)[0] : undefined;
  }
}
