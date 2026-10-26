import { describe, expect, it } from "vitest";
import type { WowMapInstance, WowMapManifest } from "@/pages/Technical/mapGallery";
import type { MapEncounterPositions, MapPositionSample } from "./map.processor";
import { createEncounterEffects } from "./replayEffects";
import {
  AUTO_FIT_MIN_SPAN_YARDS,
  autoFitViewport,
  calibratedDungeonMapPoint,
  clampFreeMapCamera,
  clampViewport,
  containScaleForCover,
  coverMapCanvasRect,
  fitFreeMapCameraToPoints,
  flatArtworkUnitScale,
  flatYardStep,
  floorBoundsYardStep,
  zoomFreeMapCamera,
  focusCentre,
  INITIAL_MAP_FRAMING,
  interpolateViewport,
  manualMapFraming,
  pinMapFraming,
  projectionScale,
  reconcileMapFraming,
  fitViewportToBounds,
  FULL_MAP_VIEWPORT,
  MAX_MAP_ZOOM,
  unitFocusBounds,
  viewportPoint,
  zoomViewportAt,
  dungeonMapPoint,
  replayPositionAt,
  healthBarColor,
  latestHealthAt,
  latestPositionAt,
  MAX_HEALTH_BARS,
  mapPointToScene,
  resolveDungeonMapCalibration,
  resolveMapArtwork,
  resolveMapFloorNumber,
  selectHealthBars,
  selectMapEncounter,
  uiMapPoint,
  zoneMapPoint,
  type MapViewport,
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
  debuffsByUnit: new Map(),
  effects: createEncounterEffects(),
};

const manifest: WowMapManifest = {
  format: "chronicle-wow-map-art-v2",
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
        tiles: [{ row: 0, column: 0, fileDataID: 2, path: "original/2.webp" }],
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
        tiles: [{ row: 0, column: 0, fileDataID: 1, path: "original/1.webp" }],
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

  it("uses a matching zone assignment when legacy instance artwork has no world bounds", () => {
    const fallbackManifest: WowMapManifest = {
      ...manifest,
      maps: [...manifest.maps, {
        id: 619,
        name: "Zul'Gurub",
        parentID: 0,
        type: 3,
        flags: 0,
        assignments: [{
          id: 619,
          mapID: 309,
          areaID: 1977,
          orderIndex: 0,
          region: [-12639.58, -2733.33, -1_000_000, -11225, -612.5, 1_000_000],
          uiMin: [0, 0],
          uiMax: [1, 1],
        }],
        art: manifest.maps[1].art,
      }],
      instances: [...(manifest.instances ?? []), {
        mapID: 309,
        name: "Zul'Gurub",
        instanceType: 2,
        directory: "zulgurub",
        floors: [{ floor: 1, width: 1002, height: 668, tileWidth: 256, tileHeight: 256, tiles: [] }],
      }],
    };

    expect(resolveMapArtwork(fallbackManifest, 309, {
      timestampMs: 0,
      x: -11693.7,
      y: -1739.7,
      mapId: 309,
      facing: 0,
    })).toMatchObject({ kind: "zone", map: { name: "Zul'Gurub" } });
  });

  it("uses a zone assignment from a name-resolved instance world map", () => {
    const emeraldSanctumManifest: WowMapManifest = {
      ...manifest,
      maps: [...manifest.maps, {
        id: 678,
        name: "Emerald Sanctum",
        parentID: 0,
        type: 3,
        flags: 0,
        assignments: [{
          id: 678,
          mapID: 807,
          areaID: 5097,
          orderIndex: 0,
          region: [2666, 2666, -1_000_000, 3519.72, 3939.1, 1_000_000],
          uiMin: [0, 0],
          uiMax: [1, 1],
        }],
        art: manifest.maps[1].art,
      }],
      instances: [...(manifest.instances ?? []), {
        mapID: 807,
        name: "Emerald Sanctum",
        instanceType: 2,
        directory: "emeraldsanctum",
        floors: [{ floor: 1, width: 1002, height: 668, tileWidth: 256, tileHeight: 256, tiles: [] }],
      }],
    };

    expect(resolveMapArtwork(emeraldSanctumManifest, 0, {
      timestampMs: 0,
      x: 3000,
      y: 3000,
      mapId: 0,
      facing: 0,
    }, "Emerald Sanctum")).toMatchObject({ kind: "zone", map: { id: 678, name: "Emerald Sanctum" } });
  });

  it("projects normalized UI map coordinates directly onto the artwork", () => {
    expect(uiMapPoint({ timestampMs: 0, x: 0.3582, y: 0.8466, mapId: 521 })).toEqual({
      leftPercent: 35.82,
      topPercent: 84.66,
    });
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
      debuffsByUnit: new Map(),
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
      debuffsByUnit: new Map(),
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
      debuffsByUnit: new Map(),
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

describe("resolveMapFloorNumber", () => {
  const instance: WowMapInstance = {
    mapID: 595,
    name: "The Culling of Stratholme",
    instanceType: 1,
    directory: "StratholmeCOT",
    floors: [1, 2].map((floor) => ({
      floor,
      width: 1002,
      height: 668,
      tileWidth: 256,
      tileHeight: 256,
      tiles: [],
    })),
  };

  it("uses the floor reported by position schema v3", () => {
    expect(resolveMapFloorNumber(instance, null, [
      { timestampMs: 0, x: 0.4, y: 0.5, mapId: 595, floor: 1 },
      { timestampMs: 0, x: 0.4, y: 0.5, mapId: 595, floor: 2 },
      { timestampMs: 0, x: 0.4, y: 0.5, mapId: 595, floor: 2 },
    ])).toBe(2);
  });

  it("honours a manual floor selection", () => {
    expect(resolveMapFloorNumber(instance, 1, [
      { timestampMs: 0, x: 0.4, y: 0.5, mapId: 595, floor: 2 },
    ])).toBe(1);
  });

  it("does not guess a floor for older position schemas", () => {
    expect(resolveMapFloorNumber(instance, null, [
      { timestampMs: 0, x: 0.4, y: 0.5, mapId: 595 },
    ])).toBe(1);
  });
});

describe("replayPositionAt", () => {
  it("allows small first-sample timestamp skew for every unit", () => {
    expect(replayPositionAt(samples, 89)).toBeNull();
    expect(replayPositionAt(samples, 90)).toBe(samples[0]);
  });

  it("shows a player's first known position from the start of the replay", () => {
    expect(replayPositionAt(samples, 0, true)).toBe(samples[0]);
  });

  it("linearly blends position and facing between neighbouring samples", () => {
    expect(replayPositionAt(samples, 150)).toEqual({ timestampMs: 150, x: 2, y: 3, mapId: 1420, facing: 0.5 });
  });

  it("blends a logged height like x/y and leaves it out when the log has none", () => {
    const logged: MapPositionSample[] = [
      { timestampMs: 0, x: 0, y: 0, z: 10, mapId: 1, facing: 0 },
      { timestampMs: 100, x: 10, y: 0, z: 30, mapId: 1, facing: 0 },
      { timestampMs: 200, x: 20, y: 0, mapId: 1, facing: 0 },
    ];
    expect(replayPositionAt(logged, 25)).toEqual({ timestampMs: 25, x: 2.5, y: 0, z: 15, mapId: 1, facing: 0 });
    expect(replayPositionAt(logged, 150)!.z).toBe(30);
    expect(replayPositionAt(samples, 150)).not.toHaveProperty("z");
  });

  it("arcs a logged height through the samples, as a knock-up rises and falls", () => {
    const thrown: MapPositionSample[] = [0, 0, 20, 0, 0].map((z, index) => ({ timestampMs: index * 100, x: 0, y: 0, z, mapId: 1 }));
    for (const sample of thrown) expect(replayPositionAt(thrown, sample.timestampMs)!.z).toBe(sample.z);
    // Straight lines give 10 halfway up and halfway down; the arc runs above both.
    expect(replayPositionAt(thrown, 150)!.z).toBeCloseTo(11.25, 6);
    expect(replayPositionAt(thrown, 250)!.z).toBeCloseTo(11.25, 6);
    // Level just before the peak, rather than the straight lines' corner.
    expect(replayPositionAt(thrown, 190)!.z).toBeGreaterThan(19.5);
  });

  it("matches the exact sample and holds the last one", () => {
    expect(replayPositionAt(samples, 200)).toEqual({ ...samples[1] });
    expect(replayPositionAt(samples, 999)).toBe(samples[2]);
  });

  it("turns through the shortest angle", () => {
    const wrapping: MapPositionSample[] = [
      { timestampMs: 0, x: 0, y: 0, mapId: 1, facing: 6.2 },
      { timestampMs: 100, x: 0, y: 0, mapId: 1, facing: 0.1 },
    ];
    const facing = replayPositionAt(wrapping, 50)!.facing!;
    expect(Math.cos(facing)).toBeCloseTo(Math.cos((6.2 + 0.1 + 2 * Math.PI) / 2), 6);
  });

  it("leaves facing out when the log has none, and holds a one-sided facing", () => {
    const unfaced: MapPositionSample[] = [
      { timestampMs: 0, x: 0, y: 0, mapId: 1 },
      { timestampMs: 100, x: 10, y: 0, mapId: 1 },
    ];
    expect(replayPositionAt(unfaced, 50)).not.toHaveProperty("facing");
    const halfFaced: MapPositionSample[] = [
      { timestampMs: 0, x: 0, y: 0, mapId: 1, facing: 1.2 },
      { timestampMs: 100, x: 10, y: 0, mapId: 1 },
    ];
    expect(replayPositionAt(halfFaced, 50)!.facing).toBe(1.2);
  });

  it("never interpolates across floor changes", () => {
    const changingFloor: MapPositionSample[] = [
      { timestampMs: 0, x: 0, y: 0, mapId: 595, floor: 1 },
      { timestampMs: 100, x: 10, y: 0, mapId: 595, floor: 2 },
    ];
    expect(replayPositionAt(changingFloor, 50)).toBe(changingFloor[0]);
  });

  it("can hold the last real sample instead of gliding across a long run gap", () => {
    const gapped: MapPositionSample[] = [
      { timestampMs: 0, x: 0, y: 0, mapId: 1 },
      { timestampMs: 60_000, x: 100, y: 100, mapId: 1 },
    ];
    expect(replayPositionAt(gapped, 30_000, true, 15_000)).toBe(gapped[0]);
  });

  it("interpolates across long gaps but never across map changes", () => {
    const gapped: MapPositionSample[] = [
      { timestampMs: 0, x: 0, y: 0, mapId: 1, facing: 0 },
      { timestampMs: 5_000, x: 10, y: 0, mapId: 1, facing: 0 },
      { timestampMs: 5_100, x: 20, y: 0, mapId: 2, facing: 0 },
    ];
    expect(replayPositionAt(gapped, 2_500)).toEqual({ timestampMs: 2_500, x: 5, y: 0, mapId: 1, facing: 0 });
    expect(replayPositionAt(gapped, 5_050)).toBe(gapped[1]);
  });
});

describe("flatYardStep", () => {
  const sample: MapPositionSample = { timestampMs: 0, x: 0.5, y: 0.5, mapId: 595 };

  it("does not invent a yard scale from normalized UI-map coordinates", () => {
    expect(flatYardStep(uiMapPoint, sample, false)).toBeNull();
  });

  it("measures world-coordinate projections", () => {
    const project = (value: MapPositionSample) => ({ leftPercent: value.x * 2, topPercent: value.y * 3 });
    expect(flatYardStep(project, sample, true)).toEqual({
      x: { leftPercent: 2, topPercent: 0 },
      y: { leftPercent: 0, topPercent: 3 },
    });
  });
});

describe("floorBoundsYardStep", () => {
  it("derives normalized floor scale from manifest world bounds", () => {
    expect(floorBoundsYardStep({ minX: -100, maxX: 300, minY: -50, maxY: 150 })).toEqual({
      x: { leftPercent: 0, topPercent: 0.25 },
      y: { leftPercent: 0.5, topPercent: 0 },
    });
  });

  it("requires usable bounds", () => {
    expect(floorBoundsYardStep(undefined)).toBeNull();
    expect(floorBoundsYardStep({ minX: 1, maxX: 1, minY: 0, maxY: 2 })).toBeNull();
  });
});

describe("flatArtworkUnitScale", () => {
  it("keeps compact token geometry fixed while the camera zooms", () => {
    expect(flatArtworkUnitScale()).toBe(0.65);
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

describe("autoFitViewport", () => {
  const at = (x: number, y: number): MapPositionSample => ({ timestampMs: 0, x, y, mapId: 1, facing: 0 });
  // A 1000 x 1000 yd artwork: world y -> left, world x -> top, 0.1 % per yard.
  const project = (sample: MapPositionSample) => ({ leftPercent: sample.y / 10, topPercent: sample.x / 10 });
  const fit = (positions: Map<string, MapPositionSample[]>, bosses: ReadonlySet<string> = new Set()) => {
    const bounds = unitFocusBounds(positions, 1, project, bosses)!;
    const centre = focusCentre(positions, 1, bosses)!;
    return autoFitViewport(bounds, {
      minSpanYards: AUTO_FIT_MIN_SPAN_YARDS,
      scale: projectionScale(project, centre.sample),
      centre: centre.fromFocus ? project(centre.sample) : null,
    });
  };
  // The zoom that shows `yards` across the view on this artwork.
  const zoomForYards = (yards: number) => 1000 / yards;

  it("measures the projection's percent per yard, even at the artwork edge", () => {
    expect(projectionScale(project, at(500, 500))).toEqual({ left: 0.1, top: 0.1 });
    const clamped = (sample: MapPositionSample) => ({ leftPercent: Math.min(100, sample.y / 10), topPercent: Math.min(100, sample.x / 10) });
    expect(projectionScale(clamped, at(1000, 1000))).toEqual({ left: 0.1, top: 0.1 });
    expect(projectionScale(() => null, at(0, 0))).toBeNull();
  });

  it("frames a tiny fight at the minimum span, the boss at the centre", () => {
    const positions = new Map([
      ["boss", [at(500, 505)]],
      ["tank", [at(498, 503)]],
      ["healer", [at(510, 520)]],
      ["mage", [at(495, 500)]],
    ]);
    const viewport = fit(positions, new Set(["boss"]));
    expect(viewport.zoom).toBeCloseTo(zoomForYards(AUTO_FIT_MIN_SPAN_YARDS * 1.3));
    expect(viewport.centerX).toBeCloseTo(0.505);
    expect(viewport.centerY).toBeCloseTo(0.5);
  });

  it("frames a wide fight on its bounds, biased towards the boss without zooming out", () => {
    const positions = new Map([
      ["boss", [at(500, 510)]],
      ["west", [at(500, 440)]],
      ["east", [at(500, 560)]],
    ]);
    const viewport = fit(positions, new Set(["boss"]));
    expect(viewport.zoom).toBeCloseTo(zoomForYards(120 * 1.3));
    // The box centre is at y 500; the slack (156 - 120 * 1.15) / 2 = 9 yd moves it towards the boss.
    expect(viewport.centerX).toBeCloseTo(0.509);
  });

  it("centres a boss-less fight on its units", () => {
    const positions = new Map([
      ["a", [at(500, 500)]],
      ["b", [at(510, 530)]],
    ]);
    const viewport = fit(positions);
    expect(viewport.zoom).toBeCloseTo(zoomForYards(AUTO_FIT_MIN_SPAN_YARDS * 1.3));
    expect(viewport.centerX).toBeCloseTo(0.515);
    expect(viewport.centerY).toBeCloseTo(0.505);
  });

  it("leaves stragglers past the 80 yd clamp out of the fit", () => {
    const pack = new Map([
      ["boss", [at(500, 500)]],
      ["tank", [at(505, 505)]],
    ]);
    const withStraggler = new Map([...pack, ["straggler", [at(500, 700)]]]);
    expect(fit(withStraggler, new Set(["boss"]))).toEqual(fit(pack, new Set(["boss"])));
  });

  it("keeps the old fit without a minimum span", () => {
    expect(autoFitViewport({ minLeft: 40, maxLeft: 50, minTop: 45, maxTop: 50 }))
      .toEqual(fitViewportToBounds({ minLeft: 40, maxLeft: 50, minTop: 45, maxTop: 50 }));
  });

  it("eases between viewports", () => {
    const from = { centerX: 0.5, centerY: 0.5, zoom: 1 };
    const to = { centerX: 0.7, centerY: 0.3, zoom: 16 };
    expect(interpolateViewport(from, to, 0)).toEqual(from);
    expect(interpolateViewport(from, to, 0.5)).toEqual({ centerX: 0.6, centerY: 0.4, zoom: 4 });
    expect(interpolateViewport(from, to, 1)).toBe(to);
  });
});

describe("map framing", () => {
  const fitted = { centerX: 0.4, centerY: 0.6, zoom: 17 };
  const zoomTimes = (viewport: MapViewport, factor: number, times: number) =>
    Array.from({ length: times }).reduce<MapViewport>((current) => zoomViewportAt(current, factor, 0.3, 0.7), viewport);

  it("applies the default framing on a new selection", () => {
    const framing = reconcileMapFraming(INITIAL_MAP_FRAMING, "kresh|kresh", fitted);
    expect(framing).toMatchObject({ revision: 1, viewport: null, manual: false });
    // A replay tick or re-render with the same fit changes nothing.
    expect(reconcileMapFraming(framing, "kresh|kresh", { ...fitted })).toBe(framing);
    // The fit itself changing (e.g. floor) re-fits while untouched.
    expect(reconcileMapFraming(framing, "kresh|kresh", FULL_MAP_VIEWPORT).revision).toBe(2);
  });

  it("lets manual zoom reach both bounds and keeps it across ticks and filter changes", () => {
    const framing = reconcileMapFraming(INITIAL_MAP_FRAMING, "kresh|kresh", fitted);
    const zoomedIn = zoomTimes(fitted, 1.5, 40);
    expect(zoomedIn.zoom).toBe(MAX_MAP_ZOOM);
    const zoomedOut = zoomTimes(zoomedIn, 0.5, 40);
    expect(zoomedOut).toEqual(FULL_MAP_VIEWPORT);

    for (const manualViewport of [zoomedIn, zoomedOut]) {
      const manual = manualMapFraming(framing, manualViewport);
      expect(manual.revision).toBe(framing.revision);
      // Replay tick: same selection and fit.
      expect(reconcileMapFraming(manual, "kresh|kresh", fitted)).toBe(manual);
      // Filter change: the scene reprocesses and the fit comes back different.
      expect(reconcileMapFraming(manual, "kresh|kresh", { ...fitted, zoom: 12 })).toBe(manual);
      expect(manual.viewport).toBe(manualViewport);
    }
  });

  it("re-frames on a new encounter, Fit or Reset", () => {
    const manual = manualMapFraming(reconcileMapFraming(INITIAL_MAP_FRAMING, "kresh|kresh", fitted), { centerX: 0.5, centerY: 0.5, zoom: 3 });
    expect(reconcileMapFraming(manual, "mutanus|mutanus", fitted)).toMatchObject({ revision: 2, viewport: null, manual: false });
    expect(pinMapFraming(manual, fitted)).toMatchObject({ revision: 2, viewport: fitted, manual: false });
    expect(pinMapFraming(manual, FULL_MAP_VIEWPORT)).toMatchObject({ revision: 2, viewport: FULL_MAP_VIEWPORT, manual: false });
  });
});

describe("free overview camera", () => {
  // A square map in a wide shell: covering it overflows top and bottom.
  const shell = { width: 400, height: 200 };
  const canvas = { width: 100, height: 100 };
  const rect = coverMapCanvasRect(shell, canvas);

  it("covers the shell with no bars, centred", () => {
    expect(rect).toEqual({ left: 0, top: -100, width: 400, height: 400 });
    // Zooming out to 0.5 fits the whole map.
    expect(containScaleForCover(shell, canvas)).toBe(0.5);
  });

  it("lets the map be dragged mostly off screen, keeping a sliver visible", () => {
    const farRight = clampFreeMapCamera({ scale: 1, x: 10_000, y: 0 }, rect, shell, 0.5);
    expect(farRight.x).toBe(shell.width - 48);
    const farUp = clampFreeMapCamera({ scale: 1, x: 0, y: -10_000 }, rect, shell, 0.5);
    // Its bottom edge stays 48px inside the top of the shell.
    expect(rect.top + farUp.y + rect.height).toBe(48);
  });

  it("frames a route that the covering rect would crop", () => {
    // Spans the full map height, which the cover crops in a wide shell.
    const points = [{ leftPercent: 40, topPercent: 2 }, { leftPercent: 60, topPercent: 98 }];
    const camera = fitFreeMapCameraToPoints(points, rect, shell, 0.5);
    for (const point of points) {
      const y = rect.top + camera.y + (point.topPercent / 100) * rect.height * camera.scale;
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(shell.height);
    }
  });

  it("zooms between the fit-whole scale and 5 about the focal point", () => {
    expect(clampFreeMapCamera({ scale: 0.1, x: 0, y: 0 }, rect, shell, 0.5).scale).toBe(0.5);
    expect(clampFreeMapCamera({ scale: 9, x: 0, y: 0 }, rect, shell, 0.5).scale).toBe(5);
    // The map point under the cursor stays under it.
    const focal = { x: 100, y: 50 };
    const zoomed = zoomFreeMapCamera({ scale: 1, x: 0, y: 0 }, 2, focal, rect, shell, 0.5);
    const mapX = (focal.x - rect.left - zoomed.x) / zoomed.scale;
    const mapY = (focal.y - rect.top - zoomed.y) / zoomed.scale;
    expect(mapX).toBeCloseTo(focal.x - rect.left);
    expect(mapY).toBeCloseTo(focal.y - rect.top);
  });
});
