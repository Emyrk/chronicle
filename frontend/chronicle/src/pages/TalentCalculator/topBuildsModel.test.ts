import { describe, expect, it } from "vitest";
import type { RankingsInstanceSummary } from "@/api/typesGenerated";
import { topBuildRaidNames } from "./topBuildsModel";

describe("topBuildRaidNames", () => {
  it("returns distinct raid names and excludes dungeons", () => {
    const instances = [
      { instance_name: "Deadmines", category: "dungeon" },
      { instance_name: "Molten Core", category: "raid" },
      { instance_name: "Molten Core", category: "raid" },
      { instance_name: "Legacy Instance", category: "" },
    ] as RankingsInstanceSummary[];

    expect(topBuildRaidNames(instances)).toEqual(["Molten Core"]);
  });
});
