import { describe, expect, it } from "vitest";
import type { WoWSpell } from "@/api/wowdb";
import {
  parseSpellPlayerLevel,
  spellLevelCapForFlavor,
  spellUsesPlayerLevel,
} from "./spellPlayerLevel";

function makeSpell(overrides: Partial<WoWSpell> = {}): WoWSpell {
  return {
    description: { "0": "Deals damage." },
    aura_description: { "0": "" },
    ...overrides,
  } as WoWSpell;
}

describe("spell player level", () => {
  it("detects $PL in localized text and description variables", () => {
    expect(
      spellUsesPlayerLevel(
        makeSpell({ description: { "0": "Deals ${2*$PL} damage." } }),
      ),
    ).toBe(true);
    expect(
      spellUsesPlayerLevel(
        makeSpell({
          description_variables: "$base=${2*$PL}",
        }),
      ),
    ).toBe(true);
    expect(spellUsesPlayerLevel(makeSpell())).toBe(false);
  });

  it("derives expansion level caps from dataset flavor", () => {
    expect(spellLevelCapForFlavor(["vanilla", "wow-forever"])).toBe(60);
    expect(spellLevelCapForFlavor(["tbc"])).toBe(70);
    expect(spellLevelCapForFlavor(["wrath", "azerothcore"])).toBe(80);
  });

  it("defaults and clamps URL player levels", () => {
    expect(parseSpellPlayerLevel(null, 60)).toBe(60);
    expect(parseSpellPlayerLevel("invalid", 60)).toBe(60);
    expect(parseSpellPlayerLevel("0", 60)).toBe(1);
    expect(parseSpellPlayerLevel("45", 60)).toBe(45);
    expect(parseSpellPlayerLevel("70", 60)).toBe(60);
  });
});
