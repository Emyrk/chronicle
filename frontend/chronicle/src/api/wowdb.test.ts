import { describe, it, expect } from "vitest";
import {
  resolveSpellDescription,
  extractReferencedSpellIds,
} from "./wowdb";
import { testSpells, spells } from "./testdata/spellTestVectors.generated";

// === DBC-driven regression tests ===
// Spell data is generated from the actual Spell.dbc via:
//   go run ./scripts/dbcdata spell-test-data --ts-dir=frontend/chronicle/src/api/testdata
//
// To add more test cases:
// 1. Add spell IDs to testSpellIDs in scripts/dbcdata/cli/spelltestdata.go
// 2. Run: make gen
// 3. Run: cd frontend/chronicle && npx vitest run src/api/wowdb.test.ts
//    → new spells will fail with "no expected description" showing you the resolved output
// 4. Add the expected description to the map below
// 5. Run tests again to verify

// Expected resolved descriptions for each test spell.
// The key format is "SPELLID" for descriptions, "SPELLID_aura" for aura descriptions.
// When adding a new spell, run the test first — the failure message will show you
// the resolved output so you can verify it's correct and paste it here.
const expectedDescriptions: Record<string, string> = {
  // Fireball rank 1: $s1=14-22 (die roll range), $o2=2 (periodic total), $d=4 sec
  "133": "Hurls a fiery ball that causes 14 to 22 Fire damage and an additional 2 Fire damage over 4 sec.",
  "133_aura": "1 Fire damage every 2 seconds.",

  // Renew rank 1: $o1=45 (periodic total), $d=15 sec
  "139": "Heals the target of 45 damage over 15 sec.",
  "139_aura": "Healing 9 damage every 3 seconds.",

  // Holy Nova: $s1=26-30 (die roll range), $a1=10 (radius), cross-refs spell 23455 for $23455a1 and $23455s1=52-60
  "15237": "Causes an explosion of holy light around the caster, causing 26 to 30 Holy damage to all enemy targets within 10 yards and healing all party members within 10 yards for 52 to 60. Using this spell while in Shadowform damages you instead of healing you. These effects cause reduced threat.",

  // Double Attack: $s1=1, $l pluralization (1 = singular "attack")
  "18941": "Gives the caster 1 extra attack.",

  // Hemorrhage: $s3=5, $n=30, $d=15 sec, $s2=1, $l pluralization (1 = singular "point")
  "17347": "An instant strike that damages the opponent and causes the target to hemorrhage, increasing any Physical damage dealt to the target by up to 5.  Lasts 30 charges or 15 sec.  Awards 1 combo point.",
  "17347_aura": "Increases damage taken by 5.",

  // Dark Harvest: $*8;s1 = 113*8 = 904, $d=8 sec, $s2=30 (reduced by 30%)
  "52551": "Reaps the target's life, dealing 904 Shadow damage over 8 sec. While channeling, the time between periodic ticks of your Affliction spells on the target is reduced by 30%. If the target dies while channeling, the cooldown of Dark Harvest is reset.",
  "52551_aura": "904 Shadow damage over 8 sec.",

  "16511": "An instant strike that deals 110% weapon damage and causes the target to hemorrhage, increasing any Physical damage dealt to the target by 2%.  Lasts 50 charges or 15 sec.  Awards 1 combo point.",
  "16511_aura": "Increases damage taken by 2%.",

  "25175": "Gives the caster 2 extra attacks.",

  "709": "Transfers 145 Health from the target to the caster over 5 sec.",
  "709_aura": "Periodically drains 29 health to the caster.",

  "52550": "Reaps the target's life, dealing 704 Shadow damage over 8 sec. While channeling, the time between periodic ticks of your Affliction spells on the target is reduced by 30%. If the target dies while channeling, the cooldown of Dark Harvest is reset.",
  "52550_aura": "704 Shadow damage over 8 sec.",

  "11712": "Curses the target with agony, causing 780 Shadow damage over 24 sec.  This damage is dealt slowly at first, and builds up as the Curse reaches its full duration.  Only one Curse per Warlock can be active on any one target.",
  "11712_aura": "780 Shadow damage over 24 sec.",

  // Fire Breath: ${$m1*3} inline arithmetic, $m1=3 so ${3*3}=9, $d=2 sec
  "46269": "Targets in a cone in front of the caster take 9 Fire damage over 2 sec.",
  "46269_aura": "Dealing 3 fire damage per second.",

  // Searing Blast: $d1 indexed duration
  "16454": "Blasts a target for 60 Fire damage and increases damage done to target by Fire damage by 10 for 30 sec.",

  // Aftershock: $t unindexed tick interval
  "51839": "Deals 175 to 225 damage after 4.",
  "51839_aura": "175 to 225 Nature damage periodically.",
};

/**
 * Helper: resolve a spell description using the generated test data,
 * automatically building the cross-spell reference map.
 */
function resolveTestSpell(spellId: number, template: string): string {
  const spell = spells[spellId];
  const refIds = extractReferencedSpellIds(template);
  const refMap = new Map(
    refIds.filter((rid) => spells[rid]).map((rid) => [rid, spells[rid]])
  );
  return resolveSpellDescription(spell, template, refMap);
}

describe("resolveSpellDescription", () => {
  testSpells.forEach(({ id, name, descriptionTemplate, auraDescriptionTemplate, crossSpellRefs }) => {
    if (descriptionTemplate) {
      it(`spell ${id} (${name}) description`, () => {
        const resolved = resolveTestSpell(id, descriptionTemplate);
        const expected = expectedDescriptions[String(id)];
        if (expected === undefined) {
          // When adding a new spell, this shows you what the resolver produced
          // so you can verify it and add it to expectedDescriptions.
          expect.fail(
            `No expected description for spell ${id} (${name}).\n` +
            `Template:  ${descriptionTemplate}\n` +
            `Resolved:  ${resolved}\n` +
            `Cross-refs: [${crossSpellRefs.join(", ")}]\n\n` +
            `If the resolved text is correct, add to expectedDescriptions:\n` +
            `  "${id}": ${JSON.stringify(resolved)},`
          );
        }
        expect(resolved).toBe(expected);
      });
    }

    if (auraDescriptionTemplate && auraDescriptionTemplate !== "<empty>") {
      it(`spell ${id} (${name}) aura description`, () => {
        const resolved = resolveTestSpell(id, auraDescriptionTemplate);
        const expected = expectedDescriptions[`${id}_aura`];
        if (expected === undefined) {
          expect.fail(
            `No expected aura description for spell ${id} (${name}).\n` +
            `Template:  ${auraDescriptionTemplate}\n` +
            `Resolved:  ${resolved}\n\n` +
            `If the resolved text is correct, add to expectedDescriptions:\n` +
            `  "${id}_aura": ${JSON.stringify(resolved)},`
          );
        }
        expect(resolved).toBe(expected);
      });
    }
  });
});

describe("gender variable ($g)", () => {
  it("resolves $ghimself:herself; to male form", () => {
    // Use any spell from the test data as a base
    const spell = Object.values(spells)[0];
    const result = resolveSpellDescription(spell, "Damages $ghimself:herself; for $ghis:her; sins.");
    expect(result).toBe("Damages himself for his sins.");
  });

  it("is case-insensitive", () => {
    const spell = Object.values(spells)[0];
    const result = resolveSpellDescription(spell, "$Ghim:her;");
    expect(result).toBe("him");
  });
});

describe("extractReferencedSpellIds", () => {
  it("extracts cross-spell references", () => {
    expect(extractReferencedSpellIds("$3137s1 and $1234d")).toEqual([
      3137, 1234,
    ]);
  });

  it("returns empty for no references", () => {
    expect(extractReferencedSpellIds("$s1 damage over $d")).toEqual([]);
  });

  it("deduplicates IDs", () => {
    expect(extractReferencedSpellIds("$100s1 plus $100s2")).toEqual([100]);
  });

  it("handles empty/null input", () => {
    expect(extractReferencedSpellIds("")).toEqual([]);
  });
});
