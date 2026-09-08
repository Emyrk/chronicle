import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/queries", () => ({
  useSpell: () => ({ data: { id: 133 } }),
}));

vi.mock("@/hooks/useDatasetId", () => ({
  useDatasetId: () => "dataset",
}));

vi.mock("@/components/ui/SpellIconWithTooltip", () => ({
  SpellIconWithTooltip: ({ children }: { children: ReactNode }) => (
    <span data-spell-tooltip-trigger>{children}</span>
  ),
}));

import { SpellCell } from "./SpellCountBreakout";

describe("SpellCell", () => {
  it("uses the spell name as a tooltip trigger and links to the WowDB spell page", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <SpellCell
          spell={{
            spellId: 133,
            spellName: "Fireball",
            successful: 12,
            failed: 1,
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain(
      '<span data-spell-tooltip-trigger="true"><span class="truncate">Fireball</span></span>',
    );
    expect(markup).toContain('href="/wowdb/spell/133"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain("Open Fireball (spell ID 133) in WowDB");
  });
});
