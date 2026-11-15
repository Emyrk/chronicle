import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ScriptedRig } from "./scriptedRig";

describe("ScriptedRig", () => {
  it("puts the camera and pivot on the pose, with its lens when given", () => {
    const rig = new ScriptedRig();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
    const target = new THREE.Vector3();
    rig.apply({ position: [1, 2, 3], target: [4, 5, 6], fov: 30, near: 0.1 }, camera, target);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(target.toArray()).toEqual([4, 5, 6]);
    expect([camera.fov, camera.near, camera.far]).toEqual([30, 0.1, 2000]);
    expect(camera.projectionMatrix.elements).toEqual(new THREE.PerspectiveCamera(30, 1, 0.1, 2000).projectionMatrix.elements);
  });

  it("keeps the lens when the pose has none, and never animates", () => {
    const rig = new ScriptedRig();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
    rig.apply({ position: [0, 1, 0], target: [0, 0, 0] }, camera, new THREE.Vector3());
    expect([camera.fov, camera.near, camera.far]).toEqual([45, 0.5, 2000]);
    expect(rig.owner).toBe("scripted");
    expect(rig.active()).toBe(false);
  });
});
