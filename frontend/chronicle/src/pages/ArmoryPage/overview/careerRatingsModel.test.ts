import { describe, expect, it } from "vitest";
import type { CareerPlayerResponse, LeaderboardV2PlayerHistory } from "@/api/typesGenerated";
import { buildRaidRatings, cohortLabel, defaultCohort, raidCoverage } from "./careerRatingsModel";
import careerWarrior from "./fixtures/careerWarrior.json";
import historyWarrior from "./fixtures/historyWarrior.json";

const career = careerWarrior as CareerPlayerResponse;
const history = historyWarrior as LeaderboardV2PlayerHistory;

describe("careerRatingsModel", () => {
  it("defaults to the spec with the highest Mastery", () => {
    expect(cohortLabel(defaultCohort(career.cohorts)!)).toBe("Fury");
  });

  it("keeps server raid values and orders raids with kills first", () => {
    const cohort = defaultCohort(career.cohorts)!;
    const raids = buildRaidRatings(cohort, history, new Map([["Blackwing Lair", new Set(["Razorgore the Untamed", "Missing Boss"])]]));
    expect(raids[0].instanceName).toBe("Blackwing Lair");
    expect(raids[0].mastery).toBeCloseTo(43.94, 1);
    expect(raids[0].bosses[0].encounterName).toBe("Razorgore the Untamed");
    expect(raids[0].missingBosses).toEqual(["Missing Boss"]);
    expect(raids.at(-1)!.kills).toBe(0);
  });

  it("only uses the selected spec's history", () => {
    const prot = career.cohorts.find((c) => c.player_sub_spec === "Fury Prot")!;
    const bwl = buildRaidRatings(prot, history).find((r) => r.instanceName === "Blackwing Lair")!;
    const brood = bwl.bosses.find((b) => b.encounterName === "Broodlord Lashlayer")!;
    expect(brood.kills).toBe(2);
    expect(brood.benchmark).toBeCloseTo(546.19, 1);
  });

  it("counts weighted raids with kills", () => {
    expect(raidCoverage(defaultCohort(career.cohorts)!)).toEqual({ rated: 6, total: 11 });
  });
});
