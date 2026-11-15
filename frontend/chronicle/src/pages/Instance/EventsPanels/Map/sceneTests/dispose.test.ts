import type * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createTestScene, testUnit } from "./createTestScene";
import { FakeResizeObserver } from "./fakeDom";
import { mapPointAt } from "./syntheticDungeon";

// Characterisation (chronicle-1967): what dispose releases, and what it
// leaves alone (the parsed dungeon mesh is shared by every scene).

describe("dispose", () => {
  it("removes every listener the scene and its OrbitControls added to the canvas, the document and the window", async () => {
    const h = await createTestScene();
    const { window, document } = h.dom;
    expect(h.canvas.listenerCount()).toBeGreaterThan(0);
    expect(window.listeners()).toEqual({ "blur|false": 1, "keydown|true": 1, "keyup|false": 1 });
    // A drag leaves OrbitControls' document listeners in place until it ends; dispose must take them too.
    h.input.pointerDown(400, 300, { button: 1, buttons: 4 });
    h.dispose();
    expect(h.canvas.listeners()).toEqual({});
    expect(document.listeners()).toEqual({});
    expect(window.listeners()).toEqual({});
  });

  it("stops the frame loop, disconnects its ResizeObserver, disposes the renderer and removes the canvas", async () => {
    const h = await createTestScene();
    // Wake the loop first (an idle scene's loop is asleep, chronicle-1982).
    h.scene.setEffectClock(0, false, 1);
    expect(h.awake).toBe(true);
    expect(h.container.children).toContain(h.canvas);
    expect([...FakeResizeObserver.live].some((observer) => observer.observed.has(h.container))).toBe(true);
    h.dispose();
    expect(h.awake).toBe(false);
    expect([...FakeResizeObserver.live].some((observer) => observer.observed.has(h.container))).toBe(false);
    expect(h.renders.disposed).toBe(true);
    expect(h.container.children).not.toContain(h.canvas);
    // Keys no longer reach it.
    const pose = h.probe.poseLine(6);
    h.input.hover();
    h.input.hold("KeyW", 300);
    expect(h.probe.poseLine(6)).toBe(pose);
  });

  it("releases the pointer lock it holds", async () => {
    const h = await createTestScene();
    h.dom.document.grantPointerLock = true;
    h.scene.setWalking(true);
    h.input.pointerDown(400, 300, { button: 0, buttons: 1 });
    expect(h.dom.document.pointerLockElement).toBe(h.canvas);
    h.dispose();
    expect(h.dom.document.pointerLockElement).toBeNull();
  });

  it("cancels its pending timers: a delayed unit click and a sliced floor-track build", async () => {
    const h = await createTestScene({ units: [testUnit("p1", -25, 0, { atMs: 1000 })] });
    const onClick = vi.fn();
    h.scene.setOnUnitClick(onClick);
    h.scene.applyCameraPose({ position: [-25, 25, 20], target: [-25, 10, 0] });
    const at = h.screenOf(-25, 10, 0);
    h.input.hover(at.x, at.y);
    h.input.click(at.x, at.y);
    h.scene.setFollowSource({
      key: "dispose",
      startMs: 0,
      endMs: 1000,
      unitsAt: () => [],
      unitTracks: () => [{ guid: "p1", samples: [{ ms: 1000, point: mapPointAt(-25, 0) }] }],
    });
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(2);
    h.dispose();
    expect(vi.getTimerCount()).toBe(0);
    await h.runTimers();
    expect(onClick).not.toHaveBeenCalled();
    expect(h.probe.floorTracks()).toBeNull();
  });

  it("does not dispose the shared mesh: the next scene reuses the parsed mesh without fetching it again", async () => {
    const first = await createTestScene();
    const { caves, group } = first.probe.mesh()!;
    const cave = caves[0].mesh;
    const geometry = cave.geometry as THREE.BufferGeometry;
    const material = cave.material as THREE.Material;
    const disposed = vi.fn();
    geometry.addEventListener("dispose", disposed);
    material.addEventListener("dispose", disposed);
    const fetches = first.fetch.mock.calls.length;
    first.dispose();
    expect(disposed).not.toHaveBeenCalled();

    const second = await createTestScene();
    expect(second.fetch.mock.calls.length).toBe(fetches);
    // The probe surfaces (caves and their BVHs) are the cached ones; the scene draws its own copy of the node tree on the same geometry and material.
    expect(second.probe.mesh()!.caves[0]).toBe(caves[0]);
    expect(second.probe.mesh()!.group).not.toBe(group);
    const drawn: THREE.Mesh[] = [];
    second.probe.mesh()!.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry === geometry) drawn.push(child as THREE.Mesh);
    });
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).not.toBe(cave);
    expect(drawn[0].material).toBe(material);
    second.dispose();
    expect(disposed).not.toHaveBeenCalled();
  });

  it("is safe to call twice", async () => {
    const h = await createTestScene();
    h.scene.dispose();
    expect(() => h.scene.dispose()).not.toThrow();
  });
});
