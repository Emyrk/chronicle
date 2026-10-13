import { describe, expect, it } from "vitest";
import type { WowMapManifest } from "@/pages/Technical/mapGallery";
import type { MapEncounterPositions, MapPositionSample } from "./map.processor";
import { createEncounterEffects } from "./replayEffects";
import {
  calibratedDungeonMapPoint,
  clampViewport,
  fitViewportToBounds,
  FULL_MAP_VIEWPORT,
  MAX_MAP_ZOOM,
  unitFocusBounds,
  viewportPoint,
  zoomViewportAt,
  dungeonMapPoint,
  interpolatedPositionAt,
  healthBarColor,
  latestHealthAt,
  latestPositionAt,
  MAX_HEALTH_BARS,
  mapPointToScene,
  resolveDungeonMapCalibration,
  resolveMapArtwork,
  selectHealthBars,
  selectMapEncounter,
  zoneMapPoint,
} from "./mapModel";

const samples: MapPositionSample[] = [
  { timestampMs: 100, x: 1, y: 2, mapId: 1420, facing: 0 },
  { timestampMs: 200, x: 3, y: 4, mapId: 1420, facing: 1 },
  { timestampMs: 300, x: 5, y: 6, mapId: 1420, facing: 2 },
];

const encounter: MapEncounterPositions = {
  encounterId: "one",
  startMs: 100,
  endMs: 300,
  positionsByUnit: new Map([["player", samples]]),
  healthByUnit: new Map(),
  effects: createEncounterEffects(),
};

const manifest: WowMapManifest = {
  format: "chronicle-wow-map-art-v1",
  target: { product: "wow_classic_beta", build: "1.60.1.70205", region: "us", locale: "enUS" },
  maps: [{
    id: 947,
    name: "Azeroth",
    parentID: 0,
    type: 1,
    flags: 0,
    assignments: [{
      id: 2,
      mapID: 0,
      areaID: 0,
      orderIndex: 0,
      region: [-16000, -7466, -1000000, 6933, 8000, 1000000],
      uiMin: [0, 0],
      uiMax: [1, 1],
    }],
    art: [{
      phaseID: 0,
      artID: 2,
      styleID: 1,
      layers: [{
        index: 0,
        width: 1002,
        height: 668,
        tileWidth: 256,
        tileHeight: 256,
        minScale: 1,
        maxScale: 2,
        additionalZoomSteps: 0,
        tiles: [{ row: 0, column: 0, fileDataID: 2, path: "tiles/2.webp" }],
      }],
    }],
  }, {
    id: 1420,
    name: "Tirisfal Glades",
    parentID: 1415,
    type: 3,
    flags: 2,
    assignments: [{
      id: 1,
      mapID: 0,
      areaID: 85,
      orderIndex: 0,
      region: [825, -1485, -1000000, 3837, 3033, 1000000],
      uiMin: [0, 0],
      uiMax: [1, 1],
    }],
    art: [{
      phaseID: 0,
      artID: 1,
      styleID: 1,
      layers: [{
        index: 0,
        width: 1002,
        height: 668,
        tileWidth: 256,
        tileHeight: 256,
        minScale: 1,
        maxScale: 2,
        additionalZoomSteps: 0,
        tiles: [{ row: 0, column: 0, fileDataID: 1, path: "tiles/1.webp" }],
      }],
    }],
  }],
  instances: [{
    mapID: 533,
    name: "Naxxramas",
    instanceType: 2,
    directory: "naxxramas",
    floors: [{ floor: 1, width: 1002, height: 668, tileWidth: 256, tileHeight: 256, tiles: [] }],
  }],
};

describe("map replay model", () => {
  it("finds the latest sample at or before the replay cursor", () => {
    expect(latestPositionAt(samples, 99)).toBeNull();
    expect(latestPositionAt(samples, 200)).toBe(samples[1]);
    expect(latestPositionAt(samples, 250)).toBe(samples[1]);
    expect(latestPositionAt(samples, 999)).toBe(samples[2]);
  });

  it("finds the latest health sample at or before the replay cursor", () => {
    const health = [
      { timestampMs: 100, current: 1000, max: 1000, absorb: 0 },
      { timestampMs: 300, current: 400, max: 1000, absorb: 0 },
    ];
    expect(latestHealthAt(health, 99)).toBeNull();
    expect(latestHealthAt(health, 299)).toBe(health[0]);
    expect(latestHealthAt(health, 300)).toBe(health[1]);
    // Scrubbing back returns the earlier sample again.
    expect(latestHealthAt(health, 150)).toBe(health[0]);
  });

  it("keeps bars for bosses and selected players and caps recently damaged units", () => {
    const sample = (timestampMs: number) => [{ timestampMs, current: 500, max: 1000, absorb: 0 }];
    const healthByUnit = new Map([
      ["boss", sample(0)],
      ["selected", sample(0)],
      ["idle", sample(0)],
      ["future", sample(20_000)],
      ...Array.from({ length: 60 }, (_, index) => [`p${index}`, sample(9_000 + index)] as const),
    ]);
    const guids = ["idle", "future", ...Array.from({ length: 60 }, (_, index) => `p${index}`), "selected", "boss"];
    const bars = selectHealthBars(guids, healthByUnit, 10_000, new Set(["boss"]), new Set(["selected"]));
    expect(bars.size).toBe(MAX_HEALTH_BARS);
    expect(bars.has("boss")).toBe(true);
    expect(bars.has("selected")).toBe(true);
    // Unchanged for longer than RECENT_HEALTH_MS, or no sample yet.
    expect(bars.has("idle")).toBe(false);
    expect(bars.has("future")).toBe(false);
    // The most recently damaged units win the remaining slots.
    expect(bars.has("p59")).toBe(true);
    expect(bars.has("p0")).toBe(false);
  });

  it("colours health bars green to amber to red", () => {
    expect(healthBarColor(1)).toBe("rgb(34, 197, 94)");
    expect(healthBarColor(0.5)).toBe("rgb(245, 158, 11)");
    expect(healthBarColor(0)).toBe("rgb(239, 68, 68)");
    expect(healthBarColor(2)).toBe(healthBarColor(1));
  });

  it("selects the encounter containing the replay timestamp", () => {
    const second = { ...encounter, encounterId: "two", startMs: 400, endMs: 600 };
    const encounters = new Map([["one", encounter], ["two", second]]);
    expect(selectMapEncounter(encounters, ["one", "two"], 500)?.encounterId).toBe("two");
    expect(selectMapEncounter(encounters, ["one", "two"], null)?.encounterId).toBe("two");
  });

  it("prefers instance artwork before matching zone assignments", () => {
    expect(resolveMapArtwork(manifest, 533)).toMatchObject({ kind: "instance", instance: { name: "Naxxramas" } });
    expect(resolveMapArtwork(manifest, 0, undefined, "Naxxramas")).toMatchObject({
      kind: "instance",
      instance: { mapID: 533, name: "Naxxramas" },
    });
    expect(resolveMapArtwork(manifest, 0, {
      timestampMs: 0,
      x: 1750,
      y: 1690,
      mapId: 0,
      facing: 0,
    })).toMatchObject({ kind: "zone", map: { name: "Tirisfal Glades" } });
  });

  it("converts world coordinates using UiMapAssignment axis order", () => {
    const assignment = manifest.maps[1].assignments![0];
    expect(zoneMapPoint({ timestampMs: 0, x: 3837, y: 3033, mapId: 0, facing: 0 }, assignment)).toEqual({
      leftPercent: 0,
      topPercent: 0,
    });
    expect(zoneMapPoint({ timestampMs: 0, x: 825, y: -1485, mapId: 0, facing: 0 }, assignment)).toEqual({
      leftPercent: 100,
      topPercent: 100,
    });
  });

  it("does not fall back to an instance name when a persisted map ID is available", () => {
    expect(resolveMapArtwork(manifest, 1420, undefined, "Naxxramas")).toMatchObject({
      kind: "zone",
      map: { name: "Tirisfal Glades" },
    });
  });

  it.each([
    { entry: 3671, sample: { timestampMs: 1_000, x: 15.04, y: 300.08, mapId: 0, facing: 0 }, point: { leftPercent: 30.6, topPercent: 43 } },
    { entry: 3670, sample: { timestampMs: 1_000, x: 36.81, y: -241.06, mapId: 0, facing: 0 }, point: { leftPercent: 19.1, topPercent: 39.5 } },
    { entry: 3669, sample: { timestampMs: 1_000, x: -151.14, y: 414.37, mapId: 0, facing: 0 }, point: { leftPercent: 16.7, topPercent: 56.8 } },
    { entry: 3653, sample: { timestampMs: 1_000, x: -6.38, y: 204.62, mapId: 0, facing: 0 }, point: { leftPercent: 38.5, topPercent: 36.1 } },
    { entry: 3674, sample: { timestampMs: 1_000, x: -279, y: -314, mapId: 0, facing: 0 }, point: { leftPercent: 62.3, topPercent: 74.4 } },
    { entry: 3673, sample: { timestampMs: 1_000, x: -118.78, y: -25.08, mapId: 0, facing: 0 }, point: { leftPercent: 61.6, topPercent: 53.9 } },
    { entry: 5775, sample: { timestampMs: 1_000, x: -84.95, y: 29.65, mapId: 0, facing: 0 }, point: { leftPercent: 55.5, topPercent: 46.5 } },
    { entry: 3654, sample: { timestampMs: 1_000, x: 138.9, y: 250.94, mapId: 0, facing: 0 }, point: { leftPercent: 34.6, topPercent: 13.7 } },
  ])("calibrates Wailing Caverns entry $entry to its boss pin", ({ entry, sample, point }) => {
    const calibrationEncounter: MapEncounterPositions = {
      encounterId: "boss",
      startMs: 0,
      endMs: 1_000,
      positionsByUnit: new Map([["boss", [sample]]]),
      healthByUnit: new Map(),
      effects: createEncounterEffects(),
    };
    const calibration = resolveDungeonMapCalibration(43, calibrationEncounter, () => entry);
    expect(calibration).not.toBeNull();
    expect(calibratedDungeonMapPoint(sample, {
      minX: -375.946014,
      maxX: 560.528992,
      minY: -410.145996,
      maxY: 214.169998,
    }, calibration!)).toEqual(point);
  });

  it("uses the median terminal boss position as the calibration anchor", () => {
    const calibrationEncounter: MapEncounterPositions = {
      encounterId: "pythas",
      startMs: 0,
      endMs: 10_000,
      positionsByUnit: new Map([["boss", [
        { timestampMs: 4_000, x: 999, y: 999, mapId: 0, facing: 0 },
        { timestampMs: 6_000, x: 36, y: -242, mapId: 0, facing: 0 },
        { timestampMs: 8_000, x: 38, y: -240, mapId: 0, facing: 0 },
        { timestampMs: 10_000, x: 37, y: -241, mapId: 0, facing: 0 },
      ]]]),
      healthByUnit: new Map(),
      effects: createEncounterEffects(),
    };
    const calibration = resolveDungeonMapCalibration(43, calibrationEncounter, () => 3670);
    expect(calibration?.anchorSample).toMatchObject({ x: 37, y: -241 });
  });

  it("preserves local movement around a Wailing Caverns boss anchor", () => {
    const anchor = { timestampMs: 1_000, x: 36.81, y: -241.06, mapId: 0, facing: 0 };
    const calibrationEncounter: MapEncounterPositions = {
      encounterId: "pythas",
      startMs: 0,
      endMs: 1_000,
      positionsByUnit: new Map([["boss", [anchor]]]),
      healthByUnit: new Map(),
      effects: createEncounterEffects(),
    };
    const calibration = resolveDungeonMapCalibration(43, calibrationEncounter, () => 3670)!;
    const point = calibratedDungeonMapPoint({ ...anchor, x: anchor.x + 10, y: anchor.y - 10 }, {
      minX: -375.946014,
      maxX: 560.528992,
      minY: -410.145996,
      maxY: 214.169998,
    }, calibration)!;
    expect(point.leftPercent).toBeCloseTo(20.1678, 3);
    expect(point.topPercent).toBeCloseTo(37.8982, 3);
  });

  it("requires a known boss position to calibrate Wailing Caverns", () => {
    expect(resolveDungeonMapCalibration(43, encounter, () => undefined)).toBeNull();
    expect(resolveDungeonMapCalibration(533, encounter, () => 3670)).toBeNull();
  });

  it("converts dungeon world coordinates using authoritative floor bounds", () => {
    const bounds = { minX: -410.946014, maxX: 595.528992, minY: -483.479004, maxY: 187.503998 };
    expect(dungeonMapPoint(
      { timestampMs: 0, x: bounds.maxY, y: bounds.maxX, mapId: 0, facing: 0 },
      bounds,
    )).toEqual({ leftPercent: 0, topPercent: 0 });
    expect(dungeonMapPoint(
      { timestampMs: 0, x: bounds.minY, y: bounds.minX, mapId: 0, facing: 0 },
      bounds,
    )).toEqual({ leftPercent: 100, topPercent: 100 });
  });
});

describe("interpolatedPositionAt", () => {
  it("returns null before the first sample", () => {
    expect(interpolatedPositionAt(samples, 99)).toBeNull();
  });

  it("blends position and facing between neighbouring samples", () => {
    expect(interpolatedPositionAt(samples, 150)).toEqual({ timestampMs: 150, x: 2, y: 3, mapId: 1420, facing: 0.5 });
  });

  it("matches the exact sample and holds the last one", () => {
    expect(interpolatedPositionAt(samples, 200)).toEqual({ ...samples[1] });
    expect(interpolatedPositionAt(samples, 999)).toBe(samples[2]);
  });

  it("turns through the shortest angle", () => {
    const wrapping: MapPositionSample[] = [
      { timestampMs: 0, x: 0, y: 0, mapId: 1, facing: 6.2 },
      { timestampMs: 100, x: 0, y: 0, mapId: 1, facing: 0.1 },
    ];
    const facing = interpolatedPositionAt(wrapping, 50)!.facing;
    expect(Math.cos(facing)).toBeCloseTo(Math.cos((6.2 + 0.1 + 2 * Math.PI) / 2), 6);
  });

  it("holds the latest sample across long gaps and map changes", () => {
    const gapped: MapPositionSample[] = [
      { timestampMs: 0, x: 0, y: 0, mapId: 1, facing: 0 },
      { timestampMs: 5_000, x: 10, y: 0, mapId: 1, facing: 0 },
      { timestampMs: 5_100, x: 20, y: 0, mapId: 2, facing: 0 },
    ];
    expect(interpolatedPositionAt(gapped, 2_500)).toBe(gapped[0]);
    expect(interpolatedPositionAt(gapped, 5_050)).toBe(gapped[1]);
  });
});

describe("mapPointToScene", () => {
  it("centres the artwork on the origin and keeps its aspect", () => {
    expect(mapPointToScene({ leftPercent: 50, topPercent: 50 }, 0.5, 100)).toEqual({ x: 0, z: 0 });
    expect(mapPointToScene({ leftPercent: 0, topPercent: 0 }, 0.5, 100)).toEqual({ x: -50, z: -25 });
    expect(mapPointToScene({ leftPercent: 100, topPercent: 100 }, 0.5, 100)).toEqual({ x: 50, z: 25 });
  });
});

describe("unitFocusBounds", () => {
  const at = (x: number, y: number, mapId = 1, timestampMs = 0): MapPositionSample => ({ timestampMs, x, y, mapId, facing: 0 });
  // Identity-ish projection: world x -> left %, world y -> top %.
  const project = (sample: MapPositionSample) => ({ leftPercent: sample.x, topPercent: sample.y });

  it("returns null without samples", () => {
    expect(unitFocusBounds(new Map(), 1, project)).toBeNull();
    expect(unitFocusBounds(new Map([["a", []]]), 1, project)).toBeNull();
  });

  it("frames a single unit's whole track", () => {
    const bounds = unitFocusBounds(new Map([["a", [at(10, 20), at(14, 26, 1, 100), at(12, 22, 1, 200)]]]), 1, project);
    expect(bounds).toEqual({ minLeft: 10, maxLeft: 14, minTop: 20, maxTop: 26 });
  });

  it("ignores samples on other maps and points the floor cannot project", () => {
    const positions = new Map([
      ["a", [at(10, 10), at(90, 90, 2)]],
      ["b", [at(30, 40), at(32, 44)]],
      ["c", [at(20, 50)]],
    ]);
    const offFloor = (sample: MapPositionSample) => sample.y >= 50 ? null : project(sample);
    expect(unitFocusBounds(positions, 1, offFloor)).toEqual({ minLeft: 10, maxLeft: 32, minTop: 10, maxTop: 44 });
    expect(unitFocusBounds(positions, 2, project)).toEqual({ minLeft: 90, maxLeft: 90, minTop: 90, maxTop: 90 });
    expect(unitFocusBounds(positions, 3, project)).toBeNull();
  });

  it("centres on the boss and clamps out far stragglers", () => {
    const positions = new Map([
      ["boss", [at(50, 50), at(52, 50)]],
      ["tank", [at(48, 49)]],
      ["healer", [at(60, 55)]],
      ["straggler", [at(400, 400)]],
    ]);
    expect(unitFocusBounds(positions, 1, project, new Set(["boss"]), 80))
      .toEqual({ minLeft: 48, maxLeft: 60, minTop: 49, maxTop: 55 });
  });
});

describe("map viewport", () => {
  it("fits bounds with padding, centred on the box", () => {
    const viewport = fitViewportToBounds({ minLeft: 40, maxLeft: 50, minTop: 45, maxTop: 50 });
    expect(viewport.centerX).toBeCloseTo(0.45);
    expect(viewport.centerY).toBeCloseTo(0.475);
    expect(viewport.zoom).toBeCloseTo(1 / (0.1 * 1.3));
  });

  it("caps the zoom for a single point and keeps the view on the artwork", () => {
    expect(fitViewportToBounds({ minLeft: 0, maxLeft: 0, minTop: 100, maxTop: 100 })).toEqual({
      centerX: 0.5 / MAX_MAP_ZOOM,
      centerY: 1 - 0.5 / MAX_MAP_ZOOM,
      zoom: MAX_MAP_ZOOM,
    });
  });

  it("never zooms out past the full map", () => {
    expect(fitViewportToBounds({ minLeft: 0, maxLeft: 100, minTop: 0, maxTop: 100 })).toEqual(FULL_MAP_VIEWPORT);
    expect(clampViewport({ centerX: 0.1, centerY: 0.9, zoom: 0.5 })).toEqual(FULL_MAP_VIEWPORT);
  });

  it("zooms around the pointer", () => {
    const zoomed = zoomViewportAt(FULL_MAP_VIEWPORT, 4, 0.25, 0.25);
    expect(zoomed.zoom).toBe(4);
    const anchor = viewportPoint({ leftPercent: 25, topPercent: 25 }, zoomed);
    expect(anchor.leftPercent).toBeCloseTo(25);
    expect(anchor.topPercent).toBeCloseTo(25);
  });

  it("spreads points apart as the zoom grows", () => {
    const viewport = { centerX: 0.5, centerY: 0.5, zoom: 10 };
    expect(viewportPoint({ leftPercent: 50, topPercent: 50 }, viewport)).toEqual({ leftPercent: 50, topPercent: 50 });
    expect(viewportPoint({ leftPercent: 51, topPercent: 50 }, viewport).leftPercent).toBeCloseTo(60);
  });
});
