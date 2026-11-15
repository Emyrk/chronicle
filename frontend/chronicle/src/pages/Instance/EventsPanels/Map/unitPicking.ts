/**
 * Unit picking for MapScene3D (chronicle-1977): the one raycast the pointer
 * hover and the click (and double-click) share to find the unit under the
 * pointer. Moved out of the two identical copies in MapScene3D.ts.
 */
import type * as THREE from "three";
import type { UnitObject } from "./unitLayer";

/** The nearest unit body `raycaster` hits, or undefined: tokens are tested before (and through) the mesh. */
export function raycastUnits(raycaster: THREE.Raycaster, units: ReadonlyMap<string, UnitObject>): THREE.Intersection | undefined {
  return raycaster.intersectObjects([...units.values()].map((unit) => unit.body), false)[0];
}
