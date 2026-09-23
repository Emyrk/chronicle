import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WoWSpell } from "@/api/wowdb";
import { SpellTooltip } from "./SpellTooltip";

vi.mock("@tanstack/react-query", () => ({
  useQueries: () => [],
}));

vi.mock("@/hooks/useDatasetId", () => ({
  useIconBaseUrl: () => undefined,
}));

const spell = {
  id: 1,
  name: { "0": "Test Aura" },
  subtext: { "0": "" },
  description: { "0": "" },
  aura_description: { "0": "" },
  spell_icon: { ID: 0, TextureFilename: "" },
  spell_level: 0,
  school: { value: 1, string: "Holy" },
  power_type: { value: 0, string: "Mana" },
  mana_cost: 0,
  mana_cost_pct: 0,
  casting_time: { ID: 0, Base: 0, PerLevel: 0, Minimum: 0 },
  range: { ID: 0, RangeMin: 0, RangeMax: 0, Flags: 0, Name: "Self" },
  duration: { ID: 0, Duration: 0, DurationPerLevel: 0, MaxDuration: 0 },
  recovery_time: 0,
  category_recovery_time: 0,
  attributes: { blocks: [], string: "" },
  dispel_type: { value: 0, string: "None" },
  mechanic: { value: 0, string: "None" },
} as unknown as WoWSpell;

describe("SpellTooltip", () => {
  it("renders custom footer content below the spell details", () => {
    const markup = renderToStaticMarkup(
      <SpellTooltip
        spell={spell}
        footer={<div>Applied by Brannor</div>}
      />,
    );

    expect(markup).toContain("Test Aura");
    expect(markup).toContain("Applied by Brannor");
    expect(markup.indexOf("Applied by Brannor")).toBeGreaterThan(markup.indexOf("Test Aura"));
  });

  it("renders the canonical default power instead of scalar compatibility fields", () => {
    const canonicalSpell = {
      ...spell,
      mana_cost: 999,
      powers: [
        {
          order_index: 1,
          source_id: 1,
          mana_cost: 200,
          mana_cost_per_level: 0,
          mana_per_second: 0,
          power_cost_pct: 0,
          power_type: 0,
        },
        {
          order_index: 0,
          source_id: 2,
          mana_cost: 45,
          mana_cost_per_level: 0,
          mana_per_second: 0,
          power_cost_pct: 0,
          power_type: 0,
        },
      ],
    } as WoWSpell;

    const markup = renderToStaticMarkup(
      <SpellTooltip spell={canonicalSpell} />,
    );

    expect(markup).toContain("45 Mana");
    expect(markup).not.toContain("999 Mana");
  });
});
