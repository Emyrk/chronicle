import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { IdentityHeader } from "./IdentityHeader";

vi.mock("@/components/Ads/OwnerAdFreeBadge", () => ({
  OwnerAdFreeBadge: () => null,
}));

const player = {
  id: "player-guid",
  realm_name: "Nordanaar",
  realm_id: "realm-id",
  name: "Thrall",
  class: "SHAMAN",
  race: "Orc",
  gender: "Male",
  level: 60,
  guild_id: "guild-id",
  guild_name: "The Horde",
  gear: [],
  talents: {
    trees: [
      { tab_name: "Elemental", points_spent: 0, ranks: "" },
      { tab_name: "Enhancement", points_spent: 31, ranks: "" },
      { tab_name: "Restoration", points_spent: 20, ranks: "" },
    ],
  },
  updated_at: "2026-11-13T00:00:00Z",
  dataset_id: "dataset-id",
  owner_ads_free: false,
} as unknown as ArmoryPlayer;

describe("IdentityHeader Alt mode entities", () => {
  it("marks the player, guild, and active specialization", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <IdentityHeader player={player} />
      </MemoryRouter>,
    );

    expect(html).toContain('data-entity-kind="character"');
    expect(html).toContain('data-entity-kind="guild"');
    expect(html).toContain('data-entity-kind="spec"');
    expect(html).toContain("Enhancement Shaman");
    expect(html).toContain("player-guid");
    expect(html).toContain("guild-id");
  });
});
