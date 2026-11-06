import { describe, expect, it } from "vitest";
import type { InstanceSearchFieldsResponse } from "@/api/typesGenerated";
import { EXAMPLES } from "./examples";
import fixture from "./fixtures/searchFields.json";
import { LEVEL_LIMITS, complexity, nodeCost, queryCost } from "./searchCost";

const desc = fixture as unknown as InstanceSearchFieldsResponse;

describe("queryCost", () => {
  it("matches the server's compiled cost for every example", () => {
    for (const ex of EXAMPLES) {
      expect({ id: ex.id, cost: queryCost(ex.where, desc).total }).toEqual({ id: ex.id, cost: ex.cost });
    }
  });

  it("is just the base for an empty search", () => {
    expect(queryCost(undefined, desc)).toEqual({ total: desc.cost_base, parts: [{ label: "Base", cost: desc.cost_base, count: 1 }] });
  });

  // Weights come from the fixture (the server's registry), so tuning costs
  // in Go doesn't break these.
  const fieldCost = (name: string) => desc.fields.find((f) => f.name === name)!.cost;

  it("groups the breakdown by field and block, most expensive first", () => {
    const cost = queryCost(
      {
        and: [
          { any_player: { field: "player.dps", op: ">=", value: 95 } },
          { any_player: { field: "player.dps", op: ">=", value: 90 } },
          { field: "instance.name", op: "=", value: "Molten Core" },
        ],
      },
      desc,
    );
    const dps = 2 * fieldCost("player.dps");
    const blocks = 2 * desc.cost_any;
    expect(cost.total).toBe(desc.cost_base + dps + blocks + fieldCost("instance.name"));
    expect(cost.parts.find((p) => p.label === "DPS")).toEqual({ label: "DPS", cost: dps, count: 2 });
    expect(cost.parts.find((p) => p.label === "A player block")).toEqual({ label: "A player block", cost: blocks, count: 2 });
    // Most expensive first, with the base always last.
    const own = cost.parts.slice(0, -1).map((p) => p.cost);
    expect(own).toEqual([...own].sort((a, b) => b - a));
    expect(cost.parts.at(-1)?.label).toBe("Base");
  });

  it("includes the selected sort cost", () => {
    const sort = desc.sorts.find((option) => option.field === "instance.player_count")!;
    const cost = queryCost(undefined, desc, { field: sort.field, direction: sort.default_direction });
    expect(cost.total).toBe(desc.cost_base + sort.cost);
    expect(cost.parts).toContainEqual({ label: `Sort: ${sort.label}`, cost: sort.cost, count: 1 });
  });

  it("charges or groups and not", () => {
    const zone = { field: "instance.name", op: "=" as const, value: "Molten Core" };
    const base = queryCost({ and: [zone, zone] }, desc).total;
    expect(queryCost({ or: [zone, zone] }, desc).total).toBe(base + desc.cost_or);
    expect(queryCost({ not: zone }, desc).total).toBe(desc.cost_base + desc.cost_not + fieldCost("instance.name"));
  });
});

describe("nodeCost", () => {
  it("is a block's own share, nested blocks included", () => {
    const dps = { field: "player.dps", op: ">=" as const, value: 95 };
    const block = desc.cost_any + desc.fields.find((f) => f.name === "player.dps")!.cost;
    expect(nodeCost({ any_player: dps }, desc)).toBe(block);
    expect(nodeCost({ not: { any_player: dps } }, desc)).toBe(desc.cost_not + block);
    // Top-level blocks add up to the total, minus the base.
    const tree = { and: [{ any_player: dps }, { field: "instance.name", op: "=" as const, value: "Molten Core" }] };
    expect(tree.and.reduce((sum, n) => sum + nodeCost(n, desc), 0)).toBe(queryCost(tree, desc).total - desc.cost_base);
  });
});

describe("complexity", () => {
  it("rates by cost, and anything over the whole budget is too complex", () => {
    const { light, moderate, heavy } = LEVEL_LIMITS;
    expect([light - 1, light, moderate, heavy].map((c) => complexity(c, 10_000).label)).toEqual(["Light", "Moderate", "Heavy", "Very heavy"]);
    expect(complexity(301, 300).label).toBe("Too complex");
    expect(complexity(301, null).label).toBe("Very heavy");
  });
});
