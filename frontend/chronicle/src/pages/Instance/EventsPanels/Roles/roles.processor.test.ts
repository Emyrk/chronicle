import sharedRoleFixture from "../../../../../../../testdata/roleinfer/roles.json";
import { describe, expect, it } from "vitest";
import { inferRoles } from "./roles.processor";
import { createTankAttemptCounts, inferTanks, type TankInferenceResult } from "./tankInference";

const EMPTY_TANK: TankInferenceResult = { evidence: new Map() };

const players = {
  healer: { name: "Healer", class: "PRIEST" },
  hybrid: { name: "Hybrid", class: "DRUID" },
  support: { name: "Support", class: "PALADIN" },
  dps: { name: "DPS", class: "MAGE" },
  outlier: { name: "Outlier", class: "ROGUE" },
};

interface SharedRoleMetrics {
  damage_done: number;
  healing_done: number;
  incoming_auto_attacks?: Record<string, number>;
}

interface SharedRoleCase {
  name: string;
  players: Record<string, SharedRoleMetrics>;
  expected: Record<string, "tank" | "heal" | "dps">;
}

const sharedCases = (sharedRoleFixture as unknown as { cases: SharedRoleCase[] }).cases;

function tankResultFor(players: Record<string, SharedRoleMetrics>): TankInferenceResult {
  const state = createTankAttemptCounts();
  const sources = new Map<string, Map<string, number>>();
  state.counts.set("fixture", sources);

  for (const [playerId, metrics] of Object.entries(players)) {
    for (const [sourceId, attempts] of Object.entries(metrics.incoming_auto_attacks ?? {})) {
      let targets = sources.get(sourceId);
      if (!targets) {
        targets = new Map();
        sources.set(sourceId, targets);
      }
      targets.set(playerId, attempts);
    }
  }

  return inferTanks(state, ["fixture"]);
}

describe("inferRoles", () => {
  it("uses an observed percentile when a z-score low-DPS cutoff would be negative", () => {
    const result = inferRoles(
      EMPTY_TANK,
      new Map([
        ["healer", 300],
        ["hybrid", 280],
        ["support", 260],
      ]),
      new Map([
        ["healer", 5],
        ["hybrid", 10],
        ["support", 20],
        ["dps", 30],
        ["outlier", 2_000],
      ]),
      players,
    );

    expect(result.debug.meanDamageDone - 0.9 * result.debug.stdDevDamageDone).toBeLessThan(0);
    expect(result.debug.lowDpsCutoff).toBeGreaterThanOrEqual(5);
    expect(result.debug.lowDpsCutoff).toBeLessThan(10);
    expect(result.roles.get("healer")?.role).toBe("healer");
    expect(result.roles.get("hybrid")?.role).toBe("dps");
  });

  it("matches the shared Go role fixture corpus", () => {
    for (const fixtureCase of sharedCases) {
      const healingDone = new Map<string, number>();
      const damageDone = new Map<string, number>();
      const playerInfo: Record<string, { name: string; class: string }> = {};
      for (const [playerId, metrics] of Object.entries(fixtureCase.players)) {
        healingDone.set(playerId, metrics.healing_done);
        damageDone.set(playerId, metrics.damage_done);
        playerInfo[playerId] = { name: playerId, class: "UNKNOWN" };
      }

      const result = inferRoles(tankResultFor(fixtureCase.players), healingDone, damageDone, playerInfo);
      const actual = Object.fromEntries(
        [...result.roles].map(([playerId, role]) => [playerId, role.role === "healer" ? "heal" : role.role]),
      );
      expect(actual, fixtureCase.name).toEqual(fixtureCase.expected);
    }
  });
});
