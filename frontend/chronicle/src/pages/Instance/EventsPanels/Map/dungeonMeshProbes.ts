import * as THREE from "three";
import type { MeshBVH } from "three-mesh-bvh";
import type { WowMapMeshLiquid } from "@/pages/Technical/mapGallery";

/** A mesh the floor probes (and the camera's collision) cast against. */
export interface DungeonMeshCave {
  mesh: THREE.Mesh;
  bvh: MeshBVH;
  /** World -> mesh-local, for floor probes. */
  inverse: THREE.Matrix4;
}

/**
 * What a node of a dungeon GLB is to the replay:
 * - `liquid`: the `liquid_*` water planes. Units stand on them; they never block the camera.
 * - `doodad`: the render pipeline's M2 props (grass, trees, crates). They are drawn, but they are
 *   never floor and never block the camera, so a log without heights does not stand a unit on a
 *   tree canopy.
 * - `cave`: everything else, walkable and solid.
 * A multi-primitive node becomes a group of meshes, so the ancestors count too.
 */
export type DungeonMeshNodeRole = "cave" | "liquid" | "doodad";

export function dungeonMeshNodeRole(object: THREE.Object3D, root: THREE.Object3D): DungeonMeshNodeRole {
  for (let node: THREE.Object3D | null = object; node && node !== root; node = node.parent) {
    if (/^liquid/i.test(node.name)) return "liquid";
    if (/^doodad/i.test(node.name)) return "doodad";
  }
  return "cave";
}

/**
 * Sorts the meshes under `root` (already placed: matrixWorld current) into the probe sets and
 * styles the water: translucent, drawn after the cave without writing depth, tinted when the
 * entry says the liquid is not water. Doodads keep their own materials and join neither set.
 */
export function dungeonMeshProbes(
  root: THREE.Object3D,
  liquid: WowMapMeshLiquid | null | undefined,
  Bvh: new (geometry: THREE.BufferGeometry) => MeshBVH,
): { caves: DungeonMeshCave[]; liquids: DungeonMeshCave[] } {
  const caves: DungeonMeshCave[] = [];
  const liquids: DungeonMeshCave[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const role = dungeonMeshNodeRole(mesh, root);
    if (role === "doodad") return;
    // Probes use the template's fixed transforms, which every clone shares.
    const probe = { mesh, bvh: new Bvh(mesh.geometry), inverse: mesh.matrixWorld.clone().invert() };
    if (role === "cave") {
      caves.push(probe);
      return;
    }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      material.transparent = true;
      material.depthWrite = false;
      if (liquid && "color" in material && material.color instanceof THREE.Color) {
        material.color.set(liquid.color);
        material.opacity = liquid.opacity;
      }
    }
    mesh.renderOrder = 1;
    liquids.push(probe);
  });
  return { caves, liquids };
}
