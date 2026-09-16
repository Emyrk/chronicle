import { describe, expect, it } from "vitest";
import type { UnitSearchOption } from "./UnitSearch";
import { scoreUnitSearchMatch } from "./unitSearchMatch";

const friendly: UnitSearchOption = {
  guid: "0x0000000000000001",
  name: "Brannor",
  relation: "friendly",
};

const hostile: UnitSearchOption = {
  guid: "0xF130000001000001",
  name: "Solnius",
  relation: "hostile",
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

  it("prioritizes exact names over prefixes and substring matches", () => {
    const exact = scoreUnitSearchMatch("brannor", friendly) ?? 0;
    const prefix = scoreUnitSearchMatch("bran", friendly) ?? 0;
    const substring = scoreUnitSearchMatch("ann", friendly) ?? 0;

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
  });
});
