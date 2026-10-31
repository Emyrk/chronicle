import type { ReactNode } from "react";
import type { WoWSpell } from "@/api/wowdb";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useSpellMock } = vi.hoisted(() => ({
  useSpellMock: vi.fn(),
}));

vi.mock("@/api/queries", () => ({
  useSpell: useSpellMock,
}));

vi.mock("@/hooks/useDatasetId", () => ({
  useDatasetId: () => "dataset",
}));

vi.mock("../SpellIconWithTooltip", () => ({
  SpellIconWithTooltip: ({ children }: { children: ReactNode }) => (
    <span data-spell-icon>{children}</span>
  ),
}));

import { SpellIdTooltip } from "./SpellIdTooltip";

describe("SpellIdTooltip", () => {
  beforeEach(() => {
    useSpellMock.mockReset();
  });

  it("renders the fallback name while spell metadata is loading", () => {
    useSpellMock.mockReturnValue({ data: undefined });

    const markup = renderToStaticMarkup(
      <SpellIdTooltip spellId={133} name="Fireball" showRank />,
    );

    expect(markup).toContain("Fireball");
    expect(markup).not.toContain("Rank 11");
    expect(markup).not.toContain("data-spell-icon");
    expect(useSpellMock).toHaveBeenCalledWith("133", "dataset", { enabled: false });
  });

  it("adds the rank after lazily loaded spell metadata becomes available", () => {
    useSpellMock.mockReturnValue({
      data: {
        id: 133,
        subtext: { "0": "Rank 11" },
      },
    });

    const markup = renderToStaticMarkup(
      <SpellIdTooltip spellId={133} name="Fireball" showRank />,
    );

    expect(markup).toContain("data-spell-icon");
    expect(markup).toContain("Fireball");
    expect(markup).toContain("Rank 11");
  });

  it("uses preloaded spell metadata without enabling the query", () => {
    useSpellMock.mockReturnValue({ data: undefined });
    const spell = {
      id: 133,
      subtext: { "0": "Rank 11" },
    } as unknown as WoWSpell;

    const markup = renderToStaticMarkup(
      <SpellIdTooltip spellId={133} name="Fireball" showRank spell={spell} />,
    );

    expect(markup).toContain("data-spell-icon");
    expect(markup).toContain("Rank 11");
    expect(useSpellMock).toHaveBeenCalledWith("133", "dataset", { enabled: false });
  });
});
