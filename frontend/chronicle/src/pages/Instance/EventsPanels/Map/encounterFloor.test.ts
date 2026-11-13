import { describe, expect, it } from "vitest";
import { EncounterFloorMemory, encounterFloorScope, estimateEncounterFloor, firstFloorEncounter, instanceNameFloor } from "./encounterFloor";
import type { MapEncounterPositions, MapPositionSample } from "./map.processor";
const encounter = (samples: Partial<MapPositionSample>[]): MapEncounterPositions => ({ positionsByUnit: new Map([["player", samples.map((sample, i) => ({ timestampMs: i, x: 1, y: 1, mapId: 90, ...sample }))]]) } as MapEncounterPositions);
const players = new Set(["player"]);
const support = { candidates: (x: number) => x === 0 ? [] : x === 9 ? [1, 2] : [x] };
const estimate = (samples: Partial<MapPositionSample>[], previous: number | null = null) => estimateEncounterFloor(encounter(samples), 90, [1, 2, 3], players, support, previous);

describe("encounter floor selection", () => {
  it("anchors five selections by chronological start, never input order or playhead", () => {
    const rows = [5, 2, 4, 1, 3].map(n => ({ id: String(n), start_time: `2026-01-01T00:0${n}:00Z`, mapId: 90 }));
    expect(firstFloorEncounter(rows, ["5", "4", "3", "2", "1"])?.id).toBe("1");
    expect(firstFloorEncounter(rows, ["4", "2"])?.id).toBe("2");
    expect(firstFloorEncounter(rows, [])?.id).toBe("1");
  });
  it("selects Scarlet Monastery wings from the parsed instance name", () => {
    const floors = [1, 2, 3, 4];
    expect(instanceNameFloor("Scarlet Monastery Graveyard", 189, floors)).toBe(1);
    expect(instanceNameFloor("Scarlet Monastery Library", 189, floors)).toBe(2);
    expect(instanceNameFloor("Scarlet Monastery Armory", 189, floors)).toBe(3);
    expect(instanceNameFloor("Scarlet Monastery Cathedral", 189, floors)).toBe(4);
    expect(instanceNameFloor("Scarlet Monastery", 189, floors)).toBeNull();
    expect(instanceNameFloor("Scarlet Monastery Armory", 189, [1, 2, 4])).toBeNull();
    expect(instanceNameFloor("Scarlet Monastery Armory", 90, floors)).toBeNull();
  });
  it("scores fresh supported samples and preserves logged precedence", () => {
    expect(estimate([{ x: 1, synthetic: true }, { x: 2 }, { x: 2 }, { x: 1, mapId: 91 }]).floor).toBe(2);
    expect(estimate([{ x: 2, floor: 3 }, { x: 2 }]).source).toBe("telemetry");
    expect(estimate([{ x: 2, floor: 3 }, { x: 2 }]).floor).toBe(3);
    expect(estimate([{ x: 1, synthetic: true }]).uncertain).toBe(true);
  });
  it("uses a plausible previous floor for ties, never overriding clear support", () => {
    expect(estimate([{ x: 9 }], 2)).toMatchObject({ floor: 2, uncertain: true, source: "previous" });
    expect(estimate([{ x: 9 }], 3).floor).toBe(1);
    expect(estimate([{ x: 1 }, { x: 1 }, { x: 2 }], 2).floor).toBe(1);
    expect(estimate([{ x: 0 }])).toMatchObject({ floor: 1, uncertain: true, source: "fallback" });
  });
  it("remembers choices and manual corrections without streaming or seek flicker", () => {
    const memory = new EncounterFloorMemory();
    expect(memory.choose("a", 0, previous => estimate([{ x: 1 }], previous), true).floor).toBe(1);
    // More streamed data cannot revise an already displayed encounter's floor.
    expect(memory.choose("a", 0, previous => estimate([{ x: 2 }], previous), true).floor).toBe(1);
    memory.correct("a", 2);
    expect(memory.correction("a")).toBe(2);
    expect(memory.choose("b", 100, previous => estimate([{ x: 9 }], previous), true).floor).toBe(2);
    expect(memory.choose("a", 0, () => estimate([{ x: 3 }]), true).floor).toBe(1);
    expect(memory.correction("a")).toBe(2);
    memory.correct("a", null);
    expect(memory.correction("a")).toBeNull();
    expect(memory.choose("a", 0, () => estimate([{ x: 3 }]), true).floor).toBe(1);
  });
  it("does not freeze an incomplete first frame before encounter data is ready", () => {
    const memory = new EncounterFloorMemory();
    expect(memory.choose("a", 0, () => estimate([{ x: 1 }]), false).floor).toBe(1);
    expect(memory.has("a")).toBe(false);
    expect(memory.choose("a", 0, () => estimate([{ x: 2 }]), true).floor).toBe(2);
    expect(memory.choose("a", 0, () => estimate([{ x: 3 }]), true).floor).toBe(2);
  });
  it("does not use a later visited encounter as chronological history", () => {
    const memory = new EncounterFloorMemory();
    memory.choose("future", 100, () => estimate([{ x: 2 }]), true);
    expect(memory.choose("earlier", 0, previous => estimate([{ x: 9 }], previous), true).floor).toBe(1);
  });
  it("partitions memory by dataset, instance, map and support revision", () => {
    const keys = [encounterFloorScope("d", "i", 90, "a"), encounterFloorScope("e", "i", 90, "a"), encounterFloorScope("d", "j", 90, "a"), encounterFloorScope("d", "i", 91, "a"), encounterFloorScope("d", "i", 90, "b")];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
