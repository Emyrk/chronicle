import { describe, expect, it } from "vitest";
import {
  buildCommonConsumableEffects,
  groupDatasetsByCandidates,
  type ConsumableDatasetSnapshot,
  type ConsumableEntry,
} from "./commonConsumables";

function item(itemId: number, name: string, buffIds: number[]): ConsumableEntry {
  return {
    item_id: itemId,
    item_name: name,
    item_quality: 1,
    item_icon: "",
    item_spell_ids: [],
    buffs: buffIds.map((id) => ({ id, name: `Buff ${id}` })),
  };
}

function snapshot(datasetId: string, consumables: ConsumableEntry[]): ConsumableDatasetSnapshot {
  return { datasetId, consumables, policies: [] };
}

describe("groupDatasetsByCandidates", () => {
  it("merges datasets with identical candidate lists", () => {
    const shared = [item(10, "Shared", [100]), item(20, "Other", [100])];
    const groups = groupDatasetsByCandidates([
      { datasetId: "one", candidates: shared, policy: undefined },
      { datasetId: "two", candidates: [...shared].reverse(), policy: undefined },
      { datasetId: "three", candidates: [item(10, "Shared", [100])], policy: undefined },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].datasetIds).toEqual(["one", "two"]);
    expect(groups[0].candidates.map((candidate) => candidate.item_id)).toEqual([10, 20]);
    expect(groups[1].datasetIds).toEqual(["three"]);
  });

  it("keeps reused item IDs with different names in separate groups", () => {
    const groups = groupDatasetsByCandidates([
      { datasetId: "one", candidates: [item(10, "First", [100])], policy: undefined },
      { datasetId: "two", candidates: [item(10, "Second", [100])], policy: undefined },
    ]);

    expect(groups).toHaveLength(2);
  });
});

describe("buildCommonConsumableEffects", () => {
  it("tracks support for common and partial candidates", () => {
    const effects = buildCommonConsumableEffects([
      snapshot("one", [item(10, "Shared", [100]), item(20, "Only one", [100])]),
      snapshot("two", [item(10, "Shared", [100]), item(30, "Only two", [100])]),
      snapshot("three", [item(10, "Shared", [100]), item(40, "Only three", [100])]),
    ]);

    expect(effects).toHaveLength(1);
    expect(effects[0].commonCandidates.map((candidate) => candidate.item_id)).toEqual([10]);
    expect(effects[0].candidateSupport.map((candidate) => ({
      itemId: candidate.item.item_id,
      datasetIds: candidate.datasetIds,
    }))).toEqual([
      { itemId: 10, datasetIds: ["one", "two", "three"] },
      { itemId: 20, datasetIds: ["one"] },
      { itemId: 30, datasetIds: ["two"] },
      { itemId: 40, datasetIds: ["three"] },
    ]);
    expect(effects[0].candidateSetsIdentical).toBe(false);
  });

  it("keeps candidates selectable in the datasets where the effect exists", () => {
    const effects = buildCommonConsumableEffects([
      snapshot("one", [item(10, "Shared", [100]), item(20, "Other", [100])]),
      snapshot("two", [item(10, "Shared", [100]), item(20, "Other", [100])]),
      snapshot("three", []),
    ]);

    expect(effects).toHaveLength(1);
    expect(effects[0].commonCandidates).toEqual([]);
    expect(effects[0].candidateSupport.map((candidate) => ({
      itemId: candidate.item.item_id,
      support: candidate.datasetIds.length,
    }))).toEqual([
      { itemId: 10, support: 2 },
      { itemId: 20, support: 2 },
    ]);
    expect(effects[0].missingDatasetIds).toEqual(["three"]);
  });

  it("rejects reused item IDs with different names", () => {
    const effects = buildCommonConsumableEffects([
      snapshot("one", [item(10, "First meaning", [100]), item(20, "Other", [100])]),
      snapshot("two", [item(10, "Second meaning", [100]), item(20, "Other", [100])]),
    ]);

    expect(effects[0].commonCandidates.map((candidate) => candidate.item_id)).toEqual([20]);
    expect(effects[0].candidateSupport.map((candidate) => candidate.item.item_id)).toEqual([20]);
    expect(effects[0].conflictingItemIds).toEqual([10]);
  });

  it("retains differing existing policies for the UI to display", () => {
    const effects = buildCommonConsumableEffects([
      {
        ...snapshot("one", [item(10, "Shared", [100]), item(20, "Other", [100])]),
        policies: [{ effect_kind: "buff", spell_id: 100, item_id: 10, ignored: false }],
      },
      {
        ...snapshot("two", [item(10, "Shared", [100]), item(20, "Other", [100])]),
        policies: [{ effect_kind: "buff", spell_id: 100, item_id: 20, ignored: false }],
      },
    ]);

    expect(effects[0].datasets.map((dataset) => dataset.policy?.item_id)).toEqual([10, 20]);
  });
});
