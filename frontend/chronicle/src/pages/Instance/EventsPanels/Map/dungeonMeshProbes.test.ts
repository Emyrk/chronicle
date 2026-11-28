import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { floorBelow } from "./dungeonMeshes";
import { dungeonMeshNodeRole, dungeonMeshProbes, type DungeonMeshCave } from "./dungeonMeshProbes";

// An upward-facing square sheet at height y.
function sheet(name: string, size: number, y: number, x = 0): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(x, y, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

// A terrain GLB as the render pipeline exports it with --m2: the ground (`terrain`), a pond
// (`liquid_*`) and the M2 props in their own multi-primitive `doodad` node (a tree canopy 10 yd up
// over the origin), placed under a transform like parseDungeonMesh's template.
function excavationSite(doodadName = "doodad") {
  const scene = new THREE.Group();
  const ground = sheet("terrain", 40, 0);
  const pond = sheet("liquid_35_38", 6, 1, 15);
  const doodad = new THREE.Group();
  doodad.name = doodadName;
  const canopy = sheet("", 8, 10);
  const leaves = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
  canopy.material = leaves;
  doodad.add(canopy, sheet("", 1, 0.5, -5));
  scene.add(ground, pond, doodad);
  const template = new THREE.Group();
  template.rotation.y = Math.PI / 2;
  template.scale.setScalar(0.25);
  template.position.set(3, 0, -2);
  template.add(scene);
  template.updateMatrixWorld(true);
  return { scene, ground, pond, canopy, leaves };
}

// MapScene3D.castFloor: the highest cave or water surface a downward probe from fromY meets.
function castFloor(probes: { caves: DungeonMeshCave[]; liquids: DungeonMeshCave[] }, x: number, z: number, fromY: number) {
  const ray = new THREE.Ray();
  let best: number | null = null;
  const sets: [DungeonMeshCave[], THREE.Side][] = [[probes.caves, THREE.FrontSide], [probes.liquids, THREE.DoubleSide]];
  for (const [set, side] of sets) {
    for (const cave of set) {
      ray.origin.set(x, fromY, z);
      ray.direction.set(0, -1, 0);
      ray.applyMatrix4(cave.inverse);
      const hit = cave.bvh.raycastFirst(ray, side);
      if (!hit) continue;
      const y = hit.point.clone().applyMatrix4(cave.mesh.matrixWorld).y;
      if (best === null || y > best) best = y;
    }
  }
  return best;
}

describe("dungeon mesh probes", () => {
  it("classifies liquid and doodad nodes through their ancestors", () => {
    const { scene, ground, pond, canopy } = excavationSite();
    expect(dungeonMeshNodeRole(ground, scene)).toBe("cave");
    expect(dungeonMeshNodeRole(pond, scene)).toBe("liquid");
    expect(dungeonMeshNodeRole(canopy, scene)).toBe("doodad");
  });

  it("stands a unit without a logged height under a tree on the ground, not the canopy", () => {
    const site = excavationSite();
    const probes = dungeonMeshProbes(site.scene, null, MeshBVH);
    expect(probes.caves.map((cave) => cave.mesh)).toEqual([site.ground]);
    expect(probes.liquids.map((liquid) => liquid.mesh)).toEqual([site.pond]);
    // The tree is still drawn, with its own (two-sided, alpha-keyed) material.
    expect(site.canopy.parent?.name).toBe("doodad");
    expect(site.canopy.material).toBe(site.leaves);
    expect(site.leaves.transparent).toBe(false);

    // The template's origin is world (3, -2); the canopy covers it. No logged z: the highest hit wins.
    const floor = floorBelow((fromY) => castFloor(probes, 3, -2, fromY), 1000, undefined);
    expect(floor).toBeCloseTo(0, 6);
    // Nor does the canopy stand between the camera and the unit beneath it.
    const sight = new THREE.Ray(new THREE.Vector3(3, 50, -2), new THREE.Vector3(0, -1, 0));
    for (const cave of probes.caves) {
      const hit = cave.bvh.raycastFirst(sight.clone().applyMatrix4(cave.inverse), THREE.DoubleSide);
      expect(hit?.point.clone().applyMatrix4(cave.mesh.matrixWorld).y).toBeCloseTo(0, 6);
    }
  });

  it("would stand the unit on the canopy if the props were part of the cave", () => {
    const site = excavationSite("tree");
    const probes = dungeonMeshProbes(site.scene, null, MeshBVH);
    expect(probes.caves).toHaveLength(3); // the ground + both doodad primitives
    expect(floorBelow((fromY) => castFloor(probes, 3, -2, fromY), 1000, undefined)).toBeCloseTo(10 * 0.25, 6);
  });

  it("tints the liquid planes, not the doodads", () => {
    const site = excavationSite();
    dungeonMeshProbes(site.scene, { color: "#d66020", opacity: 0.85 }, MeshBVH);
    const water = site.pond.material as THREE.MeshStandardMaterial;
    expect(water.transparent).toBe(true);
    expect(water.depthWrite).toBe(false);
    expect(water.opacity).toBe(0.85);
    expect(water.color.getHexString()).toBe("d66020");
    expect(site.pond.renderOrder).toBe(1);
    expect(site.leaves.color.getHexString()).toBe("ffffff");
  });
});
