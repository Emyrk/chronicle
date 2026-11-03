import { describe, expect, it } from "vitest";
import type { InstanceSearchFieldsResponse } from "@/api/typesGenerated";
import { EXAMPLES } from "./examples";
import fixture from "./fixtures/searchFields.json";
import { complexity, nodeCost, queryCost } from "./searchCost";

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

describe("nodeCost", () => {
  it("is a block's own share, nested blocks included", () => {
    const parse = { field: "player.parse", op: ">=" as const, value: 95 };
    expect(nodeCost({ any_player: parse }, desc)).toBe(2 + 15);
    expect(nodeCost({ not: { any_player: parse } }, desc)).toBe(2 + 15);
    // Top-level blocks add up to the total, minus the base.
    const tree = { and: [{ any_player: parse }, { field: "instance.name", op: "=" as const, value: "Molten Core" }] };
    expect(tree.and.reduce((sum, n) => sum + nodeCost(n, desc), 0)).toBe(queryCost(tree, desc).total - desc.cost_base);
  });
});

describe("complexity", () => {
  it("rates by cost, and anything over the whole budget is too complex", () => {
    expect([5, 12, 40, 80].map((c) => complexity(c, 300).label)).toEqual(["Light", "Moderate", "Heavy", "Very heavy"]);
    expect(complexity(301, 300).label).toBe("Too complex");
    expect(complexity(301, null).label).toBe("Very heavy");
  });
});
