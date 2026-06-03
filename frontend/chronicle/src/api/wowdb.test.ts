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

  // AzerothCore (3.3.5a — modified client, same base DBC values as stock for these spells)
  azerothcore: {
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

    // Guardian Spirit — multi-effect %s
    "47788": "Calls upon a guardian spirit to watch over the friendly target. The spirit increases the healing received by the target by 40%, and also prevents the target from dying by sacrificing itself.  This sacrifice terminates the effect but heals the target of 50% of their maximum health. Lasts 10 sec.",
    "47788_aura": "Increased healing received by 40% and will prevent 1 killing blow.",

    // Bone Shield — $G gender in real spell
    "49222": "The Death Knight is surrounded by 4 whirling bones.  While at least 1 bone remains, he takes 20% less damage from all sources and deals 2% more damage with all attacks, spells and abilities.  Each damaging attack that lands consumes 1 bone.  Lasts 5 min.",
    "49222_aura": "Damage reduced by 20%.",

    // Icebound Fortitude — $G gender
    "48792": "The Death Knight freezes his blood to become immune to Stun effects and reduce all damage taken by 20% plus additional damage reduction based on Defense for 12 sec.",
    "48792_aura": "Damage taken reduced.\r\nImmune to Stun effects.",

    // Recklessness — $n proc charges
    "1719": "Your next 3 special ability attacks have an additional 100% to critically hit but all damage taken is increased by 20%.  Lasts 12 sec.",
    "1719_aura": "Special ability attacks have an additional 100% chance to critically hit but all damage taken is increased by 20%.",

    // Avenging Wrath — cross-ref $61987d
    "31884": "Increases all damage and healing caused by 20% for 20 sec.  Cannot be used within 30 sec of being the target of Divine Shield, Divine Protection, or Hand of Protection.",
    "31884_aura": "All damage and healing caused increased by 20%.",

    // Divine Plea — $o1 periodic total
    "54428": "You gain 25% of your total mana over 15 sec, but the amount healed by your Flash of Light, Holy Light, and Holy Shock spells is reduced by 50%.",
    "54428_aura": "Gaining 25% of total mana.\r\nHealing spells reduced by 50%.",

    // Unholy Frenzy — multi-effect %s
    "49016": "Induces a friendly unit into a killing frenzy for 30 sec.  The target is Enraged, which increases their physical damage by 20%, but causes them to lose health equal to 1% of their maximum health every second.",
    "49016_aura": "Enraged.\r\nPhysical damage increased by 20%.\r\nHealth equal to 1% of maximum health lost every sec.",

    // Vampiric Blood — multi-effect %s
    "55233": "Temporarily grants the Death Knight 15% of maximum health and increases the amount of health generated through spells and effects by 35% for 20 sec.  After the effect expires, the health is lost.",
    "55233_aura": "Healing improved by 35%\r\nMaximum health increased by 15%",

    // Death Wish — $s1/$s3/$d (skips effect 2)
    "12292": "When activated you become enraged, increasing your physical damage by 20% but increasing all damage taken by 5%.  Lasts 30 sec.",
    "12292_aura": "Increases physical damage by 20%.  Increases all damage taken by 5%.",

    // Replenishment — self-referencing cross-spell $57669d
    "57669": "Replenishes 1% of maximum mana per 5 sec for 15 sec.",
    "57669_aura": "Replenishes 1% of maximum mana per 5 sec.",

    // Enchant Weapon - Mongoose — static text, no variables
    "27984": "Permanently enchant a melee weapon to occasionally increase Agility by 120 and attack speed slightly.  Requires a level 35 or higher item.",

    // Obliterate — ${$m1*$m2/100} inline arithmetic with variables
    "49020": "A brutal instant attack that deals 80% weapon damage plus 198, total damage increased 13.1% per each of your diseases on the target, but consumes the diseases.",

    // Death Strike — ${$m1*$m2/100} + $G + $F (unresolved runtime var)
    "49998": "A deadly attack that deals 75% weapon damage plus 84 and heals the Death Knight for $F% of his maximum health for each of his diseases on the target.",

    // Unbreakable Armor — ${$m1*$AR*0.01} runtime var in arithmetic (stays unresolved)
    "51271": "Reinforces your armor with a thick coat of ice, reducing damage from all attacks by ${5*$AR*0.01} and increasing your Strength by 25% for 20 sec.  The amount of damage reduced increases as your armor increases.",
    "51271_aura": "Damage taken reduced by armor.\r\nStrength increased by 25%.",

    // Seal of Vengeance — $SPH/$AP/$AR runtime vars + cross-refs
    "31801": "Fills the Paladin with holy power, causing attacks to apply Holy Vengeance, which deals ${(0.013*$SPH+0.025*$AP)*5} additional Holy damage over 15 sec.  Holy Vengeance can stack up to 5 times.  Once stacked to 5 times, each of the Paladin's attacks also deals 33% weapon damage as additional Holy damage.  Only one Seal can be active on the Paladin at any one time.  Lasts 30 min.\r\n\r\nUnleashing this Seal's energy will deal ${1+0.22*$SPH+0.14*$AP} Holy damage to an enemy, increased by 10% for each application of Holy Vengeance on the target.",
    "31801_aura": "Melee attacks cause Holy damage over 15 sec.",
  },

  // Ascension (3.3.5a — modified client, identical DBC to AzerothCore for base spells)
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
// Spells whose descriptions intentionally contain unresolved runtime variables
// ($AR, $AP, $SPH, $F are player-specific values the tooltip resolver cannot compute).
// These are excluded from the "no raw placeholders" assertion.
const RUNTIME_VARIABLE_SPELLS = new Set([
  49998, // Death Strike — $F (cumulative_aura, unhandled uppercase)
  51271, // Unbreakable Armor — $AR (player armor)
  31801, // Seal of Vengeance — $SPH, $AP, $AR (player stats)
]);

describe("no raw placeholders in resolved descriptions", () => {
  // These patterns should never appear in resolved output for fully-resolvable spells.
  // They indicate the resolver failed to substitute a template variable.
  const rawPlaceholderPatterns = [
    { pattern: /\$[sSmMoO]\d/g, label: "effect value ($s1, $m1, $o1)" },
    { pattern: /\$[dD]\b/g, label: "duration ($d)" },
    { pattern: /\$[tT]\d/g, label: "tick interval ($t1)" },
    { pattern: /\$[aA]\d/g, label: "radius ($a1)" },
    { pattern: /\$[nN]\b/g, label: "proc charges ($n)" },
    { pattern: /\$[hH]\b/g, label: "proc chance ($h)" },
    { pattern: /\$[xX]\d/g, label: "chain targets ($x1)" },
    { pattern: /\$[bB]\d/g, label: "combo points ($b1)" },
    { pattern: /\$l[^:]+:[^;]+;/g, label: "pluralization ($l...;)" },
    { pattern: /\$[gG][^:]+:[^;]+;/g, label: "gender ($g...;)" },
  ];

  testSpells.forEach(({ id, name, descriptionTemplate, auraDescriptionTemplate }) => {
    if (RUNTIME_VARIABLE_SPELLS.has(id)) return;

    for (const { template, label } of [
      { template: descriptionTemplate, label: "description" },
      { template: auraDescriptionTemplate, label: "aura" },
    ]) {
      if (!template || template === "<empty>") continue;

      it(`spell ${id} (${name}) ${label} has no raw placeholders`, () => {
        const resolved = resolveTestSpell(id, template);
        for (const { pattern, label: patLabel } of rawPlaceholderPatterns) {
          const matches = resolved.match(pattern);
          if (matches) {
            expect.fail(
              `Resolved ${label} for spell ${id} (${name}) contains raw ${patLabel}: ${matches.join(", ")}\n` +
              `Template: ${template}\n` +
              `Resolved: ${resolved}`
            );
          }
        }
      });
    }
  });
});

