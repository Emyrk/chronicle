import { describe, expect, it } from "vitest";
import { parsePlayerTimelineState } from "./playerTimelineState";

describe("parsePlayerTimelineState", () => {
  it("round-trips a valid state", () => {
    const state = {
      encounterId: "enc",
      players: ["a", null],
      align: "first_cast",
      ignoredSpellIds: [6603, 11597],
      window: { startMs: 1000, endMs: 31000 },
      pinnedMs: 12000,
      follow: true,
      debuffTarget: "boss",
    };
    expect(parsePlayerTimelineState(state)).toEqual(state);
  });

  it("rejects state without an encounter", () => {
    expect(parsePlayerTimelineState({ players: ["a", "b"] })).toBeNull();
    expect(parsePlayerTimelineState("nope")).toBeNull();
  });

  it("drops invalid fields instead of failing", () => {
    expect(
      parsePlayerTimelineState({
        encounterId: "enc",
        players: [1, ""],
        align: "sideways",
        ignoredSpellIds: [1, "x", NaN],
        window: { startMs: 5000, endMs: 100 },
        pinnedMs: -3,
        follow: "yes",
        debuffTarget: 42,
      }),
    ).toEqual({
      encounterId: "enc",
      players: [null, null],
      align: "pull",
      ignoredSpellIds: [1],
      window: null,
      pinnedMs: null,
      follow: false,
      debuffTarget: null,
    });
  });
});
