import { describe, expect, it } from "vitest";
import type { ParseScoreCohortBucket } from "@/api/typesGenerated";
import {
  DEFAULT_SUB_SPEC_VALUE,
  playerCohortSizeKey,
  selectPlayerCohortSize,
  selectPlayerSubSpec,
} from "./playerCohortState";

function bucket(difficulty: string, maxPlayers: number): ParseScoreCohortBucket {
  return {
    encounter_name: "Ragnaros",
    difficulty_name: difficulty,
    max_players: maxPlayers,
    player_class: "WARRIOR",
    player_spec: "Fury",
    sample_size: 10,
  };
}

describe("selectPlayerSubSpec", () => {
  it("keeps the blank exact bucket selectable as Default beside named sub-specs", () => {
    const selection = selectPlayerSubSpec(["Dual Wield", ""], "Dual Wield");
    expect(selection).toEqual({
      selected: "Dual Wield",
      options: [
        { value: DEFAULT_SUB_SPEC_VALUE, label: "Default" },
        { value: "Dual Wield", label: "Dual Wield" },
      ],
      showControl: true,
    });
    expect(selectPlayerSubSpec(["Dual Wield", ""], "").selected).toBe("");
  });
});

describe("selectPlayerCohortSize", () => {
  it("falls back to the most-populated sorted bucket when the URL key is stale", () => {
    const fallback = bucket("Mythic", 40);
    const selected = selectPlayerCohortSize([fallback, bucket("Normal", 20)], "Retired|10");
    expect(selected).toBe(fallback);
    expect(playerCohortSizeKey(selected!)).toBe("Mythic|40");
  });

  it("preserves an exact URL bucket", () => {
    const exact = bucket("Normal", 20);
    expect(selectPlayerCohortSize([bucket("Mythic", 40), exact], "Normal|20")).toBe(exact);
  });
});
