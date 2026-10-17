import { describe, expect, it } from "vitest";
import type { WowMapManualRender } from "@/pages/Technical/mapGallery";
import type { MapEncounterPositions, MapPositionSample } from "./map.processor";
import {
  clampMapCamera,
  encounterRouteSamples,
  fitMapCameraToPoints,
  fitMapCanvasRect,
  fitMapViewport,
  overviewDungeonCanvas,
  pointInMapViewport,
  projectDungeonMapPoint,
  selectMapJourneyEncounters,
  zoomMapCameraAtPoint,
} from "./mapModel";
import { createEncounterEffects } from "./replayEffects";

function mapEncounter(
  encounterId: string,
  startMs: number,
  endMs: number,
  positionsByUnit = new Map<string, MapPositionSample[]>(),
): MapEncounterPositions {
  return {
    encounterId,
    startMs,
    endMs,
    positionsByUnit,
    healthByUnit: new Map(),
    effects: createEncounterEffects(),
  };
}

describe("map route overview model", () => {
  it("contains map artwork without stretching it", () => {
    expect(fitMapCanvasRect(
      { width: 1_600, height: 500 },
      { width: 1_200, height: 800 },
    )).toEqual({ left: 425, top: 0, width: 750, height: 500 });
    expect(fitMapCanvasRect(
      { width: 600, height: 800 },
      { width: 1_200, height: 800 },
    )).toEqual({ left: 0, top: 200, width: 600, height: 400 });
  });

  it("fits, zooms, and clamps route cameras", () => {
    const fitted = fitMapCameraToPoints([
      { leftPercent: 20, topPercent: 30 },
      { leftPercent: 40, topPercent: 50 },
    ], { width: 1_000, height: 500 }, 20, 4);
    expect(fitted.scale).toBeCloseTo(3);
    expect(fitted.x).toBeCloseTo(-400);
    expect(fitted.y).toBeCloseTo(-350);
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

  it("summarizes player movement as a median raid route", () => {
    const encounter = mapEncounter("route", 0, 4_000, new Map([
      ["player-one", [
        { timestampMs: 500, x: 10, y: 20, mapId: 43, facing: 1 },
        { timestampMs: 2_500, x: 30, y: 40, mapId: 43, facing: 1 },
      ]],
      ["player-two", [
        { timestampMs: 1_000, x: 14, y: 24, mapId: 43, facing: 2 },
        { timestampMs: 3_000, x: 34, y: 44, mapId: 43, facing: 2 },
      ]],
      ["boss", [{ timestampMs: 1_000, x: 900, y: 900, mapId: 43, facing: 0 }]],
    ]));

    expect(encounterRouteSamples(encounter, (guid) => guid.startsWith("player"))).toEqual([
      { timestampMs: 750, x: 12, y: 22, mapId: 43, facing: 0 },
      { timestampMs: 2_750, x: 32, y: 42, mapId: 43, facing: 0 },
    ]);
  });

  it("falls back to available units when player metadata is unavailable", () => {
    const samples: MapPositionSample[] = [
      { timestampMs: 100, x: 1, y: 2, mapId: 1420, facing: 1 },
      { timestampMs: 200, x: 3, y: 4, mapId: 1420, facing: 2 },
    ];
    expect(encounterRouteSamples(
      mapEncounter("one", 100, 300, new Map([["unit", samples]])),
      () => false,
      100,
    )).toEqual(samples.map((sample) => ({ ...sample, facing: 0 })));
  });

  it("fits and remaps routes into a padded viewport", () => {
    const viewport = fitMapViewport([
      { leftPercent: 20, topPercent: 30 },
      { leftPercent: 40, topPercent: 50 },
    ], 5, 20);
    expect(viewport).toEqual({ leftPercent: 15, topPercent: 25, spanPercent: 30 });
    expect(pointInMapViewport({ leftPercent: 15, topPercent: 25 }, viewport)).toEqual({ leftPercent: 0, topPercent: 0 });
    expect(pointInMapViewport({ leftPercent: 45, topPercent: 55 }, viewport)).toEqual({ leftPercent: 100, topPercent: 100 });
  });

  it("retains unselected encounters between selected fights", () => {
    const encounters = new Map([
      ["before", mapEncounter("before", 0, 50)],
      ["one", mapEncounter("one", 100, 300)],
      ["transit", mapEncounter("transit", 350, 390)],
      ["two", mapEncounter("two", 400, 600)],
      ["after", mapEncounter("after", 700, 800)],
    ]);
    expect(selectMapJourneyEncounters(encounters, ["one", "two"]).map(({ encounterId }) => encounterId)).toEqual([
      "one",
      "transit",
      "two",
    ]);
  });

  it("prefers manual renders but never borrows calibration from styled or native artwork", () => {
    const floor = { floor: 1, width: 100, height: 80, tileWidth: 50, tileHeight: 40, tiles: [], bounds: { minX: 0, maxX: 10, minY: 0, maxY: 20 } };
    const styled = { path: "styled/map.jpeg", width: 200, height: 160, source: "hand-styled", bounds: floor.bounds };
    const renders: WowMapManualRender = { path: "renders/map.png", width: 300, height: 240 };
    const instance = { mapID: 230, name: "Blackrock Depths", instanceType: 1, directory: "", floors: [floor], styled, renders };
    const defaultCanvas = overviewDungeonCanvas(instance, floor, "renders");
    expect(defaultCanvas).toEqual({ canvas: renders, source: "renders" });
    expect(defaultCanvas.canvas?.bounds).toBeUndefined();
    expect(overviewDungeonCanvas(instance, floor, "styled")).toEqual({ canvas: styled, source: "styled" });
    expect(overviewDungeonCanvas(instance, floor, "art")).toEqual({ canvas: floor, source: "art" });
    expect(overviewDungeonCanvas({ ...instance, renders: { ...renders, bounds: floor.bounds } }, floor, "renders").canvas?.bounds).toEqual(floor.bounds);
    expect(overviewDungeonCanvas({ ...instance, renders: undefined }, floor, "renders")).toEqual({ canvas: styled, source: "styled" });
    expect(overviewDungeonCanvas({ ...instance, styled: undefined, renders: undefined }, floor, "renders")).toEqual({ canvas: floor, source: "art" });
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
});
