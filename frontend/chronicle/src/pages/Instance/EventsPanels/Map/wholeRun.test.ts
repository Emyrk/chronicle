import { describe, expect, it } from "vitest";
import type { MapEncounterPositions, MapPositionSample } from "./map.processor";
import { createEncounterEffects } from "./replayEffects";
import {
  ENCOUNTER_JUMP_LEAD_MS,
  encounterJumps,
  groupCentre,
  isStaleRunSample,
  mergeRunEncounters,
  RUN_UNIT_STALE_MS,
  WHOLE_RUN_ENCOUNTER_ID,
} from "./wholeRun";

function sample(timestampMs: number, x = 0): MapPositionSample {
  return { timestampMs, x, y: 0, mapId: 43, facing: 0 };
}

function encounter(encounterId: string, startMs: number, endMs: number, units: Record<string, number[]>): MapEncounterPositions {
  return {
    encounterId,
    startMs,
    endMs,
    positionsByUnit: new Map(Object.entries(units).map(([guid, times]) => [guid, times.map((time) => sample(time))])),
    healthByUnit: new Map(),
    effects: createEncounterEffects(),
  };
}

describe("mergeRunEncounters", () => {
  it("returns null without encounters", () => {
    expect(mergeRunEncounters(new Map())).toBeNull();
  });

  it("joins every encounter's tracks and events on one time-ordered clock", () => {
    const later = encounter("b", 5_000, 8_000, { p1: [5_000, 8_000], mob: [6_000] });
    const earlier = encounter("a", 0, 2_000, { p1: [0, 2_000] });
    earlier.effects.events.push({ timestampMs: 1_000 } as never);
    later.effects.events.push({ timestampMs: 6_000 } as never);
    const run = mergeRunEncounters(new Map([["b", later], ["a", earlier]]));
    expect(run?.encounterId).toBe(WHOLE_RUN_ENCOUNTER_ID);
    expect([run?.startMs, run?.endMs]).toEqual([0, 8_000]);
    expect(run?.positionsByUnit.get("p1")?.map((entry) => entry.timestampMs)).toEqual([0, 2_000, 5_000, 8_000]);
    expect(run?.positionsByUnit.get("mob")).toHaveLength(1);
    expect(run?.effects.events.map((event) => event.timestampMs)).toEqual([1_000, 6_000]);
  });

  it("does not mutate the processed encounters", () => {
    const first = encounter("a", 0, 1_000, { p1: [0] });
    const second = encounter("b", 2_000, 3_000, { p1: [2_000] });
    mergeRunEncounters(new Map([["a", first], ["b", second]]));
    expect(first.positionsByUnit.get("p1")).toHaveLength(1);
  });
});

describe("encounterJumps", () => {
  const instanceEncounters = [
    { id: "trash1", name: "Trash", boss: false, start_time: "2026-01-01T00:00:00Z", kill_type: "trash" },
    { id: "boss1", name: "Boss One", boss: true, start_time: "2026-01-01T00:10:00Z", kill_type: "kill" },
    { id: "wipe", name: "Boss Two", boss: true, start_time: "2026-01-01T00:20:00Z", kill_type: "wipe" },
    { id: "boss2", name: "Boss Two", boss: true, start_time: "2026-01-01T00:30:00Z", kill_type: "kill" },
  ];
  const runStart = Date.parse("2026-01-01T00:00:00Z");
  const runEnd = Date.parse("2026-01-01T01:00:00Z");

  it("lists boss kills in order, each jumping to its start less the lead-in", () => {
    const jumps = encounterJumps(instanceEncounters, new Map(), runStart, runEnd);
    expect(jumps.map((jump) => jump.id)).toEqual(["boss1", "boss2"]);
    expect(jumps[0].timestampMs).toBe(Date.parse("2026-01-01T00:10:00Z") - ENCOUNTER_JUMP_LEAD_MS);
    expect(jumps[0].fraction).toBeCloseTo(1 / 6);
    expect(jumps[1].fraction).toBeCloseTo(0.5);
  });

  it("prefers the processed encounter's start and never jumps before the run", () => {
    const processed = new Map([["boss1", encounter("boss1", runStart + 2_000, runStart + 9_000, {})]]);
    const jumps = encounterJumps(instanceEncounters, processed, runStart, runEnd);
    expect(jumps[0].timestampMs).toBe(runStart);
  });
});

describe("groupCentre", () => {
  it("is null with no party", () => {
    expect(groupCentre([])).toBeNull();
  });

  it("takes the median so a straggler does not drag the camera", () => {
    const centre = groupCentre([
      { leftPercent: 10, topPercent: 20 },
      { leftPercent: 12, topPercent: 22 },
      { leftPercent: 11, topPercent: 21 },
      { leftPercent: 90, topPercent: 90 },
      { leftPercent: 11.5, topPercent: 21.5 },
    ]);
    expect(centre).toEqual({ leftPercent: 11.5, topPercent: 21.5 });
  });
});

describe("isStaleRunSample", () => {
  it("expires a track once it stopped reporting", () => {
    expect(isStaleRunSample(sample(0), RUN_UNIT_STALE_MS)).toBe(false);
    expect(isStaleRunSample(sample(0), RUN_UNIT_STALE_MS + 1)).toBe(true);
  });
});
