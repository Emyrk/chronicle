import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DOUBLE_CLICK_MS } from "./controlProfile";
import type { MapViewport } from "./mapModel";
import { TweenRig } from "./tweenRig";

function setup() {
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3();
  const placed: { viewport: MapViewport; direction: THREE.Vector3 }[] = [];
  const host = {
    camera,
    controls: () => ({ target, update: () => false }),
    viewport: (): MapViewport => ({ centerX: 1, centerY: 1, zoom: 3 }),
    placeCamera: (viewport: MapViewport, direction: THREE.Vector3) => placed.push({ viewport, direction }),
    constrainCamera: vi.fn(),
    updateUnitScale: vi.fn(),
  };
  return { rig: new TweenRig(host), camera, target, placed, host };
}

describe("TweenRig", () => {
  it("claims the camera while a re-framing or a move runs", () => {
    const { rig } = setup();
    expect(rig.owner).toBe("tween");
    expect(rig.active()).toBe(false);
    rig.view = { from: { centerX: 0, centerY: 0, zoom: 1 }, direction: new THREE.Vector3(0, 1, 0), start: 0, duration: 100 };
    expect(rig.active()).toBe(true);
  });

  it("eases a re-framing out-cubic toward the scene's viewport and ends at it", () => {
    const { rig, placed } = setup();
    rig.view = { from: { centerX: 0, centerY: 0, zoom: 1 }, direction: new THREE.Vector3(0, 1, 0), start: 1000, duration: 100 };
    expect(rig.updateView(1050)).toBe(true);
    // 1 - (1 - 0.5)^3 = 0.875 of the way.
    expect(placed[0]!.viewport.centerX).toBeCloseTo(0.875, 9);
    expect(rig.updateView(1100)).toBe(false);
    expect(placed[1]!.viewport).toEqual({ centerX: 1, centerY: 1, zoom: 3 });
    expect(rig.view).toBeNull();
    expect(rig.updateView(1200)).toBe(false);
  });

  it("eases a move in-out-cubic over DOUBLE_CLICK_MS, placing the camera along its direction, then constrains", () => {
    const { rig, camera, target, host } = setup();
    rig.move = { from: new THREE.Vector3(0, 0, 0), to: new THREE.Vector3(10, 0, 0), fromDistance: 20, toDistance: 10, direction: new THREE.Vector3(0, 0, 1), start: 0 };
    expect(rig.updateMove(DOUBLE_CLICK_MS / 2)).toBe(true);
    expect(target.x).toBeCloseTo(5, 9);
    expect(camera.position.toArray()).toEqual([target.x, 0, 15]);
    expect(host.constrainCamera).toHaveBeenCalledTimes(1);
    expect(rig.updateMove(DOUBLE_CLICK_MS)).toBe(false);
    expect(camera.position.toArray()).toEqual([10, 0, 10]);
    expect(rig.move).toBeNull();
  });
});
