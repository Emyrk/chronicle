import { describe, expect, it } from "vitest";
import type { UnitSearchOption } from "./UnitSearch";
import { compareUnitSearchOptions, scoreUnitSearchMatch } from "./unitSearchMatch";

const friendly: UnitSearchOption = {
  guid: "0x0000000000000001",
  name: "Brannor",
  relation: "friendly",
  group: "player",
};

const hostile: UnitSearchOption = {
  guid: "0xF130000001000001",
  name: "Solnius",
  relation: "hostile",
  group: "enemy",
};

describe("scoreUnitSearchMatch", () => {
  it("matches both friendly and hostile units by name", () => {
    expect(scoreUnitSearchMatch("bran", friendly)).toBeGreaterThan(0);
    expect(scoreUnitSearchMatch("sol", hostile)).toBeGreaterThan(0);
  });

  it("matches GUID fragments and rejects unrelated queries", () => {
    expect(scoreUnitSearchMatch("f130", hostile)).toBe(50);
    expect(scoreUnitSearchMatch("thessaly", friendly)).toBeNull();
  });

  it("sorts players before friendlies before enemies, with GUID names last", () => {
    const options: UnitSearchOption[] = [
      { guid: "enemy-guid", name: "Solnius", relation: "hostile", group: "enemy" },
      { guid: "pet-guid", name: "Wolf", relation: "friendly", group: "friendly" },
      { guid: "player-guid", name: "Brannor", relation: "friendly", group: "player" },
      { guid: "unknown-player", name: "0x0000", relation: "friendly", group: "player" },
      { guid: "named-player", name: "Aelora", relation: "friendly", group: "player" },
      { guid: "unknown-enemy", name: "0xF130", relation: "hostile", group: "enemy" },
    ];

    expect([...options].sort(compareUnitSearchOptions).map((unit) => unit.name)).toEqual([
      "Aelora",
      "Brannor",
      "0x0000",
      "Wolf",
      "Solnius",
      "0xF130",
    ]);
  });

  it("prioritizes exact names over prefixes and substring matches", () => {
    const exact = scoreUnitSearchMatch("brannor", friendly) ?? 0;
    const prefix = scoreUnitSearchMatch("bran", friendly) ?? 0;
    const substring = scoreUnitSearchMatch("ann", friendly) ?? 0;

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
  });
});
