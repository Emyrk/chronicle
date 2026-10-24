import { describe, expect, it } from "vitest";
import {
  encodePlayerTimelinePanelOption,
  playerTimelinePanelOptionFromPageState,
  parsePlayerTimelinePanelOption,
  parsePlayerTimelineState,
} from "./playerTimelineState";

describe("parsePlayerTimelineState", () => {
  it("round-trips a valid state", () => {
    const state = {
      encounterId: "enc",
      players: ["a", null],
      align: "first_cast",
      metric: "healing",
      window: { startMs: 1000, endMs: 31000 },
      pinnedMs: 12000,
      follow: true,
      debuffTarget: "boss",
    };
    expect(parsePlayerTimelineState(state)).toEqual(state);
  });

  it("round-trips panel-option state", () => {
    const state = {
      encounterId: "enc",
      players: ["a", "b"] as [string, string],
      align: "pull" as const,
      metric: "damage" as const,
      window: null,
      pinnedMs: 5000,
      follow: false,
      debuffTarget: null,
    };

    expect(parsePlayerTimelinePanelOption(playerTimelinePanelOptionFromPageState(state))).toEqual(state);
    expect(playerTimelinePanelOptionFromPageState({ players: [] })).toBeNull();
    expect(parsePlayerTimelinePanelOption(encodePlayerTimelinePanelOption(state))).toEqual(state);
    expect(parsePlayerTimelinePanelOption("pt:not-base64")).toBeNull();
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
        window: { startMs: 5000, endMs: 100 },
        pinnedMs: -3,
        follow: "yes",
        debuffTarget: 42,
      }),
    ).toEqual({
      encounterId: "enc",
      players: [null, null],
      align: "pull",
      metric: "damage",
      window: null,
      pinnedMs: null,
      follow: false,
      debuffTarget: null,
    });
  });
});
