import { describe, expect, it } from "vitest";
import { decodeLuaPanelToken, encodeLuaPanelToken } from "./useUrlState";
import type { LuaPanelRef } from "@/pages/Instance/EventsPanels/LuaPanel/luaPanelRegistry";

describe("Lua panel URL tokens", () => {
  const ref: LuaPanelRef = "lua:123e4567-e89b-42d3-a456-426614174000:unstable";

  it("round-trips a channel-following reference", () => {
    expect(decodeLuaPanelToken(encodeLuaPanelToken(ref))).toBe(ref);
  });

  it("does not decode malformed references as a panel", () => {
    expect(decodeLuaPanelToken("y6869")).toBeNull();
    expect(decodeLuaPanelToken("yxyz")).toBeNull();
  });
});
