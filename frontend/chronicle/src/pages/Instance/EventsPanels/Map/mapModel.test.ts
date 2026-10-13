import { describe, expect, it } from "vitest";
import type { WowMapManifest } from "@/pages/Technical/mapGallery";
import type { MapEncounterPositions, MapPositionSample } from "./map.processor";
import {
  calibratedDungeonMapPoint,
  clampMapCamera,
  dungeonMapPoint,
  encounterRouteSamples,
  fitMapCameraToPoints,
  fitMapCanvasRect,
  fitMapViewport,
  interpolatedPositionAt,
  latestPositionAt,
  pointInMapViewport,
  projectDungeonMapPoint,
  resolveDungeonMapCalibration,
  resolveMapArtwork,
  selectMapEncounter,
  selectMapJourneyEncounters,
  zoomMapCameraAtPoint,
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

  it("interpolates position and facing between replay samples", () => {
    const result = interpolatedPositionAt(samples, 250);
    expect(result).toMatchObject({ timestampMs: 250, x: 4, y: 5, mapId: 1420 });
    expect(result?.facing).toBeCloseTo(1.5);
    expect(interpolatedPositionAt(samples, 99)).toBeNull();
    expect(interpolatedPositionAt(samples, 999)).toBe(samples[2]);
  });

  it("interpolates facing across the zero-radian boundary", () => {
    const positions: MapPositionSample[] = [
      { timestampMs: 0, x: 0, y: 0, mapId: 1, facing: Math.PI * 1.9 },
      { timestampMs: 100, x: 10, y: 10, mapId: 1, facing: Math.PI * 0.1 },
    ];
    expect(interpolatedPositionAt(positions, 50)?.facing).toBeCloseTo(Math.PI * 2);
  });

  it("contains a wide map without stretching it", () => {
    expect(fitMapCanvasRect(
      { width: 1_600, height: 500 },
      { width: 1_200, height: 800 },
    )).toEqual({ left: 425, top: 0, width: 750, height: 500 });
  });

  it("contains a wide map inside a tall panel", () => {
    expect(fitMapCanvasRect(
      { width: 600, height: 800 },
      { width: 1_200, height: 800 },
    )).toEqual({ left: 0, top: 200, width: 600, height: 400 });
  });

  it("fits an encounter route into the center of the map frame", () => {
    const camera = fitMapCameraToPoints([
      { leftPercent: 20, topPercent: 30 },
      { leftPercent: 40, topPercent: 50 },
    ], { width: 1_000, height: 500 }, 20, 4);

    expect(camera).toMatchObject({ x: -400, y: -350 });
    expect(camera.scale).toBeCloseTo(3);
  });

  it("clamps focused encounter routes to the map edges", () => {
    expect(fitMapCameraToPoints([
      { leftPercent: 90, topPercent: 90 },
    ], { width: 1_000, height: 500 }, 20, 4)).toEqual({
      scale: 4,
      x: -3_000,
      y: -1_500,
    });
  });

  it("zooms around the cursor and keeps the map inside its frame", () => {
    expect(zoomMapCameraAtPoint(
      { scale: 1, x: 0, y: 0 },
      2,
      { x: 25, y: 75 },
      { width: 100, height: 100 },
    )).toEqual({ scale: 2, x: -25, y: -75 });

    expect(clampMapCamera(
      { scale: 3, x: 40, y: -500 },
      { width: 100, height: 80 },
    )).toEqual({ scale: 3, x: 0, y: -160 });
  });

  it("resets panning when zoom returns to the fitted view", () => {
    expect(clampMapCamera(
      { scale: 0.5, x: -40, y: -20 },
      { width: 100, height: 100 },
    )).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("summarizes player movement as a median raid route", () => {
    const routeEncounter: MapEncounterPositions = {
      encounterId: "route",
      startMs: 0,
      endMs: 4_000,
      positionsByUnit: new Map([
        ["player-one", [
          { timestampMs: 500, x: 10, y: 20, mapId: 43, facing: 1 },
          { timestampMs: 2_500, x: 30, y: 40, mapId: 43, facing: 1 },
        ]],
        ["player-two", [
          { timestampMs: 1_000, x: 14, y: 24, mapId: 43, facing: 2 },
          { timestampMs: 3_000, x: 34, y: 44, mapId: 43, facing: 2 },
        ]],
        ["boss", [
          { timestampMs: 1_000, x: 900, y: 900, mapId: 43, facing: 0 },
        ]],
      ]),
    };

    expect(encounterRouteSamples(routeEncounter, (guid) => guid.startsWith("player"))).toEqual([
      { timestampMs: 750, x: 12, y: 22, mapId: 43, facing: 0 },
      { timestampMs: 2_750, x: 32, y: 42, mapId: 43, facing: 0 },
    ]);
  });

  it("falls back to available units when player metadata is unavailable", () => {
    expect(encounterRouteSamples(encounter, () => false, 100)).toEqual(samples.map((sample) => ({
      ...sample,
      facing: 0,
    })));
  });

  it("fits and remaps movement into a padded viewport", () => {
    const viewport = fitMapViewport([
      { leftPercent: 20, topPercent: 30 },
      { leftPercent: 40, topPercent: 50 },
    ], 5, 20);
    expect(viewport).toEqual({ leftPercent: 15, topPercent: 25, spanPercent: 30 });
    expect(pointInMapViewport({ leftPercent: 15, topPercent: 25 }, viewport)).toEqual({
      leftPercent: 0,
      topPercent: 0,
    });
    expect(pointInMapViewport({ leftPercent: 45, topPercent: 55 }, viewport)).toEqual({
      leftPercent: 100,
      topPercent: 100,
    });
  });

  it("keeps fitted viewports inside the map and uses a useful minimum zoom", () => {
    expect(fitMapViewport([{ leftPercent: 2, topPercent: 98 }])).toEqual({
      leftPercent: 0,
      topPercent: 72,
      spanPercent: 28,
    });
    expect(fitMapViewport([])).toEqual({ leftPercent: 0, topPercent: 0, spanPercent: 100 });
  });

  it("selects the encounter containing the replay timestamp", () => {
    const second = { ...encounter, encounterId: "two", startMs: 400, endMs: 600 };
    const encounters = new Map([["one", encounter], ["two", second]]);
    expect(selectMapEncounter(encounters, ["one", "two"], 500)?.encounterId).toBe("two");
    expect(selectMapEncounter(encounters, ["one", "two"], null)?.encounterId).toBe("two");
  });

  it("retains unselected encounters between selected fights", () => {
    const before = { ...encounter, encounterId: "before", startMs: 0, endMs: 50 };
    const transit = { ...encounter, encounterId: "transit", startMs: 350, endMs: 390 };
    const second = { ...encounter, encounterId: "two", startMs: 400, endMs: 600 };
    const after = { ...encounter, encounterId: "after", startMs: 700, endMs: 800 };
    const encounters = new Map([
      [before.encounterId, before],
      [encounter.encounterId, encounter],
      [transit.encounterId, transit],
      [second.encounterId, second],
      [after.encounterId, after],
    ]);

    expect(selectMapJourneyEncounters(encounters, ["one", "two"]).map((item) => item.encounterId)).toEqual([
      "one",
      "transit",
      "two",
    ]);
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

  it("keeps supported Wailing Caverns tracks when another encounter cannot be calibrated", () => {
    const bounds = {
      minX: -375.946014,
      maxX: 560.528992,
      minY: -410.145996,
      maxY: 214.169998,
    };
    const supportedSample = { timestampMs: 1_000, x: 36.81, y: -241.06, mapId: 0, facing: 0 };
    const supportedEncounter = { ...encounter, positionsByUnit: new Map([["boss", [supportedSample]]]) };
    const unsupportedEncounter = { ...encounter, positionsByUnit: new Map([["trash", [supportedSample]]]) };
    const calibrations = [
      resolveDungeonMapCalibration(43, supportedEncounter, () => 3670),
      resolveDungeonMapCalibration(43, unsupportedEncounter, () => undefined),
    ];
    const points = calibrations.flatMap((calibration) => {
      const point = projectDungeonMapPoint(supportedSample, bounds, 43, calibration);
      return point ? [point] : [];
    });
    expect(points).toEqual([{ leftPercent: 19.1, topPercent: 39.5 }]);
  });

  it("fits separately calibrated Wailing Caverns encounters into one viewport", () => {
    const bounds = {
      minX: -375.946014,
      maxX: 560.528992,
      minY: -410.145996,
      maxY: 214.169998,
    };
    const pythasSample = { timestampMs: 1_000, x: 36.81, y: -241.06, mapId: 0, facing: 0 };
    const cobrahnSample = { timestampMs: 1_000, x: 15.04, y: 300.08, mapId: 0, facing: 0 };
    const pythas = { ...encounter, positionsByUnit: new Map([["boss", [pythasSample]]]) };
    const cobrahn = { ...encounter, positionsByUnit: new Map([["boss", [cobrahnSample]]]) };
    const points = [
      calibratedDungeonMapPoint(
        pythasSample,
        bounds,
        resolveDungeonMapCalibration(43, pythas, () => 3670)!,
      )!,
      calibratedDungeonMapPoint(
        cobrahnSample,
        bounds,
        resolveDungeonMapCalibration(43, cobrahn, () => 3671)!,
      )!,
    ];
    const viewport = fitMapViewport(points, 5, 20);
    expect(points).toEqual([
      { leftPercent: 19.1, topPercent: 39.5 },
      { leftPercent: 30.6, topPercent: 43 },
    ]);
    expect(viewport.spanPercent).toBe(21.5);
    expect(pointInMapViewport(points[0], viewport).leftPercent).toBeCloseTo(23.26, 2);
    expect(pointInMapViewport(points[1], viewport).leftPercent).toBeCloseTo(76.74, 2);
  });

  it("requires a known boss position to calibrate Wailing Caverns", () => {
    expect(resolveDungeonMapCalibration(43, encounter, () => undefined)).toBeNull();
    expect(resolveDungeonMapCalibration(533, encounter, () => 3670)).toBeNull();
  });

  it("projects rendered geometry from ordinary world X/Y bounds", () => {
    const bounds = { minX: -200, maxX: 300, minY: -400, maxY: 600 };
    expect(projectDungeonMapPoint(
      { timestampMs: 0, x: bounds.maxX, y: bounds.maxY, mapId: 43, facing: 0 },
      bounds,
      43,
      null,
      true,
    )).toEqual({ leftPercent: 0, topPercent: 0 });
    expect(projectDungeonMapPoint(
      { timestampMs: 0, x: bounds.minX, y: bounds.minY, mapId: 43, facing: 0 },
      bounds,
      43,
      null,
      true,
    )).toEqual({ leftPercent: 100, topPercent: 100 });
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
