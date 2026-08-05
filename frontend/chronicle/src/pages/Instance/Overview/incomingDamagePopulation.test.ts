import { describe, expect, it } from "vitest";
import type { SpeedrunCohortOverviewMetrics } from "@/api/typesGenerated";
import { buildIncomingDamageComparisonRows } from "./incomingDamagePopulation";

function overview(
  completeRuns: number,
  abilities: SpeedrunCohortOverviewMetrics["top_incoming_damage_abilities"],
): SpeedrunCohortOverviewMetrics {
  return {
    runs: completeRuns,
    top_incoming_damage_abilities: abilities,
  };
}

describe("buildIncomingDamageComparisonRows", () => {
  it("computes per-run damage from cohort aggregates", () => {
    const rows = buildIncomingDamageComparisonRows(
      overview(1, [{ name: "Shadow Bolt", damage: 1_200, hits: 4, runs: 1, spell_id: 123 }]),
      overview(4, [{ name: "Shadow Bolt", damage: 3_200, hits: 12, runs: 3, spell_id: 123 }]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Shadow Bolt",
      primaryDamagePerRun: 1_200,
      comparisonDamagePerRun: 800,
    });
  });

  it("includes abilities unique to either population", () => {
    const rows = buildIncomingDamageComparisonRows(
      overview(1, [{ name: "Melee", damage: 500, hits: 2, runs: 1 }]),
      overview(2, [{ name: "Lava", damage: 1_800, hits: 6, runs: 2, environment_type: "lava" }]),
    );

    expect(rows.map((row) => row.name)).toEqual(["Lava", "Melee"]);
    expect(rows[0].primaryDamagePerRun).toBeNull();
    expect(rows[1].comparisonDamagePerRun).toBeNull();
  });

  it("sorts by the larger per-run value and applies the limit", () => {
    const rows = buildIncomingDamageComparisonRows(
      overview(1, [
        { name: "A", damage: 100, hits: 1, runs: 1 },
        { name: "B", damage: 300, hits: 1, runs: 1 },
        { name: "C", damage: 200, hits: 1, runs: 1 },
      ]),
      undefined,
      2,
    );

    expect(rows.map((row) => row.name)).toEqual(["B", "C"]);
  });

  it("does not divide by zero when no complete runs are represented", () => {
    const rows = buildIncomingDamageComparisonRows(
      overview(0, [{ name: "Melee", damage: 500, hits: 2, runs: 1 }]),
      undefined,
    );

    expect(rows[0].primaryDamagePerRun).toBeNull();
  });
});
