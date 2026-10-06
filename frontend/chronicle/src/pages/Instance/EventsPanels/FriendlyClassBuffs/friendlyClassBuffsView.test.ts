import { describe, expect, it } from "vitest";
import type { FriendlyClassBuffSpell } from "@/api/classBuffs";
import type { FriendlyBuffEntityUsage } from "./friendlyClassBuffs.processor";
import { buildAllowedFriendlyClassBuffs, buildFriendlyBuffMatrix } from "./friendlyClassBuffsView";

const FORTITUDE: FriendlyClassBuffSpell = {
  id: 1243,
  name: "Power Word: Fortitude",
  name_subtext: "Rank 1",
  targeting: "friendly",
  ignored: false,
  effects: [],
};

const FORTITUDE_RANK_2: FriendlyClassBuffSpell = {
  ...FORTITUDE,
  id: 1244,
  name_subtext: "Rank 2",
};

function entity(
  id: string,
  name: string,
  otherID: string,
  otherName: string,
  applications: number,
): FriendlyBuffEntityUsage {
  return {
    entityID: id,
    entityName: name,
    className: "Priest",
    applications,
    bySpell: new Map([[1243, {
      spellId: 1243,
      spellName: "Power Word: Fortitude",
      applications,
      otherPlayers: new Map([[otherID, {
        playerID: otherID,
        playerName: otherName,
        className: "Warrior",
        applications,
      }]]),
    }]]),
  };
}

describe("friendly class buff matrix", () => {
  it("inherits opted-in generic buffs for every class", () => {
    const unendingBreath: FriendlyClassBuffSpell = {
      ...FORTITUDE,
      id: 5697,
      name: "Unending Breath",
      name_subtext: "",
    };
    const ignoredGeneric: FriendlyClassBuffSpell = {
      ...FORTITUDE,
      id: 11743,
      name: "Detect Greater Invisibility",
      name_subtext: "",
      ignored: true,
    };

    const allowed = buildAllowedFriendlyClassBuffs({
      Generic: [unendingBreath, ignoredGeneric],
      Priest: [FORTITUDE],
    }, "Priest");

    expect([...allowed.keys()]).toEqual([5697, 1243]);
  });

  it("builds player rows and spell columns", () => {
    const matrix = buildFriendlyBuffMatrix(
      new Map([
        ["alice", entity("alice", "Alice", "tank", "Tank", 2)],
        ["bob", entity("bob", "Bob", "tank", "Tank", 1)],
      ]),
      new Map([[FORTITUDE.id, FORTITUDE]]),
    );

    expect(matrix.columns).toEqual([
      expect.objectContaining({ key: "Power Word: Fortitude", spellId: 1243 }),
    ]);
    expect(matrix.rows.map((row) => [row.playerName, row.applications])).toEqual([
      ["Alice", 2],
      ["Bob", 1],
    ]);
    expect(matrix.rows[0].cells.get("Power Word: Fortitude")).toMatchObject({ applications: 2 });
  });

  it("groups spell ranks into one family column", () => {
    const caster = entity("alice", "Alice", "tank", "Tank", 2);
    caster.bySpell.set(1244, {
      spellId: 1244,
      spellName: "Power Word: Fortitude",
      applications: 1,
      otherPlayers: new Map([["healer", {
        playerID: "healer",
        playerName: "Healer",
        className: "Priest",
        applications: 1,
      }]]),
    });

    const matrix = buildFriendlyBuffMatrix(
      new Map([[caster.entityID, caster]]),
      new Map([
        [FORTITUDE.id, FORTITUDE],
        [FORTITUDE_RANK_2.id, FORTITUDE_RANK_2],
      ]),
    );

    expect(matrix.columns).toHaveLength(1);
    expect(matrix.rows[0].cells.get("Power Word: Fortitude")).toMatchObject({
      applications: 3,
      otherPlayers: [
        expect.objectContaining({ playerName: "Tank", applications: 2 }),
        expect.objectContaining({ playerName: "Healer", applications: 1 }),
      ],
    });
  });

  it("filters Done rows by the selected source class", () => {
    const priest = entity("priest", "Priest", "tank", "Tank", 2);
    const warrior = entity("warrior", "Warrior", "tank", "Tank", 3);
    warrior.className = "Warrior";

    const matrix = buildFriendlyBuffMatrix(
      new Map([[priest.entityID, priest], [warrior.entityID, warrior]]),
      new Map([[FORTITUDE.id, FORTITUDE]]),
      { sourceClassName: "Priest", sourceIsEntity: true },
    );

    expect(matrix.rows.map((row) => row.playerName)).toEqual(["Priest"]);
  });

  it("filters Received applications by the selected source class", () => {
    const target = entity("tank", "Tank", "warrior", "Warrior", 3);
    target.bySpell.get(FORTITUDE.id)?.otherPlayers.set("priest", {
      playerID: "priest",
      playerName: "Priest",
      className: "Priest",
      applications: 1,
    });

    const matrix = buildFriendlyBuffMatrix(
      new Map([[target.entityID, target]]),
      new Map([[FORTITUDE.id, FORTITUDE]]),
      { sourceClassName: "Priest", sourceIsEntity: false },
    );

    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0].applications).toBe(1);
    expect(matrix.rows[0].cells.get(FORTITUDE.name)).toMatchObject({
      applications: 1,
      otherPlayers: [expect.objectContaining({ playerName: "Priest" })],
    });
  });

  it("filters rows by selected players", () => {
    const tank = entity("tank", "Tank", "alice", "Alice", 2);
    const healer = entity("healer", "Healer", "alice", "Alice", 1);
    const matrix = buildFriendlyBuffMatrix(
      new Map([[tank.entityID, tank], [healer.entityID, healer]]),
      new Map([[FORTITUDE.id, FORTITUDE]]),
      { selectedPlayers: new Set(["tank"]) },
    );

    expect(matrix.rows.map((row) => row.playerName)).toEqual(["Tank"]);
  });
});
