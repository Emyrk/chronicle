import { describe, expect, it } from "vitest";
import { decodeLuaPanelToken, encodeLuaPanelToken } from "./useUrlState";
import { parseLuaPanelRef, type LuaPanelRef } from "@/pages/Instance/EventsPanels/LuaPanel/luaPanelRegistry";

describe("Lua panel URL tokens", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";

  it("round-trips a channel-following reference", () => {
    const ref: LuaPanelRef = `lua:${id}:main`;
    expect(decodeLuaPanelToken(encodeLuaPanelToken(ref))).toBe(ref);
  });

  it("reads links from before releases as release and main", () => {
    expect(decodeLuaPanelToken(encodeLuaPanelToken(`lua:${id}:unstable` as LuaPanelRef))).toBe(`lua:${id}:main`);
    expect(parseLuaPanelRef(`lua:${id}:stable`)).toEqual({ id, channel: "release" });
  });

  it("does not decode malformed references as a panel", () => {
    expect(decodeLuaPanelToken("y6869")).toBeNull();
    expect(decodeLuaPanelToken("yxyz")).toBeNull();
  });
});
