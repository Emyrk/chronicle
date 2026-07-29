import { describe, expect, it } from "vitest";
import type { StatusUnitSnapshot } from "./statusTimeline";
import { sortStatusEnemySnapshots, statusEnemyRowOpacity } from "./statusEnemies";

function snapshot(unitId: string, name: string): StatusUnitSnapshot {
  return {
    unit: { unitId, name, className: "UNKNOWN", kind: "unit", ownerId: null, events: [] },
    deficit: 0,
    netChange: 0,
    relativeHealthState: {
      current: 0,
      minimum: 0,
      maximum: 0,
      damage: 0,
      effectiveHealing: 0,
      prevented: 0,
      overhealing: 0,
      lastTransition: null,
    },
    relativeHealthBounds: { minimum: 0, maximum: 0 },
    relativeHealthMessages: [],
    damage: 0,
    effectiveHealing: 0,
    absorbed: 0,
    dead: false,
    deadSinceMilli: null,
    activeCast: null,
    recentActivity: [],
    incoming: [],
    incomingDamage: 0,
    incomingHealing: 0,
  };
}

describe("Status enemy rows", () => {
  it("sorts bosses first and alphabetically within each group", () => {
    const rows = [
      snapshot("add-b", "Zulu"),
      snapshot("boss-b", "Bravo"),
      snapshot("boss-a", "Alpha"),
      snapshot("add-a", "Willow"),
    ];
    expect(sortStatusEnemySnapshots(rows, new Set(["boss-a", "boss-b"])).map((row) => row.unit.unitId)).toEqual([
      "boss-a",
      "boss-b",
      "add-a",
      "add-b",
    ]);
  });

  it("fades dead enemies for five seconds before removing them", () => {
    expect(statusEnemyRowOpacity(1_000, 1_000, true)).toBe(1);
    expect(statusEnemyRowOpacity(1_000, 3_500, true)).toBe(0.5);
    expect(statusEnemyRowOpacity(1_000, 5_999, true)).toBeCloseTo(0.0002);
    expect(statusEnemyRowOpacity(1_000, 6_000, true)).toBeNull();
  });

  it("keeps living enemies and ignores death filtering when disabled", () => {
    expect(statusEnemyRowOpacity(null, 10_000, true)).toBe(1);
    expect(statusEnemyRowOpacity(1_000, 10_000, false)).toBe(1);
  });
});
