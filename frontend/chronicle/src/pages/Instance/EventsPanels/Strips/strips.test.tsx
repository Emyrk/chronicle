import { describe, expect, it } from "vitest";
import { isStripType, STRIPS } from "./strips";

describe("strip registration", () => {
  it("recognizes replay layouts and uses the no-op replay processor", () => {
    expect(isStripType("replay")).toBe(true);
    expect(STRIPS.replay.id).toBe("replay_strip");
    expect(STRIPS.replay.streams).toEqual([]);
    expect(STRIPS.replay.supportedOrientations).toEqual(["horizontal"]);
  });

  it("registers the Player Action Timeline as a full-data horizontal strip", () => {
    expect(isStripType("player_action_timeline")).toBe(true);
    expect(STRIPS.player_action_timeline.id).toBe("player_action_timeline_strip");
    expect(STRIPS.player_action_timeline.label).toBe("Player Action Timeline");
    expect(STRIPS.player_action_timeline.streams).toEqual(["spell_go", "spell_start", "spell_fail", "damage", "heal"]);
    expect(STRIPS.player_action_timeline.syncDataMode).toBe("full");
    expect(STRIPS.player_action_timeline.supportedOrientations).toEqual(["horizontal"]);
  });
});
