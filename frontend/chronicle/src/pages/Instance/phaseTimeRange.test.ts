import { describe, expect, it } from "vitest";
import type { Encounter, EncounterPhase } from "./InstancePage";
import { activePhaseForTimeRange, phaseTimeRangeSelection } from "./phaseTimeRange";

const phase1: EncounterPhase = {
  id: "phase-1",
  encounter_id: "encounter-1",
  key: "p1",
  name: "Phase 1",
  order: 0,
  start_offset_ms: 0,
  end_offset_ms: 20_000,
  start_time: "2026-01-01T00:00:00.000Z",
  end_time: "2026-01-01T00:00:20.000Z",
  kill_type: "clean",
};

const phase2: EncounterPhase = {
  ...phase1,
  id: "phase-2",
  key: "p2",
  name: "Phase 2",
  order: 1,
  start_offset_ms: 20_000,
  end_offset_ms: 40_000,
  start_time: "2026-01-01T00:00:20.000Z",
  end_time: "2026-01-01T00:00:40.000Z",
};

const encounter: Encounter = {
  id: "encounter-1",
  name: "Test Boss",
  boss: true,
  kill_type: "clean",
  start_time: "2026-01-01T00:00:00.000Z",
  end_time: "2026-01-01T00:00:40.000Z",
  phases: [phase1, phase2],
};

describe("phaseTimeRangeSelection", () => {
  it("single-selects the parent encounter and uses the phase offsets", () => {
    expect(phaseTimeRangeSelection(phase2, encounter.id)).toEqual({
      encounterIds: [encounter.id],
      startOffsetMs: 20_000,
      endOffsetMs: 40_000,
    });
  });
});

describe("activePhaseForTimeRange", () => {
  it("returns the phase whose bounds exactly match the active controller range", () => {
    expect(activePhaseForTimeRange([encounter], true, 20_000, 40_000)).toBe("phase-2");
  });

  it("does not mark a phase active for a custom range", () => {
    expect(activePhaseForTimeRange([encounter], true, 21_000, 39_000)).toBeNull();
  });

  it("requires exactly one selected encounter and an enabled controller", () => {
    expect(activePhaseForTimeRange([encounter], false, 20_000, 40_000)).toBeNull();
    expect(activePhaseForTimeRange([encounter, { ...encounter, id: "encounter-2" }], true, 20_000, 40_000)).toBeNull();
  });
});
