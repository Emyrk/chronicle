import { describe, expect, it } from "vitest";
import { replayFloorAt, replayFloorTracks } from "./replayFloorInference";
import { resolveMapFloorNumber } from "./mapModel";
import type { MapEncounterPositions } from "./map.processor";
import type { WowMapInstance } from "@/pages/Technical/mapGallery";

const encounter = (id: string, startMs: number): MapEncounterPositions => ({ encounterId: id, startMs, endMs: startMs + 1000,
  positionsByUnit: new Map([["player", [{ timestampMs: startMs, x: 1, y: 1, mapId: 0, synthetic: true }, { timestampMs: startMs + 100, x: 2, y: 2, mapId: 0 }]], ["enemy", [{ timestampMs: startMs, x: 3, y: 3, mapId: 90 }]]]),
} as MapEncounterPositions);
describe("replay floor integration", () => {
  it("uses party samples and encounter map identity without mutating raw telemetry", () => {
    const encounters = new Map([["a", encounter("a", 0)], ["b", encounter("b", 10000)]]);
    const before = JSON.stringify([...encounters.values()].map(e => [...e.positionsByUnit]));
    const tracks = replayFloorTracks(encounters, new Map([["a", 90], ["b", 91]]), new Set(["player"]), 90, { candidates: x => [x] });
    expect(replayFloorAt(tracks, encounters, 0)?.floor).toBe(2);
    expect(replayFloorAt(tracks, encounters, 100)?.floor).toBe(2);
    expect(replayFloorAt(tracks, encounters, 0)?.floor).toBe(2);
    expect(replayFloorAt(tracks, encounters, 5000)).toBeNull();
    expect(replayFloorAt(tracks, encounters, 10000)).toBeNull();
    expect(JSON.stringify([...encounters.values()].map(e => [...e.positionsByUnit]))).toBe(before);
  });
  it("keeps manual and explicit telemetry above the inferred display floor", () => {
    const instance = { floors: [{ floor: 1 }, { floor: 2 }, { floor: 3 }] } as WowMapInstance;
    const sample = { timestampMs: 0, x: 0, y: 0, mapId: 90, floor: 2 };
    expect(resolveMapFloorNumber(instance, 1, [sample], 3)).toBe(1);
    expect(resolveMapFloorNumber(instance, null, [sample], 3)).toBe(2);
    expect(resolveMapFloorNumber(instance, null, [], 3)).toBe(3);
    expect(resolveMapFloorNumber(instance, null, [], null)).toBe(1);
    expect(resolveMapFloorNumber(instance, null, [], 99)).toBe(1);
  });
});
