import { describe, expect, it } from "vitest";
import type { GearTrendsResponse } from "@/api/typesGenerated";
import { formatEquipRate, orderedSlots, trendsState } from "./trendsModel";

function resp(partial: Partial<GearTrendsResponse>): GearTrendsResponse {
  return {
    class: "WARRIOR",
    spec: "Fury",
    lookback_days: 60,
    cohort_size: 40,
    min_sample_size: 20,
    insufficient_sample: false,
    generated_at: "2026-08-05T12:00:00Z",
    slots: [],
    ...partial,
  } as GearTrendsResponse;
}

describe("formatEquipRate", () => {
  it("rounds large rates, keeps a decimal for small ones", () => {
    expect(formatEquipRate(61.4)).toBe("61%");
    expect(formatEquipRate(9.96)).toBe("10.0%");
    expect(formatEquipRate(2.5)).toBe("2.5%");
  });
});

describe("orderedSlots", () => {
  it("orders by paperdoll order and drops empty slots", () => {
    const r = resp({
      slots: [
        { slot: 15, items: [{ item_id: 1, item_name: "", item_quality: 3, item_icon: "", wearer_count: 5, percent: 12.5 }], enchants: [] },
        { slot: 0, items: [{ item_id: 2, item_name: "", item_quality: 4, item_icon: "", wearer_count: 9, percent: 22.5 }], enchants: [] },
        { slot: 4, items: [], enchants: [] },
      ],
    });
    expect(orderedSlots(r).map((s) => s.slot)).toEqual([0, 15]);
  });
});

describe("trendsState", () => {
  it("walks loading → insufficient → empty → ready", () => {
    expect(trendsState(undefined, true)).toBe("loading");
    expect(trendsState(undefined, false)).toBe("loading");
    expect(trendsState(resp({ insufficient_sample: true, cohort_size: 3 }), false)).toBe("insufficient");
    expect(trendsState(resp({ slots: [] }), false)).toBe("empty");
    expect(
      trendsState(
        resp({
          slots: [{ slot: 0, items: [{ item_id: 1, item_name: "", item_quality: 1, item_icon: "", wearer_count: 30, percent: 75 }], enchants: [] }],
        }),
        false,
      ),
    ).toBe("ready");
  });
});
