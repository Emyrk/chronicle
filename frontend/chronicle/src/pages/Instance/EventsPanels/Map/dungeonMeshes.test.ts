import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { WowMapFloorBounds } from "@/pages/Technical/mapGallery";
import {
  clampToRadius,
  corsAssetUrl,
  dungeonMeshPlacement,
  dungeonMeshUrl,
  FloorHeightCache,
  hasDungeonMesh,
} from "./dungeonMeshes";
import { dungeonMapPoint, mapPointToScene, renderedDungeonMapPoint } from "./mapModel";

// Wailing Caverns floor 1 (1002 x 668 px).
const WC_BOUNDS: WowMapFloorBounds = { minX: -375.946, maxX: 560.529, minY: -410.146, maxY: 214.170 };
const WC_ASPECT = 668 / 1002;
// Wailing Caverns `instances[].rendered` (1200 x 800 px) from the Forever
// manifest: drawn from the same WMO geometry as the mesh, bounds in world axes.
const WC_RENDERED_BOUNDS: WowMapFloorBounds = { minX: -421.6594, maxX: 220.06552, minY: -396.9931, maxY: 565.59424 };
const WC_RENDERED_ASPECT = 800 / 1200;
const GROUND_WIDTH = 100;
// Kresh's pool, the entrance, and a point near the artwork's far corner.
const WORLD_POINTS = [
  { x: -6.38, y: 204.62, z: -106 },
  { x: -115.21, y: 408.82, z: -60 },
  { x: 150, y: -300, z: 20 },
  { x: 0, y: 0, z: 0 },
];

describe("dungeonMeshUrl", () => {
  it("resolves to the icon CDN next to the tiles by default", () => {
    expect(dungeonMeshUrl(43, "https://icons.example.com/forever/", undefined)).toBe("https://icons.example.com/forever/maps/meshes/43.glb");
  });

  it("uses the base override when set", () => {
    expect(dungeonMeshUrl(43, "https://icons.example.com/forever", "/dungeon-meshes/")).toBe("/dungeon-meshes/43.glb");
    expect(dungeonMeshUrl(43, "https://icons.example.com/forever", "http://localhost:8080/meshes")).toBe("http://localhost:8080/meshes/43.glb");
  });

  it("has no mesh for other maps", () => {
    expect(dungeonMeshUrl(36, "https://icons.example.com/forever", undefined)).toBeNull();
    expect(dungeonMeshUrl(36, "https://icons.example.com/forever", "/dungeon-meshes")).toBeNull();
    expect(hasDungeonMesh(43)).toBe(true);
    expect(hasDungeonMesh(36)).toBe(false);
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
  function placedMatrix(bounds: WowMapFloorBounds, frame: "rendered" | "artwork" = "artwork"): THREE.Matrix4 {
    const placement = dungeonMeshPlacement(bounds, GROUND_WIDTH, frame);
    const group = new THREE.Group();
    group.rotation.y = placement.rotationY;
    group.scale.setScalar(placement.scale);
    group.position.set(placement.x, 0, placement.z);
    group.updateMatrix();
    return group.matrix;
  }

  it("matches the artwork projection for the Wailing Caverns floor", () => {
    const matrix = placedMatrix(WC_BOUNDS);
    const { scale } = dungeonMeshPlacement(WC_BOUNDS, GROUND_WIDTH);
    expect(scale).toBeCloseTo(100 / (WC_BOUNDS.maxX - WC_BOUNDS.minX), 6);
    // The artwork's vertical axis gives the same yards-per-unit to 4 decimals.
    expect(scale).toBeCloseTo((100 * WC_ASPECT) / (WC_BOUNDS.maxY - WC_BOUNDS.minY), 4);
    for (const world of WORLD_POINTS) {
      const point = dungeonMapPoint({ timestampMs: 0, x: world.x, y: world.y, mapId: 43, facing: 0 }, WC_BOUNDS)!;
      const expected = mapPointToScene(point, WC_ASPECT, GROUND_WIDTH);
      // glTF Y-up form of the same world point, run through the group.
      const gltf = new THREE.Vector3(-world.x, world.z, world.y).applyMatrix4(matrix);
      expect(gltf.x).toBeCloseTo(expected.x, 3);
      expect(gltf.z).toBeCloseTo(expected.z, 3);
      expect(gltf.y).toBeCloseTo(scale * world.z, 6);
    }
  });

  it("matches the rendered projection for the Wailing Caverns render", () => {
    const matrix = placedMatrix(WC_RENDERED_BOUNDS, "rendered");
    const { scale, rotationY } = dungeonMeshPlacement(WC_RENDERED_BOUNDS, GROUND_WIDTH, "rendered");
    // The render's width spans world Y; its height spans world X at the same
    // yards per unit (the image is coordinate-faithful), so the frame stays
    // uniform and the same quarter turn applies.
    expect(scale).toBeCloseTo(100 / (WC_RENDERED_BOUNDS.maxY - WC_RENDERED_BOUNDS.minY), 6);
    expect(scale).toBeCloseTo((100 * WC_RENDERED_ASPECT) / (WC_RENDERED_BOUNDS.maxX - WC_RENDERED_BOUNDS.minX), 5);
    expect(rotationY).toBe(-Math.PI / 2);
    for (const world of WORLD_POINTS) {
      const point = renderedDungeonMapPoint({ timestampMs: 0, x: world.x, y: world.y, mapId: 43, facing: 0 }, WC_RENDERED_BOUNDS)!;
      const expected = mapPointToScene(point, WC_RENDERED_ASPECT, GROUND_WIDTH);
      const gltf = new THREE.Vector3(-world.x, world.z, world.y).applyMatrix4(matrix);
      expect(gltf.x).toBeCloseTo(expected.x, 3);
      expect(gltf.z).toBeCloseTo(expected.z, 3);
      expect(gltf.y).toBeCloseTo(scale * world.z, 6);
    }
    // The rendered bounds centre lands on the origin too.
    const centre = new THREE.Vector3(
      -(WC_RENDERED_BOUNDS.maxX + WC_RENDERED_BOUNDS.minX) / 2,
      0,
      (WC_RENDERED_BOUNDS.maxY + WC_RENDERED_BOUNDS.minY) / 2,
    ).applyMatrix4(matrix);
    expect(centre.x).toBeCloseTo(0, 6);
    expect(centre.z).toBeCloseTo(0, 6);
  });

  it("centres the bounds on the origin", () => {
    const matrix = placedMatrix(WC_BOUNDS);
    const centre = new THREE.Vector3(
      -(WC_BOUNDS.maxY + WC_BOUNDS.minY) / 2,
      0,
      (WC_BOUNDS.maxX + WC_BOUNDS.minX) / 2,
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
