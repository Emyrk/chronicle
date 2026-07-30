import { describe, expect, it } from "vitest";
import { isStripType, STRIPS } from "./strips";

describe("replay strip registration", () => {
  it("recognizes replay layouts and uses the no-op replay processor", () => {
    expect(isStripType("replay")).toBe(true);
    expect(STRIPS.replay.id).toBe("replay_strip");
    expect(STRIPS.replay.streams).toEqual([]);
    expect(STRIPS.replay.supportedOrientations).toEqual(["horizontal"]);
  });
});
