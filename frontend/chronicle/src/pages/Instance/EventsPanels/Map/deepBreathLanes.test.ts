import { describe, expect, it } from "vitest";
import {
  DEEP_BREATH_LANE_EXTENSION_YARDS,
  deepBreathLaneForSpell,
  extendedDeepBreathLane,
  ONYXIA_DEEP_BREATH_LANES,
} from "./deepBreathLanes";

describe("deepBreathLaneForSpell", () => {
  it.each([
    [17_086, "middle", false],
    [21_140, "middle", true],
    [18_564, "southwest_northeast", false],
    [18_584, "southwest_northeast", true],
    [18_596, "northwest_southeast", false],
    [18_617, "northwest_southeast", true],
  ] as const)("maps Breath spell %i to the fixed %s footprint", (spellId, laneId, reverse) => {
    const selected = deepBreathLaneForSpell(spellId);
    const lane = ONYXIA_DEEP_BREATH_LANES.find((candidate) => candidate.id === laneId)!;
    expect(selected).toEqual({
      lane,
      from: reverse ? lane.to : lane.from,
      to: reverse ? lane.from : lane.to,
    });
  });

  it("does not infer a footprint from an unrelated spell", () => {
    expect(deepBreathLaneForSpell(22_191)).toBeNull();
  });
});

describe("extendedDeepBreathLane", () => {
  it.each(ONYXIA_DEEP_BREATH_LANES)("extends the $id route past both flight waypoints", (lane) => {
    const [from, to] = extendedDeepBreathLane(lane.from, lane.to);
    const waypointLength = Math.hypot(lane.to.x - lane.from.x, lane.to.y - lane.from.y);
    const renderedLength = Math.hypot(to.x - from.x, to.y - from.y);

    expect(renderedLength).toBeCloseTo(waypointLength + DEEP_BREATH_LANE_EXTENSION_YARDS * 2);
    expect(Math.hypot(from.x - lane.from.x, from.y - lane.from.y)).toBeCloseTo(DEEP_BREATH_LANE_EXTENSION_YARDS);
    expect(Math.hypot(to.x - lane.to.x, to.y - lane.to.y)).toBeCloseTo(DEEP_BREATH_LANE_EXTENSION_YARDS);
  });
});