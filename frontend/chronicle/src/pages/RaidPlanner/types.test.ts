import { describe, expect, it } from "vitest";
import type { FavoriteGuild } from "@/api/typesGenerated";
import { defaultPlannerGuild } from "./types";

const favorites = [
  {
    id: "guild-1",
    name: "Raid Night",
    realm_id: "realm-1",
    realm_name: "Tel'Abim",
  },
] satisfies FavoriteGuild[];

describe("defaultPlannerGuild", () => {
  it("uses the first favorite when no guild or saved composition is selected", () => {
    expect(defaultPlannerGuild(null, favorites, false)).toEqual({
      id: "guild-1",
      name: "Raid Night",
    });
  });

  it("keeps the current selection", () => {
    const current = { id: "guild-2", name: "Current Guild" };
    expect(defaultPlannerGuild(current, favorites, false)).toBe(current);
  });

  it("does not choose a favorite for a loaded composition", () => {
    expect(defaultPlannerGuild(null, favorites, true)).toBeNull();
  });
});
