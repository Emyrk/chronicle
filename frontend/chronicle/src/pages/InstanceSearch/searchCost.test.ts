import { describe, expect, it } from "vitest";
import type { InstanceSearchFieldsResponse } from "@/api/typesGenerated";
import { EXAMPLES } from "./examples";
import fixture from "./fixtures/searchFields.json";
import { queryCost } from "./searchCost";

const desc = fixture as unknown as InstanceSearchFieldsResponse;

describe("queryCost", () => {
  it("matches the server's compiled cost for every example", () => {
    for (const ex of EXAMPLES) {
      expect({ id: ex.id, cost: queryCost(ex.where, desc).total }).toEqual({ id: ex.id, cost: ex.cost });
    }
  });

  it("is just the base for an empty search", () => {
    expect(queryCost(undefined, desc)).toEqual({ total: 1, parts: [{ label: "Base", cost: 1, count: 1 }] });
  });

  it("groups the breakdown by field and block, most expensive first", () => {
    const cost = queryCost(
      {
        and: [
          { any_player: { field: "player.parse", op: ">=", value: 95 } },
          { any_player: { field: "player.parse", op: ">=", value: 90 } },
          { field: "instance.name", op: "=", value: "Molten Core" },
        ],
      },
      desc,
    );
    expect(cost.total).toBe(1 + 2 * 15 + 2 * 2 + 1);
    expect(cost.parts.map((p) => [p.label, p.cost, p.count])).toEqual([
      ["Parse", 30, 2],
      ["A player block", 4, 2],
      ["Zone", 1, 1],
      ["Base", 1, 1],
    ]);
  });
});
