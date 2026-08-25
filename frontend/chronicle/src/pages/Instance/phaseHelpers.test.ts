import { describe, it, expect } from "vitest";
import type { Encounter } from "./InstancePage";
import {
  normalizeSelection,
  deriveEffectiveEncounterIds,
  buildPhaseRanges,
  isEventInSelectedPhases,
  computeSelectedDuration,
  phaseIdsToFlatIndices,
  flatIndicesToPhaseIds,
  encounterSelectionState,
} from "./phaseHelpers";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const makePhase = (id: string, encId: string, order: number, startMs: number, endMs: number) => ({
  id,
  encounter_id: encId,
  key: `phase-${id}`,
  name: `Phase ${id}`,
  order,
  start_offset_ms: startMs,
  end_offset_ms: endMs,
  start_time: new Date(1000000 + startMs).toISOString(),
  end_time: new Date(1000000 + endMs).toISOString(),
});

const encounters: Encounter[] = [
  {
    id: "enc1",
    name: "Boss A",
    boss: true,
    kill_type: "clean",
    start_time: new Date(1000000).toISOString(),
    end_time: new Date(1060000).toISOString(), // 60s
    phases: [
      makePhase("p1", "enc1", 0, 0, 20000),
      makePhase("p2", "enc1", 1, 20000, 40000),
      makePhase("p3", "enc1", 2, 40000, 60000),
    ],
  },
  {
    id: "enc2",
    name: "Trash Pack",
    boss: false,
    kill_type: "clean",
    start_time: new Date(1100000).toISOString(),
    end_time: new Date(1130000).toISOString(), // 30s
    // No phases
  },
  {
    id: "enc3",
    name: "Boss B",
    boss: true,
    kill_type: "clean",
    start_time: new Date(1200000).toISOString(),
    end_time: new Date(1290000).toISOString(), // 90s
    phases: [
      makePhase("p4", "enc3", 0, 0, 45000),
      makePhase("p5", "enc3", 1, 45000, 90000),
    ],
  },
];

// ---------------------------------------------------------------------------
// normalizeSelection
// ---------------------------------------------------------------------------

describe("normalizeSelection", () => {
  it("keeps full encounter and removes child phases", () => {
    const result = normalizeSelection(["enc1"], ["p1", "p2"], encounters);
    expect(result.encounterIds).toEqual(["enc1"]);
    expect(result.phaseIds).toEqual([]);
  });

  it("encounter wins over its child phases when both are selected", () => {
    const result = normalizeSelection(["enc1", "enc2"], ["p1"], encounters);
    // enc1 is selected whole, so p1 (its child) is removed
    expect(result.encounterIds).toContain("enc1");
    expect(result.encounterIds).toContain("enc2");
    expect(result.phaseIds).toEqual([]);
  });

  it("phase-only selection removes parent encounter", () => {
    // Only phase selected, encounter not in the full list
    const result = normalizeSelection(["enc2"], ["p1"], encounters);
    // enc2 stays, p1 derives enc1 as parent but enc1 isn't in encounters
    expect(result.encounterIds).toEqual(["enc2"]);
    expect(result.phaseIds).toEqual(["p1"]);
  });

  it("allows phases from different encounters", () => {
    const result = normalizeSelection([], ["p1", "p4"], encounters);
    expect(result.encounterIds).toEqual([]);
    expect(result.phaseIds).toEqual(["p1", "p4"]);
  });

  it("passes through encounter-only selection unchanged", () => {
    const result = normalizeSelection(["enc1", "enc2"], [], encounters);
    expect(result.encounterIds).toEqual(["enc1", "enc2"]);
    expect(result.phaseIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deriveEffectiveEncounterIds
// ---------------------------------------------------------------------------

describe("deriveEffectiveEncounterIds", () => {
  it("includes parent encounter of selected phases", () => {
    const result = deriveEffectiveEncounterIds(["enc2"], ["p1"], encounters);
    expect(result).toContain("enc1");
    expect(result).toContain("enc2");
  });

  it("deduplicates when encounter is also explicitly selected", () => {
    const result = deriveEffectiveEncounterIds(["enc1"], ["p1"], encounters);
    expect(result).toEqual(["enc1"]);
  });
});

// ---------------------------------------------------------------------------
// buildPhaseRanges
// ---------------------------------------------------------------------------

describe("buildPhaseRanges", () => {
  it("returns empty when no phases selected", () => {
    expect(buildPhaseRanges([], encounters)).toEqual([]);
  });

  it("builds correct ranges", () => {
    const ranges = buildPhaseRanges(["p1", "p5"], encounters);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ encounterID: "enc1", startOffsetMs: 0, endOffsetMs: 20000 });
    expect(ranges[1]).toEqual({ encounterID: "enc3", startOffsetMs: 45000, endOffsetMs: 90000 });
  });
});

// ---------------------------------------------------------------------------
// isEventInSelectedPhases
// ---------------------------------------------------------------------------

describe("isEventInSelectedPhases", () => {
  const ranges = buildPhaseRanges(["p1", "p5"], encounters);

  it("passes event with no ranges", () => {
    expect(isEventInSelectedPhases("enc1", 5000, [])).toBe(true);
  });

  it("passes event in selected phase range", () => {
    expect(isEventInSelectedPhases("enc1", 10000, ranges)).toBe(true);
  });

  it("rejects event outside selected phase range", () => {
    // p2 (20000-40000) is not selected for enc1
    expect(isEventInSelectedPhases("enc1", 25000, ranges)).toBe(false);
  });

  it("passes event in encounter without any phase ranges (whole encounter selected)", () => {
    // enc2 has no phases → no ranges → passes
    expect(isEventInSelectedPhases("enc2", 5000, ranges)).toBe(true);
  });

  it("uses half-open [start, end) — event at boundary belongs to next phase", () => {
    // p1 ends at 20000, p2 starts at 20000; only p1 is selected
    expect(isEventInSelectedPhases("enc1", 19999, ranges)).toBe(true);
    expect(isEventInSelectedPhases("enc1", 20000, ranges)).toBe(false);
  });

  it("event at start of phase is included", () => {
    expect(isEventInSelectedPhases("enc1", 0, ranges)).toBe(true);
    expect(isEventInSelectedPhases("enc3", 45000, ranges)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeSelectedDuration
// ---------------------------------------------------------------------------

describe("computeSelectedDuration", () => {
  it("sums full encounter durations", () => {
    const result = computeSelectedDuration(["enc1", "enc2"], [], encounters);
    // enc1=60s, enc2=30s → 90s
    expect(result).toBe(90000);
  });

  it("sums phase durations", () => {
    const result = computeSelectedDuration([], ["p1", "p5"], encounters);
    // p1=20s, p5=45s → 65s
    expect(result).toBe(65000);
  });

  it("combines encounter and phase durations", () => {
    const result = computeSelectedDuration(["enc2"], ["p1"], encounters);
    // enc2=30s, p1=20s → 50s
    expect(result).toBe(50000);
  });

  it("returns 0 for empty selection", () => {
    expect(computeSelectedDuration([], [], encounters)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// URL flat phase index mapping
// ---------------------------------------------------------------------------

describe("phaseIdsToFlatIndices / flatIndicesToPhaseIds", () => {
  // Flat order: p1(0), p2(1), p3(2), p4(3), p5(4) — enc2 has no phases
  it("maps IDs to sorted flat indices", () => {
    expect(phaseIdsToFlatIndices(["p3", "p1"], encounters)).toEqual([0, 2]);
  });

  it("maps flat indices back to IDs", () => {
    expect(flatIndicesToPhaseIds([0, 2, 4], encounters)).toEqual(["p1", "p3", "p5"]);
  });

  it("round-trips correctly", () => {
    const ids = ["p2", "p5"];
    const indices = phaseIdsToFlatIndices(ids, encounters);
    const recovered = flatIndicesToPhaseIds(indices, encounters);
    expect(new Set(recovered)).toEqual(new Set(ids));
  });

  it("ignores out-of-range indices", () => {
    expect(flatIndicesToPhaseIds([99], encounters)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// encounterSelectionState
// ---------------------------------------------------------------------------

describe("encounterSelectionState", () => {
  it("returns 'full' when encounter is directly selected", () => {
    expect(encounterSelectionState("enc1", ["enc1"], [], encounters[0])).toBe("full");
  });

  it("returns 'partial' when some phases are selected", () => {
    expect(encounterSelectionState("enc1", [], ["p1"], encounters[0])).toBe("partial");
  });

  it("returns 'all-phases' when all phases are selected", () => {
    expect(encounterSelectionState("enc1", [], ["p1", "p2", "p3"], encounters[0])).toBe("all-phases");
  });

  it("returns 'none' when nothing is selected", () => {
    expect(encounterSelectionState("enc1", [], [], encounters[0])).toBe("none");
  });

  it("returns 'none' for encounter without phases when not selected", () => {
    expect(encounterSelectionState("enc2", [], [], encounters[1])).toBe("none");
  });
});
