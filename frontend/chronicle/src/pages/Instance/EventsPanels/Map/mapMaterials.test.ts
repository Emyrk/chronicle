import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { setMaterialEmissive } from "./mapMaterials";

describe("setMaterialEmissive", () => {
  it("applies and clears hit flashes on lit materials", () => {
    const material = new THREE.MeshStandardMaterial();
    const color = new THREE.Color(0.8, 0.4, 0.2);

    setMaterialEmissive(material, color, 0.5);
    expect(material.emissive.toArray()).toEqual([0.4, 0.2, 0.1]);

    setMaterialEmissive(material, null);
    expect(material.emissive.toArray()).toEqual([0, 0, 0]);
  });

  it("ignores unlit materials without an emissive channel", () => {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });

    expect(() => setMaterialEmissive(material, new THREE.Color(0xff0000), 0.5)).not.toThrow();
    expect(() => setMaterialEmissive(material, null)).not.toThrow();
    expect(material.color.getHex()).toBe(0xffffff);
  });
});
