import * as THREE from "three";

export type MapBodyMaterial = THREE.MeshBasicMaterial | THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;

type EmissiveMaterial = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;

function hasEmissive(material: MapBodyMaterial): material is EmissiveMaterial {
  return "emissive" in material && material.emissive instanceof THREE.Color;
}

/** Applies a replay hit flash when the loaded model material supports emissive color. */
export function setMaterialEmissive(material: MapBodyMaterial, color: THREE.Color | null, intensity = 1) {
  if (!hasEmissive(material)) return;
  if (!color) {
    material.emissive.setRGB(0, 0, 0);
    return;
  }
  material.emissive.copy(color).multiplyScalar(intensity);
}
