import { describe, expect, it } from "vitest";
import { inferRoles } from "./roles.processor";
import type { TankInferenceResult } from "./tankInference";

const EMPTY_TANK: TankInferenceResult = { evidence: new Map() };

const players = {
  healer: { name: "Healer", class: "PRIEST" },
  hybrid: { name: "Hybrid", class: "DRUID" },
  support: { name: "Support", class: "PALADIN" },
  dps: { name: "DPS", class: "MAGE" },
  outlier: { name: "Outlier", class: "ROGUE" },
};

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
});
