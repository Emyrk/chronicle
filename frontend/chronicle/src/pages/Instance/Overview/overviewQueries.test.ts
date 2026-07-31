import { describe, expect, it } from "vitest";
import { speedrunPopulationQueryKey } from "./overviewQueries";

describe("speedrunPopulationQueryKey", () => {
  it("uses an Overview-specific key for normalized single-instance data", () => {
    expect(speedrunPopulationQueryKey({ kind: "instance", instanceId: "raid-1" }))
      .toEqual(["rankings", "speedrun-population", "instance", "raid-1"]);
  });

  it("deduplicates cohort requests by anchor, scope, and window", () => {
    expect(speedrunPopulationQueryKey({
      kind: "cohort",
      scope: "guild",
      anchorInstanceId: "raid-1",
      lookbackDays: 60,
    })).toEqual(["rankings", "speedrun-cohort", "raid-1", "guild", 60]);
  });
});
