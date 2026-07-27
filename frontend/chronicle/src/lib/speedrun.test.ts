import { describe, expect, it } from "vitest";
import type { SpeedrunRequirement } from "@/api/typesGenerated";
import { formatSpeedrunRequirementBefore } from "./speedrun";

function requirement(
  before?: SpeedrunRequirement["before"],
): SpeedrunRequirement {
  return {
    name: "Molten Giants",
    entry_ids: [11658],
    count: 2,
    category: "Trash",
    before,
  };
}

describe("formatSpeedrunRequirementBefore", () => {
  it("formats combined total-kill and boss-kill deadlines", () => {
    expect(
      formatSpeedrunRequirementBefore(
        requirement({ total_kills: 6, boss_kills: 1 }),
      ),
    ).toBe("within first 6 kills and before first boss kill");
  });

  it("returns null when no deadline is configured", () => {
    expect(formatSpeedrunRequirementBefore(requirement())).toBeNull();
  });
});
