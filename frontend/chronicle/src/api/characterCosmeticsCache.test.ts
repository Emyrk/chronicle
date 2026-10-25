import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { CharacterCosmeticsResponse } from "./typesGenerated";
import { updateCharacterCosmeticsCaches } from "./queries";

const response: CharacterCosmeticsResponse = {
  can_customize: true,
  allowed_ids: [],
  catalog: [],
  characters: [],
};

describe("character cosmetics cache updates", () => {
  it("updates account cosmetics and invalidates every cached instance", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["instanceCosmetics", "raid-one"], { players: {} });
    queryClient.setQueryData(["instanceCosmetics", "raid-two"], { players: {} });
    queryClient.setQueryData(["unrelated"], "fresh");

    await updateCharacterCosmeticsCaches(queryClient, response);

    expect(queryClient.getQueryData(["my-character-cosmetics"])).toBe(response);
    expect(queryClient.getQueryState(["instanceCosmetics", "raid-one"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["instanceCosmetics", "raid-two"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
  });
});
