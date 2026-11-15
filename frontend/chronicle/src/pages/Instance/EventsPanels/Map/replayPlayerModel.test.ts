import { describe, expect, it } from "vitest";
import { FULL_MAP_VIEWPORT, type MapViewport } from "./mapModel";
import {
  cameraModeFor,
  defaultViewport,
  directorFraming,
  focusParts,
  followState,
  meshWanted,
  prefersRenderedCanvas,
  shouldHoldScene,
  shownScene,
  type ReadyMapScene,
} from "./replayPlayerModel";

const fit: MapViewport = { centre: { leftPercent: 40, topPercent: 60 }, zoom: 3 } as unknown as MapViewport;
const mesh = {} as ReadyMapScene["mesh"];
const scene = (overrides: Partial<ReadyMapScene> = {}) => ({ encounterId: "e1", mapName: "Molten Core", selectedFloorNumber: 1, mesh, ...overrides }) as ReadyMapScene;

describe("held scene", () => {
  it("holds the first ready scene, and re-holds only when what it shows changes", () => {
    const held = scene();
    expect(shouldHoldScene(held, null)).toBe(true);
    // The same encounter at a later replay tick: a new object, but nothing the frozen view shows changed.
    expect(shouldHoldScene(scene(), held)).toBe(false);
    expect(shouldHoldScene(scene({ encounterId: "e2" }), held)).toBe(true);
    expect(shouldHoldScene(scene({ mapName: "Onyxia's Lair" }), held)).toBe(true);
    expect(shouldHoldScene(scene({ selectedFloorNumber: 2 }), held)).toBe(true);
    expect(shouldHoldScene(scene({ mesh: null }), held)).toBe(true);
    expect(shouldHoldScene(null, held)).toBe(false);
  });

  it("shows the live scene, or the held one only while the panel reprocesses", () => {
    const live = scene();
    const held = scene({ encounterId: "e0" });
    expect(shownScene(live, held, true)).toEqual({ ready: live, reloading: false });
    expect(shownScene(null, held, true)).toEqual({ ready: held, reloading: true });
    expect(shownScene(null, held, false)).toEqual({ ready: null, reloading: false });
    expect(shownScene(null, null, true)).toEqual({ ready: null, reloading: false });
  });
});

describe("mesh request", () => {
  it("wants the mesh with WebGL and the 3D map on, or always on a mesh-only instance", () => {
    expect(meshWanted(true, true, false)).toBe(true);
    expect(meshWanted(true, false, false)).toBe(false);
    expect(meshWanted(true, false, true)).toBe(true);
    expect(meshWanted(false, true, true)).toBe(false);
  });

  it("prefers the rendered 2D canvas without the mesh, always (the closed mobile panel), or never", () => {
    expect(prefersRenderedCanvas("without-mesh", true, true)).toBe(false);
    expect(prefersRenderedCanvas("without-mesh", true, false)).toBe(true);
    expect(prefersRenderedCanvas("without-mesh", false, true)).toBe(true);
    expect(prefersRenderedCanvas("always", true, true)).toBe(true);
    expect(prefersRenderedCanvas("never", false, false)).toBe(false);
  });
});

describe("framing and focus", () => {
  it("starts on the auto-fit when the scene fits by default, else the whole map", () => {
    expect(defaultViewport({ fitByDefault: true, autoFit: fit })).toBe(fit);
    expect(defaultViewport({ fitByDefault: false, autoFit: fit })).toBe(FULL_MAP_VIEWPORT);
    expect(defaultViewport({ fitByDefault: true, autoFit: null })).toBe(FULL_MAP_VIEWPORT);
    expect(defaultViewport(null)).toBe(FULL_MAP_VIEWPORT);
  });

  it("locks the mesh camera on the fight only when the scene fits by default", () => {
    const centre = { leftPercent: 1, topPercent: 2 };
    expect(focusParts({ focusCentre: centre, fitByDefault: true, autoFit: fit })).toEqual({ centre, zoom: 3 });
    expect(focusParts({ focusCentre: centre, fitByDefault: false, autoFit: fit })).toEqual({ centre, zoom: null });
    expect(focusParts(null)).toEqual({ centre: null, zoom: null });
  });
});

describe("camera", () => {
  const untouched = { manual: false, viewport: null };
  const pinned = { manual: false, viewport: FULL_MAP_VIEWPORT };
  const panned = { manual: true, viewport: fit };

  it("gives the Director the camera only while the framing is the default one", () => {
    expect(directorFraming(untouched)).toBe(true);
    expect(directorFraming(pinned)).toBe(false);
    expect(directorFraming(panned)).toBe(false);
  });

  it("reports the mode: director, user, an authored path, or an external pose (which wins)", () => {
    expect(cameraModeFor({ mode: "director" }, untouched)).toEqual({ mode: "director", cinematic: true });
    expect(cameraModeFor({ mode: "director" }, panned)).toEqual({ mode: "user", cinematic: false });
    expect(cameraModeFor({ mode: "user" }, untouched)).toEqual({ mode: "user", cinematic: false });
    const path = { marks: [], startMs: 0 };
    // A path takes over, with the Director still underneath (as the YouTube-scripted camera always had).
    expect(cameraModeFor({ mode: "director", path }, untouched)).toEqual({ mode: "path", cinematic: true });
    const pose = { position: [0, 0, 0], target: [0, 0, 0] } as never;
    expect(cameraModeFor({ mode: "user", path, pose }, untouched)).toEqual({ mode: "pose", cinematic: false });
  });

  it("offers Follow across a whole run and on the loaded mesh, on while the Director has the camera", () => {
    expect(followState(true, false, true)).toEqual({ canFollow: true, following: true });
    expect(followState(false, true, false)).toEqual({ canFollow: true, following: false });
    expect(followState(false, false, true)).toEqual({ canFollow: false, following: false });
  });
});
