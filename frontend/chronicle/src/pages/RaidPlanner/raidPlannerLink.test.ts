import { describe, expect, it } from "vitest";
import { raidPlannerLink } from "./raidPlannerLink";

describe("raidPlannerLink", () => {
  it("links a log directly into the planner with its guild", () => {
    expect(
      raidPlannerLink({
        id: "instance-1",
        guild: { id: "guild-1", name: "Raid & Relax" },
      }),
    ).toBe("/raidplanner?raid=instance-1&guild=guild-1&guildName=Raid+%26+Relax");
  });

  it("supports logs without a guild", () => {
    expect(raidPlannerLink({ id: "instance-1" })).toBe("/raidplanner?raid=instance-1");
  });
});
