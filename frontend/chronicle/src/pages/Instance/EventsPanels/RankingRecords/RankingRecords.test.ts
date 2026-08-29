import { describe, expect, it } from "vitest";
import type { InstanceRankingRecord } from "@/api/typesGenerated";
import { createRankingRecordsPanel } from "./RankingRecords";
import { filterRankingRecords } from "./rankingRecordsFilter";

const record = {
  id: "row-1",
  encounter_name: "Baron Geddon",
  player_guid: "0x00000000000197DC",
  player_name: "Roggia",
  player_class: "PALADIN",
  player_spec: "Holy",
  player_role: "dps",
} as InstanceRankingRecord;

describe("Ranking Records panel", () => {
  it("manages its API-backed data independently", () => {
    const panel = createRankingRecordsPanel();
    expect(panel.selfManagesAggregation).toBe(true);
    expect(panel.streams).toEqual([]);
  });

  it("searches player, encounter, role, and GUID fields", () => {
    for (const query of ["roggia", "geddon", "dps", "197dc"]) {
      expect(filterRankingRecords([record], query)).toEqual([record]);
    }
    expect(filterRankingRecords([record], "priest")).toEqual([]);
  });
});
