import { describe, expect, it } from "vitest";
import type { InferredRole, PlayerRoleData } from "../Roles/roles.processor";
import { sortStatusSnapshotsByRole } from "./statusRoles";

function role(playerID: string, playerName: string, inferredRole: InferredRole): PlayerRoleData {
  return {
    playerID,
    playerName,
    className: "WARRIOR",
    role: inferredRole,
  };
}

describe("sortStatusSnapshotsByRole", () => {
  it("sorts tanks, healers, and DPS in role order, then alphabetically", () => {
    const snapshots = [
      { unit: { unitId: "dps-b", name: "Zulu" } },
      { unit: { unitId: "healer-b", name: "Yarrow" } },
      { unit: { unitId: "tank-b", name: "Bravo" } },
      { unit: { unitId: "tank-a", name: "Alpha" } },
      { unit: { unitId: "healer-a", name: "Willow" } },
      { unit: { unitId: "dps-a", name: "Xavier" } },
    ];
    const roles = new Map([
      ["dps-b", role("dps-b", "Zulu", "dps")],
      ["healer-b", role("healer-b", "Yarrow", "healer")],
      ["tank-b", role("tank-b", "Bravo", "tank")],
      ["tank-a", role("tank-a", "Alpha", "tank")],
      ["healer-a", role("healer-a", "Willow", "healer")],
      ["dps-a", role("dps-a", "Xavier", "dps")],
    ]);

    expect(sortStatusSnapshotsByRole(snapshots, roles).map(({ unit }) => unit.unitId)).toEqual([
      "tank-a",
      "tank-b",
      "healer-a",
      "healer-b",
      "dps-a",
      "dps-b",
    ]);
  });

  it("treats players without an inferred role as DPS", () => {
    const snapshots = [
      { unit: { unitId: "unknown", name: "Alpha" } },
      { unit: { unitId: "dps", name: "Bravo" } },
      { unit: { unitId: "tank", name: "Zulu" } },
    ];
    const roles = new Map([
      ["dps", role("dps", "Bravo", "dps")],
      ["tank", role("tank", "Zulu", "tank")],
    ]);

    expect(sortStatusSnapshotsByRole(snapshots, roles).map(({ unit }) => unit.unitId)).toEqual([
      "tank",
      "unknown",
      "dps",
    ]);
  });
});
