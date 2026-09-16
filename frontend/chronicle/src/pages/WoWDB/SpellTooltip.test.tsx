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
});
