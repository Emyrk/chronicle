import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { usePlayerCareer } from "@/api/career";
import { useCareerRatings } from "./useCareerRatings";

vi.mock("@/api/career", () => ({
  usePlayerCareer: vi.fn(() => ({ isPending: false })),
  usePlayerRatingHistory: () => ({ isPending: false }),
}));
vi.mock("@/api/queries", () => ({
  useSiteConfig: () => ({ data: { tenant: { id: "tenant" } } }),
  useSupportedInstanceProgressionBosses: () => ({}),
}));

beforeEach(() => vi.clearAllMocks());

function Ratings() {
  const ratings = useCareerRatings({ realm_name: "Any realm", realm_id: "realm-id", id: "player" } as ArmoryPlayer, { career: true, history: true });
  return <span>{ratings.scope}</span>;
}

describe("Armory rating scope URL", () => {
  for (const [query, scope] of [["", "realm"], ["?rating_scope=server", "server"], ["?rating_scope=invalid", "realm"]] as const) {
    it(`uses ${scope} for ${query || "the default view"}`, () => {
      const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/armory/realm/player${query}`]}><Ratings /></MemoryRouter>);
      expect(html).toBe(`<span>${scope}</span>`);
      expect(usePlayerCareer).toHaveBeenCalledWith("tenant", "Any realm", "player", true, scope);
    });
  }
});
