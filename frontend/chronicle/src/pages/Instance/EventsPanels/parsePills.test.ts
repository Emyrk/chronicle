import { describe, expect, it } from "vitest";
import type { InstanceParsePlayer } from "@/api/typesGenerated";
import { cohortBucketLabel } from "./parsePills";

const player = {
  player_class: "Druid",
  player_spec: "Feral",
  player_sub_spec: "Bear",
} as InstanceParsePlayer;

describe("cohortBucketLabel", () => {
  it("includes the sub-spec in spec cohort labels", () => {
    expect(cohortBucketLabel(player, "spec")).toBe("Feral (Bear) Druid");
  });

  it("keeps class cohorts class-only", () => {
    expect(cohortBucketLabel(player, "class")).toBe("Druid");
  });
});
