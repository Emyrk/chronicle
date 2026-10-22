import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { WowMapFloorBounds, WowMapInstance, WowMapMeshInstance } from "@/pages/Technical/mapGallery";
import {
  clampToRadius,
  dungeonMeshLiquid,
  dungeonMeshPlacement,
  dungeonMeshUrl,
  floorBelow,
  FloorHeightCache,
  isMeshOnlyInstance,
  medianHeight,
  placeableDungeonMesh,
} from "./dungeonMeshes";
import { mapPointToScene, renderedDungeonMapPoint } from "./mapModel";

// Wailing Caverns `instances[].mesh` as manifest.meshes.json publishes it:
// the mesh's own world-axis extent, from the render pipeline's height.json.
const WC_MESH: WowMapMeshInstance = {
  path: "3d/wailing-caverns-open-top.glb",
  bounds: { minX: -389.07001, maxX: 191.6667, minY: -370.83331, maxY: 538.3512 },
  zMin: -119.1605,
  zMax: 56.4689,
  frame: "wow-yup-mirrored-x",
};
// The ground the mesh entry defines: width spans world Y, height world X.
const WC_MESH_ASPECT = (WC_MESH.bounds.maxX - WC_MESH.bounds.minX) / (WC_MESH.bounds.maxY - WC_MESH.bounds.minY);
const GROUND_WIDTH = 100;
// Kresh's pool, the entrance, and a point near the artwork's far corner.
const WORLD_POINTS = [
  { x: -6.38, y: 204.62, z: -106 },
  { x: -115.21, y: 408.82, z: -60 },
  { x: 150, y: -300, z: 20 },
  { x: 0, y: 0, z: 0 },
];

// Ragefire Chasm as manifest.meshes.json publishes it: a mesh-only instance
// (vanilla RFC has no in-game dungeon map) whose liquid is lava.
const RFC_MESH: WowMapMeshInstance = {
  path: "3d/ragefire-chasm-open-top.glb",
  bounds: { minX: -416.2582, maxX: 102.9279, minY: -108.4728, maxY: 275.3513 },
  zMin: -66.1637,
  zMax: 59.4058,
  frame: "wow-yup-mirrored-x",
  liquid: { color: "#d66020", opacity: 0.85 },
};
const RFC_INSTANCE: WowMapInstance = { mapID: 389, name: "Ragefire Chasm", instanceType: 0, directory: "", floors: [], mesh: RFC_MESH };
const WC_FLOOR = { floor: 1, width: 1002, height: 668, tileWidth: 256, tileHeight: 256, tiles: [] };

describe("isMeshOnlyInstance", () => {
  it("is true only for an instance with no artwork and a placeable mesh", () => {
    expect(isMeshOnlyInstance(RFC_INSTANCE)).toBe(true);
    expect(isMeshOnlyInstance({ ...RFC_INSTANCE, floors: [WC_FLOOR] })).toBe(false);
    expect(isMeshOnlyInstance({ ...RFC_INSTANCE, renders: { path: "renders/389.png", width: 2, height: 2 } })).toBe(false);
    expect(isMeshOnlyInstance({ ...RFC_INSTANCE, mesh: undefined })).toBe(false);
    expect(isMeshOnlyInstance({ ...RFC_INSTANCE, mesh: { ...RFC_MESH, frame: "wow-yup" } })).toBe(false);
  });
});

describe("dungeonMeshLiquid", () => {
  it("returns a well-formed tint and null for none or a malformed one", () => {
    expect(dungeonMeshLiquid(RFC_MESH)).toEqual({ color: "#d66020", opacity: 0.85 });
    expect(dungeonMeshLiquid({ ...RFC_MESH, liquid: { color: "#D66020", opacity: 1 } })).toEqual({ color: "#D66020", opacity: 1 });
    expect(dungeonMeshLiquid(WC_MESH)).toBeNull();
    for (const liquid of [
      { color: "d66020", opacity: 0.85 },
      { color: "#d60", opacity: 0.85 },
      { color: "orange", opacity: 0.85 },
      { color: "#d66020", opacity: 0 },
      { color: "#d66020", opacity: 1.5 },
      { color: "#d66020", opacity: Number.NaN },
      { color: "#d66020", opacity: "0.85" as unknown as number },
    ]) {
      expect(dungeonMeshLiquid({ ...RFC_MESH, liquid }), JSON.stringify(liquid)).toBeNull();
    }
  });

  it("does not stop the mesh being placed", () => {
    expect(placeableDungeonMesh({ ...RFC_MESH, liquid: { color: "orange", opacity: 2 } })).not.toBeNull();
  });
});

describe("placeableDungeonMesh", () => {
  it("accepts the published entry", () => {
    expect(placeableDungeonMesh(WC_MESH)).toBe(WC_MESH);
  });

  it("rejects a missing entry, an unknown frame and flat bounds", () => {
    expect(placeableDungeonMesh(undefined)).toBeNull();
    expect(placeableDungeonMesh({ ...WC_MESH, frame: "wow-yup" })).toBeNull();
    expect(placeableDungeonMesh({ ...WC_MESH, path: "" })).toBeNull();
    expect(placeableDungeonMesh({ ...WC_MESH, bounds: { ...WC_MESH.bounds, maxX: WC_MESH.bounds.minX } })).toBeNull();
    expect(placeableDungeonMesh({ ...WC_MESH, bounds: { ...WC_MESH.bounds, minY: WC_MESH.bounds.maxY + 1 } })).toBeNull();
  });
});

describe("dungeonMeshUrl", () => {
  it("resolves the manifest path under the icon CDN's maps", () => {
    expect(dungeonMeshUrl(WC_MESH, "https://icons.example.com/forever/")).toBe("https://icons.example.com/forever/maps/3d/wailing-caverns-open-top.glb");
  });
});

describe("dungeonMeshPlacement", () => {
  // A mesh group with the placement applied, as MapScene3D builds it.
  function placedMatrix(bounds: WowMapFloorBounds): THREE.Matrix4 {
    const placement = dungeonMeshPlacement(bounds, GROUND_WIDTH);
    const group = new THREE.Group();
    group.rotation.y = placement.rotationY;
    group.scale.setScalar(placement.scale);
    group.position.set(placement.x, 0, placement.z);
    group.updateMatrix();
    return group.matrix;
  }

  it("matches the units' projection onto the mesh entry's bounds", () => {
    const matrix = placedMatrix(WC_MESH.bounds);
    const { scale, rotationY } = dungeonMeshPlacement(WC_MESH.bounds, GROUND_WIDTH);
    // The ground's width spans world Y and its height world X at the same
    // yards per unit, so the frame is uniform and a quarter turn applies.
    expect(scale).toBeCloseTo(100 / (WC_MESH.bounds.maxY - WC_MESH.bounds.minY), 6);
    expect(scale).toBeCloseTo((100 * WC_MESH_ASPECT) / (WC_MESH.bounds.maxX - WC_MESH.bounds.minX), 6);
    expect(rotationY).toBe(-Math.PI / 2);
    for (const world of WORLD_POINTS) {
      const point = renderedDungeonMapPoint({ timestampMs: 0, x: world.x, y: world.y, mapId: 43, facing: 0 }, WC_MESH.bounds)!;
      const expected = mapPointToScene(point, WC_MESH_ASPECT, GROUND_WIDTH);
      // glTF form of the same world point (DUNGEON_MESH_FRAME), run through the group.
      const gltf = new THREE.Vector3(-world.x, world.z, world.y).applyMatrix4(matrix);
      expect(gltf.x).toBeCloseTo(expected.x, 3);
      expect(gltf.z).toBeCloseTo(expected.z, 3);
      expect(gltf.y).toBeCloseTo(scale * world.z, 6);
    }
  });

  it("centres the bounds on the origin", () => {
    const matrix = placedMatrix(WC_MESH.bounds);
    const centre = new THREE.Vector3(
      -(WC_MESH.bounds.maxX + WC_MESH.bounds.minX) / 2,
      0,
      (WC_MESH.bounds.maxY + WC_MESH.bounds.minY) / 2,
    ).applyMatrix4(matrix);
    expect(centre.x).toBeCloseTo(0, 6);
    expect(centre.z).toBeCloseTo(0, 6);
  });
});

describe("clampToRadius", () => {
  const centre = { x: 10, z: -5 };

  it("returns the point itself when inside", () => {
    const point = { x: 12, z: -3 };
    expect(clampToRadius(point, centre, 5)).toBe(point);
    expect(clampToRadius({ x: 15, z: -5 }, centre, 5)).toEqual({ x: 15, z: -5 });
  });

  it("pulls an outside point back onto the circle along its direction", () => {
    const clamped = clampToRadius({ x: 10, z: 15 }, centre, 8);
    expect(clamped.x).toBeCloseTo(10, 9);
    expect(clamped.z).toBeCloseTo(3, 9);
    const diagonal = clampToRadius({ x: 40, z: 35 }, centre, 10);
    expect(Math.hypot(diagonal.x - centre.x, diagonal.z - centre.z)).toBeCloseTo(10, 9);
    expect((diagonal.z - centre.z) / (diagonal.x - centre.x)).toBeCloseTo(40 / 30, 9);
  });
});

describe("floorBelow", () => {
  // A path under a canopy: ground at 0, a bridge deck at 6, the canopy at 20.
  const surfaces = [0, 6, 20];
  const cast = (fromY: number) => {
    const below = surfaces.filter((y) => y <= fromY);
    return below.length > 0 ? Math.max(...below) : null;
  };
  const TOP = 100;

  it("stands a unit with a logged height on the first surface below it, not the roof above", () => {
    expect(floorBelow(cast, TOP, 0 + 2.5)).toBe(0);
    expect(floorBelow(cast, TOP, 6 + 2.5)).toBe(6);
    expect(floorBelow(cast, TOP, 20 + 2.5)).toBe(20);
  });

  it("falls back to the highest surface when the logged probe misses", () => {
    const probe = vi.fn(cast);
    expect(floorBelow(probe, TOP, -10)).toBe(20);
    expect(probe.mock.calls).toEqual([[-10], [TOP]]);
  });

  it("keeps the highest surface without a logged height", () => {
    const probe = vi.fn(cast);
    expect(floorBelow(probe, TOP, undefined)).toBe(20);
    expect(probe.mock.calls).toEqual([[TOP]]);
  });

  it("misses when nothing lies below the top", () => {
    expect(floorBelow(() => null, TOP, 3)).toBeNull();
    expect(floorBelow(() => null, TOP, undefined)).toBeNull();
  });
});

describe("medianHeight", () => {
  it("takes the median of the logged heights and ignores units without one", () => {
    expect(medianHeight([])).toBeUndefined();
    expect(medianHeight([undefined, undefined])).toBeUndefined();
    expect(medianHeight([5, undefined, 1, 40])).toBe(5);
    expect(medianHeight([1, 3, undefined])).toBe(2);
  });
});

describe("FloorHeightCache", () => {
  it("probes once per position and keeps the hit", () => {
    const sample = vi.fn((x: number, z: number) => (x > 0 ? x + z : null));
    const cache = new FloorHeightCache(sample);
    expect(cache.heightAt("a", 2, 3)).toBe(5);
    expect(cache.heightAt("a", 2, 3)).toBe(5);
    expect(cache.heightAt("a", 2, 3)).toBe(5);
    expect(sample).toHaveBeenCalledTimes(1);
    expect(cache.heightAt("a", 4, 3)).toBe(7);
    expect(sample).toHaveBeenCalledTimes(2);
  });

  it("falls back to the last known height, or 0, when nothing is hit", () => {
    const sample = vi.fn((x: number) => (x > 0 ? x : null));
    const cache = new FloorHeightCache(sample);
    expect(cache.heightAt("a", -1, 0)).toBe(0);
    expect(cache.heightAt("a", 3, 0)).toBe(3);
    expect(cache.heightAt("a", -1, 0)).toBe(3);
    expect(cache.heightAt("a", -1, 0)).toBe(3);
    expect(sample).toHaveBeenCalledTimes(3);
  });

  it("re-probes when the probe start changes at the same position", () => {
    const sample = vi.fn((_x: number, _z: number, ceiling: number | undefined) => (ceiling === undefined ? 20 : Math.min(ceiling, 6)));
    const cache = new FloorHeightCache(sample);
    expect(cache.heightAt("a", 1, 1)).toBe(20);
    expect(cache.heightAt("a", 1, 1, 3)).toBe(3);
    expect(cache.heightAt("a", 1, 1, 3)).toBe(3);
    expect(cache.heightAt("a", 1, 1, 8)).toBe(6);
    expect(cache.heightAt("a", 1, 1)).toBe(20);
    expect(sample.mock.calls).toEqual([[1, 1, undefined], [1, 1, 3], [1, 1, 8], [1, 1, undefined]]);
  });

  it("keeps units apart and forgets removed ones", () => {
    const sample = vi.fn((_x: number, z: number) => z);
    const cache = new FloorHeightCache(sample);
    expect(cache.heightAt("a", 0, 1)).toBe(1);
    expect(cache.heightAt("b", 0, 2)).toBe(2);
    expect(cache.heightAt("a", 0, 1)).toBe(1);
    expect(sample).toHaveBeenCalledTimes(2);
    cache.delete("a");
    expect(cache.heightAt("a", 0, 1)).toBe(1);
    expect(sample).toHaveBeenCalledTimes(3);
    cache.clear();
    expect(cache.heightAt("b", 0, 2)).toBe(2);
    expect(sample).toHaveBeenCalledTimes(4);
  });
});
