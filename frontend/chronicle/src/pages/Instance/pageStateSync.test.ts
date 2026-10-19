import { describe, expect, it } from "vitest";
import { samePageState, updateImportedPageState } from "./pageStateSync";

describe("samePageState", () => {
  it("matches separately-created equivalent timeline state", () => {
    const state = {
      encounterId: "encounter-1",
      players: ["player-a", "player-b"],
      align: "pull",
      metric: "damage",
      window: { startMs: 1000, endMs: 5000 },
      pinnedMs: null,
      follow: false,
      debuffTarget: null,
    };
    expect(samePageState(state, structuredClone(state))).toBe(true);
  });

  it("detects a meaningful timeline state change", () => {
    expect(samePageState({ metric: "damage" }, { metric: "healing" })).toBe(false);
  });

  it("does not remount a page for an equivalent remote state", () => {
    const previous = { key: 3, state: { metric: "damage", players: ["a", "b"] } };
    expect(updateImportedPageState(previous, { metric: "damage", players: ["a", "b"] })).toBe(previous);
  });

  it("increments the remount key for a meaningful remote change", () => {
    const previous = { key: 3, state: { metric: "damage" } };
    expect(updateImportedPageState(previous, { metric: "healing" })).toEqual({
      key: 4,
      state: { metric: "healing" },
    });
  });

  it("does not fail on non-serializable values", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(samePageState(cyclic, {})).toBe(false);
  });
});
