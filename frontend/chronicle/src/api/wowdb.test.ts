import { describe, it, expect } from "vitest";
import {
  resolveSpellDescription,
  extractReferencedSpellIds,
} from "./wowdb";
// The @testdata/spellTestVectors alias resolves to the correct server's
// generated file based on the SERVER env var (see vite.config.ts).
import { testSpells, spells } from "@testdata/spellTestVectors";

// === DBC-driven regression tests ===
// Spell data is generated from the actual Spell.dbc via:
//   go run ./scripts/dbcdata spell-test-data --server=<server> --ts-dir=frontend/chronicle/src/api/testdata
//
// To add more test cases:
// 1. Add spell IDs to the appropriate list in scripts/dbcdata/cli/spelltestdata.go
// 2. Run: make gen
// 3. Run: cd frontend/chronicle && SERVER=<server> npx vitest run src/api/wowdb.test.ts
//    → new spells will fail with "no expected description" showing you the resolved output
// 4. Add the expected description to the server's map below
// 5. Run tests again to verify

const serverName = import.meta.env.VITE_SERVER_NAME ?? "turtle";

// Expected resolved descriptions keyed by server, then "SPELLID" or "SPELLID_aura".
// When adding a new spell, run the test first — the failure message shows the resolved
// output so you can verify it's correct and paste it here.
const expectedByServer: Record<string, Record<string, string>> = {
  turtle: {
    // Fireball rank 1: $s1=14-22, $o2=2, $d=4 sec
    "133": "Hurls a fiery ball that causes 14 to 22 Fire damage and an additional 2 Fire damage over 4 sec.",
    "133_aura": "1 Fire damage every 2 seconds.",

    // Renew rank 1: $o1=45, $d=15 sec
    "139": "Heals the target of 45 damage over 15 sec.",
    "139_aura": "Healing 9 damage every 3 seconds.",

    // Holy Nova
    "15237": "Causes an explosion of holy light around the caster, causing 26 to 30 Holy damage to all enemy targets within 10 yards and healing all party members within 10 yards for 52 to 60. Using this spell while in Shadowform damages you instead of healing you. These effects cause reduced threat.",

    // Double Attack: $l pluralization
    "18941": "Gives the caster 1 extra attack.",

    // Hemorrhage: $l, $n
    "17347": "An instant strike that damages the opponent and causes the target to hemorrhage, increasing any Physical damage dealt to the target by up to 5.  Lasts 30 charges or 15 sec.  Awards 1 combo point.",
    "17347_aura": "Increases damage taken by 5.",

    // Dark Harvest: $*N;s1 arithmetic (Turtle custom)
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

    // Fire Breath: ${$m1*3} inline arithmetic
    "46269": "Targets in a cone in front of the caster take 9 Fire damage over 2 sec.",
    "46269_aura": "Dealing 3 fire damage per second.",

    // Searing Blast: $d1 indexed duration
    "16454": "Blasts a target for 60 Fire damage and increases damage done to target by Fire damage by 10 for 30 sec.",

    // Aftershock: $t unindexed tick interval
    "51839": "Deals 175 to 225 damage after 4.",
    "51839_aura": "175 to 225 Nature damage periodically.",

    // Prophecy Flash Heal Bonus: $/1000;S1 fractional division
    "21973": "-0.1 sec to the casting time of your Flash Heal spell.",
  },

  // Kronos (1.12.1 — vanilla, same as Turtle for most spells but no Turtle-custom spells)
  kronos: {
    "133": "Hurls a fiery ball that causes 14 to 22 Fire damage and an additional 2 Fire damage over 4 sec.",
    "133_aura": "1 Fire damage every 2 seconds.",
    "139": "Heals the target of 45 damage over 15 sec.",
    "139_aura": "Healing 9 damage every 3 seconds.",
    "15237": "Causes an explosion of holy light around the caster, causing 28 to 32 Holy damage to all enemy targets within 10 yards and healing all party members within 10 yards for 52 to 60.  These effects cause no threat.",
    "18941": "Gives the caster 1 extra attack.",
    "17347": "An instant strike that damages the opponent and causes the target to hemorrhage, increasing any Physical damage dealt to the target by up to 5.  Lasts 30 charges or 15 sec.  Awards 1 combo point.",
    "17347_aura": "Increases damage taken by 5.",
    "16511": "An instant strike that damages the opponent and causes the target to hemorrhage, increasing any Physical damage dealt to the target by up to 3.  Lasts 30 charges or 15 sec.  Awards 1 combo point.",
    "16511_aura": "Increases damage taken by 3.",
    "25175": "Gives the caster 2 extra attacks.",
    "709": "Transfers 29 health every second from the target to the caster.  Lasts 5 sec.",
    "709_aura": "Drains 29 health each second to the caster.",
    "11712": "Curses the target with agony, causing 780 Shadow damage over 24 sec.  This damage is dealt slowly at first, and builds up as the Curse reaches its full duration.  Only one Curse per Warlock can be active on any one target.",
    "11712_aura": "780 Shadow damage over 24 sec.",
    // Unbridled Wrath — $h1 (proc chance) not yet resolved
    "12322": "Gives you a $h1% chance to generate an additional Rage point when you deal melee damage with a weapon.",
    "16454": "Blasts a target for 60 Fire damage and increases damage done to target by Fire damage by 10 for 30 sec.",
    "21973": "-0.1 sec to the casting time of your Flash Heal spell.",
  },

  // Epoch (3.3.5a — stock WotLK client, slightly different base_points)
  epoch: {
    "133": "Hurls a fiery ball that causes 13 Fire damage and an additional 0 Fire damage over 4 sec.",
    "133_aura": "0 Fire damage every 2 seconds.",
    "139": "Heals the target for $<total> over 15 sec.",
    "139_aura": "Healing 8 damage every 3 seconds.",
    "15237": "Causes an explosion of holy light around the caster, causing 27 Holy damage to all enemy targets within 10 yards and healing all party members within 10 yards for 51.  These effects cause no threat.",
    "17347": "An instant strike that deals 109% weapon damage (158% if a dagger is equipped) and causes the target to hemorrhage, increasing any Physical damage dealt to the target by up to $<bonus>.  Lasts 10 charges or 15 sec.  Awards 1 combo point.",
    "17347_aura": "Increases damage taken by 20.",
    "16511": "An instant strike that deals 109% weapon damage (158% if a dagger is equipped) and causes the target to hemorrhage, increasing any Physical damage dealt to the target by up to $<bonus>.  Lasts 10 charges or 15 sec.  Awards 1 combo point.",
    "16511_aura": "Increases damage taken by 12.",
    "709": "Transfers 28 health every 1 sec from the target to the caster.  Lasts 5 sec.",
    "709_aura": "Drains 28 health every 1 sec to the caster.",
    "11712": "Curses the target with agony, causing 768 Shadow damage over 24 sec.  This damage is dealt slowly at first, and builds up as the Curse reaches its full duration.  Only one Curse per Warlock can be active on any one target.",
    "11712_aura": "768 Shadow damage over 24 sec.",
    // WotLK spells
    "48461": "Causes 552 Nature damage to the target.",
    "48441": "Heals the target for ${337*5*$<mult>} over 15 sec.",
    "48441_aura": "Heals 337 damage every 3 seconds.",
  },

  // Warmane (3.3.5a — modified client, same base DBC values as stock for these spells)
  warmane: {
    "133": "Hurls a fiery ball that causes 14 to 22 Fire damage and an additional 2 Fire damage over 4 sec.",
    "133_aura": "1 Fire damage every 2 seconds.",
    "139": "Heals the target for 45 over 15 sec.",
    "139_aura": "Healing 9 damage every 3 seconds.",
    "15237": "Causes an explosion of holy light around the caster, causing 28 to 32 Holy damage to all enemy targets within 10 yards and healing all party members within 10 yards for 52 to 60.  These effects cause no threat.",
    "17347": "An instant strike that deals 110% weapon damage and causes the target to hemorrhage, increasing any Physical damage dealt to the target by up to 21.  Lasts 10 charges or 15 sec.  Awards 1 combo point.",
    "17347_aura": "Increases damage taken by 21.",
    "16511": "An instant strike that deals 110% weapon damage and causes the target to hemorrhage, increasing any Physical damage dealt to the target by up to 13.  Lasts 10 charges or 15 sec.  Awards 1 combo point.",
    "16511_aura": "Increases damage taken by 13.",
    "709": "Transfers 29 health every 1 sec from the target to the caster.  Lasts 5 sec.",
    "709_aura": "Drains 29 health every 1 sec to the caster.",
    "11712": "Curses the target with agony, causing 780 Shadow damage over 24 sec.  This damage is dealt slowly at first, and builds up as the Curse reaches its full duration.  Only one Curse per Warlock can be active on any one target.",
    "11712_aura": "780 Shadow damage over 24 sec.",
    "48461": "Causes 553 to 623 Nature damage to the target.",
    "48441": "Heals the target for 1690 over 15 sec.",
    "48441_aura": "Heals 338 damage every 3 seconds.",
  },

  // Ascension (3.3.5a — modified client, identical DBC to Warmane for base spells)
  ascension: {
    "133": "Hurls a fiery ball that causes 14 to 22 Fire damage and an additional 2 Fire damage over 4 sec.",
    "133_aura": "1 Fire damage every 2 seconds.",
    "139": "Heals the target for 45 over 15 sec.",
    "139_aura": "Healing 9 damage every 3 seconds.",
    "15237": "Causes an explosion of holy light around the caster, causing 28 to 32 Holy damage to all enemy targets within 10 yards and healing all party members within 10 yards for 52 to 60.  These effects cause no threat.",
    "17347": "An instant strike that deals 110% weapon damage and causes the target to hemorrhage, increasing any Physical damage dealt to the target by up to 21.  Lasts 10 charges or 15 sec.  Awards 1 combo point.",
    "17347_aura": "Increases damage taken by 21.",
    "16511": "An instant strike that deals 110% weapon damage and causes the target to hemorrhage, increasing any Physical damage dealt to the target by up to 13.  Lasts 10 charges or 15 sec.  Awards 1 combo point.",
    "16511_aura": "Increases damage taken by 13.",
    "709": "Transfers 29 health every 1 sec from the target to the caster.  Lasts 5 sec.",
    "709_aura": "Drains 29 health every 1 sec to the caster.",
    "11712": "Curses the target with agony, causing 780 Shadow damage over 24 sec.  This damage is dealt slowly at first, and builds up as the Curse reaches its full duration.  Only one Curse per Warlock can be active on any one target.",
    "11712_aura": "780 Shadow damage over 24 sec.",
    "48461": "Causes 553 to 623 Nature damage to the target.",
    "48441": "Heals the target for 1690 over 15 sec.",
    "48441_aura": "Heals 338 damage every 3 seconds.",
  },
};

const expectedDescriptions: Record<string, string> = expectedByServer[serverName] ?? {};

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
