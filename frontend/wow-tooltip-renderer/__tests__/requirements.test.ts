import { describe, expect, it } from "vitest";
import { getSpellTooltipRequirements } from "../src/spell/requirements.js";
import { makeSpell } from "./fixtures.js";

describe("getSpellTooltipRequirements", () => {
  it("follows reachable description variables and reports Life Tap context", () => {
    const lifeTap = makeSpell({
      description: {
        "0": "Converts ${$m1+$SPI*1.5} health into ${$m1*$<mult>+$SPS*.5*$<mult>} mana.",
      },
      description_variables: [
        "$unused=${$AP}",
        "$tap1=$?s18182[${$18182m1*0.01+1}][${1}]",
        "$tap2=$?s18183[${$18183m1*0.01+1}][${$<tap1>}]",
        "$mult=${$<tap2>}",
      ].join("\r\n"),
    });

    expect(getSpellTooltipRequirements(lifeTap)).toEqual({
      numericContextFields: ["spirit", "shadowSpellPower"],
      usesGender: false,
      conditionalSpellIds: [18182, 18183],
      conditionalAuraIds: [],
      referencedSpellIds: [18182, 18183],
      descriptionVariables: ["mult", "tap2", "tap1"],
      unsupportedVariables: [],
    });
  });

  it("reports aura conditionals and recognizes runtime aura values", () => {
    const spell = makeSpell({
      description: {
        "0": "$?a1230587[Mana Well restores $w1 Mana.][]",
      },
    });

    expect(getSpellTooltipRequirements(spell)).toEqual({
      numericContextFields: [],
      usesGender: false,
      conditionalSpellIds: [],
      conditionalAuraIds: [1230587],
      referencedSpellIds: [],
      descriptionVariables: [],
      unsupportedVariables: [],
    });
  });

  it("reports level, combat stats, gender, and unsupported variables", () => {
    const spell = makeSpell({
      description: {
        "0": "At $PL, deals ${$AP+$AR+$SPH+$F} damage to $ghim:her;.",
      },
    });

    expect(getSpellTooltipRequirements(spell)).toEqual({
      numericContextFields: [
        "playerLevel",
        "attackPower",
        "armor",
        "holySpellPower",
      ],
      usesGender: true,
      conditionalSpellIds: [],
      conditionalAuraIds: [],
      referencedSpellIds: [],
      descriptionVariables: [],
      unsupportedVariables: ["$F"],
    });
  });
});
