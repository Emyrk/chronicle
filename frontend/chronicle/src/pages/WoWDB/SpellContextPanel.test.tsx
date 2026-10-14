import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SpellContextPanel } from "./SpellContextPanel";

vi.mock("@/hooks/useDatasetId", () => ({ useIconBaseUrl: () => "" }));

vi.mock("@tanstack/react-query", () => ({
  useQueries: () => [
    {
      data: {
        name: { "0": "Improved Life Tap" },
        subtext: { "0": "Rank 1" },
        spell_icon: {},
      },
    },
    {
      data: {
        name: { "0": "Improved Life Tap" },
        subtext: { "0": "Rank 2" },
        spell_icon: {},
      },
    },
  ],
}));

describe("SpellContextPanel", () => {
  it("shows only the context required by the spell", () => {
    const markup = renderToStaticMarkup(
      <SpellContextPanel
        requirements={{
          numericContextFields: ["spirit", "shadowSpellPower"],
          usesGender: false,
          conditionalSpellIds: [18182, 18183],
          conditionalAuraIds: [],
          referencedSpellIds: [18182, 18183],
          descriptionVariables: ["mult", "tap2", "tap1"],
          unsupportedVariables: [],
        }}
        context={{
          playerLevel: 60,
          spirit: 100,
          shadowSpellPower: 200,
          knownSpellIds: new Set([18182]),
        }}
        locale="0"
        maxPlayerLevel={60}
        onNumericChange={() => undefined}
        onGenderChange={() => undefined}
        onKnownSpellChange={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="Tooltip context"');
    expect(markup).toContain("Spirit");
    expect(markup).toContain("Shadow spell power");
    expect(markup).toContain("Improved Life Tap");
    expect(markup).toContain("$&lt;mult&gt; → $&lt;tap2&gt; → $&lt;tap1&gt;");
    expect(markup).not.toContain("Attack power");
  });
});
