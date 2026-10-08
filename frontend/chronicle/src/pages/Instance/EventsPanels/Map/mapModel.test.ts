import { describe, expect, it } from "vitest";
import type { WowMapManifest } from "@/pages/Technical/mapGallery";
import type { MapEncounterPositions, MapPositionSample } from "./map.processor";
import {
  latestPositionAt,
  observedBounds,
  observedMapPoint,
  resolveMapArtwork,
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

  it("uses stable full-encounter bounds for instance-relative placement", () => {
    const bounds = observedBounds(encounter, 1420);
    expect(bounds).not.toBeNull();
    const point = observedMapPoint(samples[1], bounds!);
    expect(point?.leftPercent).toBeCloseTo(50);
    expect(point?.topPercent).toBeCloseTo(50);
  });
});
