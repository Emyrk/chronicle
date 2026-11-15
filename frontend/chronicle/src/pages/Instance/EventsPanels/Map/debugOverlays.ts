/**
 * Persistent map diagnostics for MapScene3D (chronicle-1970): debug overlay
 * paths drawn on the dungeon mesh, height-probed in short strips through the
 * world's floor cache. Rebuilt when the overlays, the mesh or the aspect
 * change. Moved verbatim out of MapScene3D.ts.
 */
import * as THREE from "three";
import type { DungeonWorld } from "./dungeonWorld";
import { projectMapDebugPoints, type MapDebugOverlay } from "./mapDebugOverlays";
import { DEEP_BREATH_GROUND_LIFT, GROUND_WIDTH } from "./sceneConstants";

const DEBUG_PATH_SEGMENT_YARDS = 4;

export class DebugOverlayLayer {
  readonly debugOverlayGroup = new THREE.Group();
  private debugOverlays: readonly MapDebugOverlay[] = [];
  private readonly world: DungeonWorld;

  constructor(world: DungeonWorld) {
    this.world = world;
  }

  setDebugOverlays(overlays: readonly MapDebugOverlay[], aspect: number) {
    this.debugOverlays = overlays;
    this.rebuildDebugOverlays(aspect);
  }

  clearDebugOverlays() {
    for (const child of [...this.debugOverlayGroup.children]) {
      this.debugOverlayGroup.remove(child);
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) for (const material of mesh.material) material.dispose();
      else mesh.material?.dispose();
    }
  }

  rebuildDebugOverlays(aspect: number) {
    this.clearDebugOverlays();
    const dungeon = this.world.dungeonMesh;
    if (!dungeon) return;
    for (const overlay of this.debugOverlays) {
      if (overlay.kind !== "path") continue;
      const projected = projectMapDebugPoints(overlay.points, overlay.mapId, dungeon.bounds, aspect, GROUND_WIDTH);
      if (projected.length < 2) continue;
      // Independently height-probe short strips along every polyline segment so
      // non-straight server paths follow both their exact centerline and the mesh.
      let stripIndex = 0;
      for (let pointIndex = 1; pointIndex < projected.length; pointIndex++) {
        const from = projected[pointIndex - 1];
        const to = projected[pointIndex];
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const length = Math.hypot(dx, dz);
        if (length <= 1e-4) continue;
        const directionX = dx / length;
        const directionZ = dz / length;
        const stripCount = Math.max(1, Math.ceil(length / (DEBUG_PATH_SEGMENT_YARDS * dungeon.scale)));
        const stripLength = length / stripCount;
        const yaw = Math.atan2(-directionX, -directionZ);
        for (let index = 0; index < stripCount; index++, stripIndex++) {
          const distance = stripLength * (index + 0.5);
          const x = from.x + directionX * distance;
          const z = from.z + directionZ * distance;
          const floor = this.world.floorHeights.heightAt(`debug-overlay-${overlay.id}-${stripIndex}`, x, z);
          const material = new THREE.MeshBasicMaterial({
            color: overlay.color,
            transparent: true,
            opacity: overlay.opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const path = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
          path.position.set(x, floor + DEEP_BREATH_GROUND_LIFT * dungeon.scale, z);
          path.rotation.y = yaw;
          path.scale.set(overlay.widthYards * dungeon.scale, 1, stripLength * 1.05);
          path.renderOrder = 2;
          path.userData.debugOverlayId = overlay.id;
          this.debugOverlayGroup.add(path);
        }
      }
    }
  }
}
