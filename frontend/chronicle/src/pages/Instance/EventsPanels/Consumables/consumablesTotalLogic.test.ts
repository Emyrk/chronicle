import { describe, expect, it } from "vitest";
import {
  buildConsumableComparisonColumns,
  type ConsumableCount,
  type PlayerConsumablesTotal,
} from "./consumablesTotalLogic";

function consume(key: string, count: number): ConsumableCount {
  return {
    key,
    count,
    itemId: Number(key.replace("item:", "")),
    candidateItemIds: [],
    sources: [],
  };
}

describe("buildConsumableComparisonColumns", () => {
  it("deduplicates consumables across players and orders the most-used columns first", () => {
    const rows: PlayerConsumablesTotal[] = [
      {
        playerId: "p1",
        total: 4,
        consumes: [consume("item:1", 3), consume("item:2", 1)],
      },
      {
        playerId: "p2",
        total: 5,
        consumes: [consume("item:2", 4), consume("item:3", 1)],
      },
    ];

    expect(buildConsumableComparisonColumns(rows).map((column) => column.key)).toEqual([
      "item:2",
      "item:1",
      "item:3",
    ]);
  });

  it("uses the consumable key as a stable tie breaker", () => {
    const rows: PlayerConsumablesTotal[] = [
      {
        playerId: "p1",
        total: 2,
        consumes: [consume("item:20", 1), consume("item:10", 1)],
      },
    ];

    expect(buildConsumableComparisonColumns(rows).map((column) => column.key)).toEqual([
      "item:10",
      "item:20",
    ]);
  });
});
