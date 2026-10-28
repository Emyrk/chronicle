import { describe, expect, it } from "vitest";
import { isStripType, resolveStripType, STRIPS } from "./strips";

describe("strip registration", () => {
  it("recognizes replay layouts and uses the replay controller's processor", () => {
    expect(isStripType("replay")).toBe(true);
    expect(STRIPS.replay.id).toBe("replay_strip");
    expect(STRIPS.replay.streams).toEqual(["damage", "slain"]);
    expect(STRIPS.replay.supportedOrientations).toEqual(["horizontal"]);
  });

  it("loads saved Replay Controller strips as the Replay strip", () => {
    expect(isStripType("replay_controller")).toBe(false);
    expect(resolveStripType("replay_controller")).toBe("replay");
    expect(resolveStripType("replay")).toBe("replay");
    expect(resolveStripType("nope")).toBeNull();
    expect(resolveStripType(undefined)).toBeNull();
  });

  it("reuses the Consumes Used processor for the raid consume cost strip", () => {
    expect(isStripType("consumables_cost")).toBe(true);
    expect(STRIPS.consumables_cost.id).toBe("consumables_ledger");
    expect(STRIPS.consumables_cost.streams).toEqual(["consume"]);
    expect(STRIPS.consumables_cost.supportsFiltering).toBe(true);
    expect(STRIPS.consumables_cost.supportedOrientations).toEqual(["horizontal"]);
  });

  it("registers the Sidekick strip as a stream-free horizontal strip", () => {
    expect(isStripType("sidekick")).toBe(true);
    expect(STRIPS.sidekick.streams).toEqual([]);
    expect(STRIPS.sidekick.supportedOrientations).toEqual(["horizontal"]);
  });
});
