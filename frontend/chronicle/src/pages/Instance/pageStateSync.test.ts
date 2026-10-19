import { describe, expect, it } from "vitest";
import { samePageState } from "./pageStateSync";

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

  it("does not fail on non-serializable values", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(samePageState(cyclic, {})).toBe(false);
  });
});
