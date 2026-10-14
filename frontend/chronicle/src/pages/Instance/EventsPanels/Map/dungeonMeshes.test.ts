import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { WowMapFloorBounds, WowMapMeshInstance } from "@/pages/Technical/mapGallery";
import {
  clampToRadius,
  corsAssetUrl,
  dungeonMeshPlacement,
  dungeonMeshUrl,
  FloorHeightCache,
  placeableDungeonMesh,
} from "./dungeonMeshes";
import { mapPointToScene, renderedDungeonMapPoint } from "./mapModel";

// Wailing Caverns `instances[].mesh` as manifest.meshes.json publishes it:
// the mesh's own world-axis extent, from the render pipeline's height.json.
const WC_MESH: WowMapMeshInstance = {
  path: "meshes/43.glb",
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
  it("resolves the manifest path under the icon CDN's maps by default", () => {
    expect(dungeonMeshUrl(WC_MESH, "https://icons.example.com/forever/", undefined)).toBe("https://icons.example.com/forever/maps/meshes/43.glb");
  });

  it("reads the file from the override directory when set", () => {
    expect(dungeonMeshUrl(WC_MESH, "https://icons.example.com/forever", "/dungeon-meshes/")).toBe("/dungeon-meshes/43.glb");
    expect(dungeonMeshUrl(WC_MESH, "https://icons.example.com/forever", "http://localhost:8080/meshes")).toBe("http://localhost:8080/meshes/43.glb");
  });
});

describe("corsAssetUrl", () => {
  it("marks cross-origin URLs", () => {
    expect(corsAssetUrl("https://icons.example.com/maps/tiles/1.webp", "http://localhost:5173")).toBe("https://icons.example.com/maps/tiles/1.webp?cors");
    expect(corsAssetUrl("https://icons.example.com/maps/tiles/1.webp?v=2", "http://localhost:5173")).toBe("https://icons.example.com/maps/tiles/1.webp?v=2&cors");
  });

  it("leaves relative and same-origin URLs alone", () => {
    expect(corsAssetUrl("/dungeon-meshes/43.glb", "http://localhost:5173")).toBe("/dungeon-meshes/43.glb");
    expect(corsAssetUrl("http://localhost:5173/dungeon-meshes/43.glb", "http://localhost:5173")).toBe("http://localhost:5173/dungeon-meshes/43.glb");
    expect(corsAssetUrl("http://localhost:51730/x.glb", "http://localhost:5173")).toBe("http://localhost:51730/x.glb?cors");
    expect(corsAssetUrl("/dungeon-meshes/43.glb", undefined)).toBe("/dungeon-meshes/43.glb");
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
