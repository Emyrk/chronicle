import { describe, expect, it } from "vitest";
import { canRetryDungeon, DUNGEON_3D_COPY, dungeon3DOverlay, dungeon3DStatus, planUnavailableTitle, walkUnavailableTitle } from "./dungeon3DModel";

describe("3D dungeon status", () => {
  const base = { show3D: true, hasMesh: true, meshWanted: true, meshState: "loading" as const };

  it("follows the load once the 3D map is wanted", () => {
    expect(dungeon3DStatus(base)).toBe("loading");
    expect(dungeon3DStatus({ ...base, meshState: "ready" })).toBe("ready");
    expect(dungeon3DStatus({ ...base, meshState: "failed" })).toBe("failed");
  });

  it("says when the player turned the 3D map off, the dungeon has none, or the browser cannot show 3D", () => {
    expect(dungeon3DStatus({ ...base, meshWanted: false })).toBe("off");
    expect(dungeon3DStatus({ ...base, hasMesh: false })).toBe("no-3d-map");
    expect(dungeon3DStatus({ ...base, show3D: false, hasMesh: false })).toBe("no-webgl");
  });
});

describe("what shows over the map", () => {
  const counts = { failures: 1, dismissedAt: -1 };

  it("a failed dungeon with a flat map: the notice, until dismissed", () => {
    expect(dungeon3DOverlay("failed", { meshOnly: false, ...counts })).toEqual({ notice: true, cover: null });
    expect(dungeon3DOverlay("failed", { meshOnly: false, failures: 1, dismissedAt: 1 })).toEqual({ notice: false, cover: null });
  });

  it("shows the notice again after a retry fails again", () => {
    expect(dungeon3DOverlay("failed", { meshOnly: false, failures: 2, dismissedAt: 1 })).toEqual({ notice: true, cover: null });
  });

  it("a 3D-only dungeon: a cover while it loads and after it fails, never units on an empty ground", () => {
    expect(dungeon3DOverlay("loading", { meshOnly: true, ...counts })).toEqual({ notice: false, cover: "loading" });
    expect(dungeon3DOverlay("failed", { meshOnly: true, ...counts })).toEqual({ notice: false, cover: "failed" });
    expect(dungeon3DOverlay("ready", { meshOnly: true, ...counts })).toEqual({ notice: false, cover: null });
  });

  it("nothing over the map when the dungeon is up, loading with a flat map, has no 3D map, or is turned off", () => {
    for (const status of ["ready", "loading", "no-3d-map", "off", "no-webgl"] as const) {
      expect(dungeon3DOverlay(status, { meshOnly: false, ...counts })).toEqual({ notice: false, cover: null });
    }
  });
});

describe("Walk and Plan tooltips", () => {
  it("say the dungeon didn't load, instead of waiting forever or pointing at a toggle that is already on", () => {
    expect(walkUnavailableTitle("failed", true)).toBe(DUNGEON_3D_COPY.walkFailed);
    expect(planUnavailableTitle("failed")).toBe(DUNGEON_3D_COPY.planFailed);
  });

  it("say this dungeon has no 3D map yet", () => {
    expect(walkUnavailableTitle("no-3d-map", true)).toBe("Walk mode: this dungeon has no 3D map yet");
    expect(planUnavailableTitle("no-3d-map")).toBe("Plan: this dungeon has no 3D map yet");
  });

  it("wait while it loads, and keep the old flat-map and toggle hints otherwise", () => {
    expect(walkUnavailableTitle("loading", true)).toBe("Walk mode: waiting for the 3D map to load");
    expect(planUnavailableTitle("loading")).toBe("Plan: waiting for the 3D map to load");
    expect(walkUnavailableTitle("off", false)).toBe("Walk mode unavailable: this map has no world scale");
  });
});

describe("Retry", () => {
  it("is offered only after a failed load: never while loading or once the dungeon is up (no reload of a good one)", () => {
    expect(canRetryDungeon("failed")).toBe(true);
    for (const status of ["loading", "ready", "off", "no-3d-map", "no-webgl"] as const) expect(canRetryDungeon(status)).toBe(false);
  });
});

describe("copy", () => {
  it("uses no internal words", () => {
    for (const text of Object.values(DUNGEON_3D_COPY)) expect(text).not.toMatch(/mesh|bvh|manifest|glb|tiles/i);
  });
});
