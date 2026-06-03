import { describe, it, expect } from "vitest";
import {
  resolveSpellDescription,
  extractReferencedSpellIds,
} from "../src/spell/resolver.js";
import type { WoWSpell } from "../src/types.js";
import { makeSpell } from "./fixtures.js";

describe("resolveSpellDescription — variable types", () => {
  it("$s1 single value and $s1 die range", () => {
    const single = makeSpell({ effect_base_points: [100, 0, 0] });
    expect(resolveSpellDescription(single, "Deals $s1 damage.")).toBe(
      "Deals 100 damage.",
    );

    // base 13, dice 1, dieSides 9 -> min 1, max 9 -> 14 to 22
    const ranged = makeSpell({
      effect_base_points: [13, 0, 0],
      effect_base_dice: [1, 0, 0],
      effect_die_sides: [9, 0, 0],
    });
    expect(resolveSpellDescription(ranged, "Deals $s1 Fire damage.")).toBe(
      "Deals 14 to 22 Fire damage.",
    );
  });

  it("$d duration formatting", () => {
    expect(
      resolveSpellDescription(
        makeSpell({ duration: { ID: 0, Duration: 30000, DurationPerLevel: 0, MaxDuration: 0 } }),
        "Lasts $d.",
      ),
    ).toBe("Lasts 30 sec.");
    expect(
      resolveSpellDescription(
        makeSpell({ duration: { ID: 0, Duration: 120000, DurationPerLevel: 0, MaxDuration: 0 } }),
        "Lasts $d.",
      ),
    ).toBe("Lasts 2 min.");
  });

  it("$o1 periodic total over duration", () => {
    // 9 per tick, tick every 3s, 15s duration -> 5 ticks -> 45
    const renew = makeSpell({
      effect_base_points: [9, 0, 0],
      effect_aura_period: [3000, 0, 0],
      duration: { ID: 0, Duration: 15000, DurationPerLevel: 0, MaxDuration: 0 },
    });
    expect(resolveSpellDescription(renew, "Heals for $o1 over $d.")).toBe(
      "Heals for 45 over 15 sec.",
    );
  });

  it("$*N;s1 multiply and $/N;s1 divide", () => {
    const spell = makeSpell({ effect_base_points: [100, 0, 0] });
    expect(resolveSpellDescription(spell, "$*8;s1 damage")).toBe("800 damage");
    expect(resolveSpellDescription(spell, "$/1000;s1 sec")).toBe("0.1 sec");
  });

  it("${expr} inline arithmetic resolves inner variables first", () => {
    const spell = makeSpell({ effect_base_points: [3, 0, 0] });
    expect(resolveSpellDescription(spell, "${$m1*3} fire")).toBe("9 fire");
  });

  it("${expr} with unresolvable runtime variable is left raw", () => {
    const spell = makeSpell({ effect_base_points: [5, 0, 0] });
    expect(
      resolveSpellDescription(spell, "reduced by ${$m1*$AR*0.01} points"),
    ).toBe("reduced by ${5*$AR*0.01} points");
  });

  it("$lsingular:plural; pluralization based on preceding number", () => {
    const one = makeSpell({ effect_base_points: [1, 0, 0] });
    expect(resolveSpellDescription(one, "Gives $s1 extra $lattack:attacks;.")).toBe(
      "Gives 1 extra attack.",
    );
    const two = makeSpell({ effect_base_points: [2, 0, 0] });
    expect(resolveSpellDescription(two, "Gives $s1 extra $lattack:attacks;.")).toBe(
      "Gives 2 extra attacks.",
    );
    // No preceding number defaults to plural
    expect(resolveSpellDescription(one, "$lpoint:points;")).toBe("points");
  });

  it("$g gender defaults to male form, case-insensitive", () => {
    const spell = makeSpell();
    expect(resolveSpellDescription(spell, "freezes $Ghis:her; blood")).toBe(
      "freezes his blood",
    );
    expect(resolveSpellDescription(spell, "$ghe:she; strikes")).toBe("he strikes");
  });

  it("$n proc charges and $t tick interval", () => {
    const spell = makeSpell({
      proc_charges: 3,
      effect_aura_period: [3000, 0, 0],
    });
    expect(resolveSpellDescription(spell, "Next $n attacks, tick $t sec")).toBe(
      "Next 3 attacks, tick 3 sec",
    );
  });
});

describe("resolveSpellDescription — cross-spell references", () => {
  it("resolves $NNNNs1 from the referenced spell map", () => {
    const target = makeSpell({ id: 100, effect_base_points: [0, 0, 0] });
    const ref = makeSpell({ id: 23455, effect_base_points: [52, 0, 0] });
    const map = new Map<number, WoWSpell>([[23455, ref]]);
    expect(
      resolveSpellDescription(target, "heals for $23455s1.", map),
    ).toBe("heals for 52.");
  });

  it("leaves the placeholder intact when the referenced spell is missing", () => {
    const target = makeSpell({ id: 100 });
    expect(resolveSpellDescription(target, "heals for $23455s1.")).toBe(
      "heals for $23455s1.",
    );
  });
});

describe("extractReferencedSpellIds", () => {
  it("extracts cross-spell references", () => {
    expect(extractReferencedSpellIds("$3137s1 and $1234d")).toEqual([3137, 1234]);
  });
  it("returns empty for no references", () => {
    expect(extractReferencedSpellIds("$s1 damage over $d")).toEqual([]);
  });
  it("deduplicates IDs", () => {
    expect(extractReferencedSpellIds("$100s1 plus $100s2")).toEqual([100]);
  });
  it("handles empty input", () => {
    expect(extractReferencedSpellIds("")).toEqual([]);
  });
});

describe("no raw placeholders for fully-resolvable templates", () => {
  const rawPatterns = [
    /\$[sSmMoO]\d/,
    /\$[dD]\b/,
    /\$l[^:]+:[^;]+;/,
    /\$[gG][^:]+:[^;]+;/,
  ];
  it("leaves no $-placeholders behind", () => {
    const spell = makeSpell({
      effect_base_points: [1, 9, 0],
      duration: { ID: 0, Duration: 12000, DurationPerLevel: 0, MaxDuration: 0 },
      effect_aura_period: [3000, 0, 0],
    });
    const resolved = resolveSpellDescription(
      spell,
      "Deals $s1 over $d, $o1 total. $ghe:she; gains $s1 $lcharge:charges;.",
    );
    for (const p of rawPatterns) {
      expect(resolved).not.toMatch(p);
    }
  });
});
