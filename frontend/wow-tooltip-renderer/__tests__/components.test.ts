import { describe, expect, it } from "vitest";
import {
  getDefaultEffect,
  getDefaultPower,
  getTooltipEffect,
} from "../src/spell/components.js";
import { makeSpell } from "./fixtures.js";

describe("canonical spell components", () => {
  it("selects default effects by explicit sparse index", () => {
    const spell = makeSpell({
      effects: [
        {
          difficulty_id: 0,
          effect_index: 4,
          effect: { value: 10, string: "Heal" },
          effect_base_points: 10,
        },
        {
          difficulty_id: 2,
          effect_index: 0,
          effect: { value: 2, string: "SchoolDamage" },
          effect_base_points: 20,
        },
      ],
    });

    expect(getDefaultEffect(spell, 4)?.effect_base_points).toBe(10);
    expect(getDefaultEffect(spell, 0)).toBeUndefined();
  });

  it("uses the legacy three-slot projection only when effects are absent", () => {
    const legacy = makeSpell({ effect_base_points: [5, 6, 7] });
    expect(getTooltipEffect(legacy, 2)?.effect_base_points).toBe(7);
    expect(getTooltipEffect(legacy, 4)).toBeUndefined();

    const canonical = makeSpell({
      effects: [],
      effect_base_points: [5, 6, 7],
    });
    expect(getTooltipEffect(canonical, 0)).toBeUndefined();
  });

  it("selects the canonical default power by order index and source ID", () => {
    const spell = makeSpell({
      powers: [
        {
          order_index: 1,
          source_id: 1,
          mana_cost: 300,
          mana_cost_per_level: 0,
          mana_per_second: 0,
          power_cost_pct: 0,
          power_type: 0,
        },
        {
          order_index: 0,
          source_id: 9,
          mana_cost: 200,
          mana_cost_per_level: 0,
          mana_per_second: 0,
          power_cost_pct: 0,
          power_type: 0,
        },
        {
          order_index: 0,
          source_id: 3,
          mana_cost: 100,
          mana_cost_per_level: 0,
          mana_per_second: 0,
          power_cost_pct: 0,
          power_type: 0,
        },
      ],
      mana_cost: 999,
    });

    expect(getDefaultPower(spell)?.mana_cost).toBe(100);
  });

  it("names the scalar power fallback for older payloads", () => {
    const spell = makeSpell({ mana_cost: 55, mana_cost_pct: 12 });
    expect(getDefaultPower(spell)).toMatchObject({
      mana_cost: 55,
      power_cost_pct: 12,
      order_index: 0,
    });
  });
});
