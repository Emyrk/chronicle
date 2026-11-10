import { describe, expect, it } from "vitest";
import { recordBossMechanicAnimationAura } from "./bossMechanicAnimations";
import { addEffectEvent, createEncounterEffects, type ReplayEffectEvent } from "./replayEffects";
import { cachedModelAsset, modelAnimationState, modelAnimationTimeSeconds, movementAnimation, selectModelAnimation, usesStaticDeathFallback } from "./modelAnimation";

function event(overrides: Partial<ReplayEffectEvent>): ReplayEffectEvent {
  return {
    timestampMs: 1000,
    kind: "damage",
    source: "source",
    target: "target",
    school: 2,
    amount: 1,
    overheal: 0,
    absorbed: 0,
    effective: 0,
    crit: false,
    periodic: false,
    attack: "swing",
    castTimeMs: 0,
    spellId: null,
    spellName: "",
    ...overrides,
  };
}

describe("modelAnimation", () => {
  it("deduplicates cached loads and retries failures", async () => {
    const cache = new Map<string, Promise<number>>();
    let loads = 0;
    const first = cachedModelAsset(cache, "model", async () => ++loads);
    expect(cachedModelAsset(cache, "model", async () => ++loads)).toBe(first);
    await expect(first).resolves.toBe(1);
    expect(loads).toBe(1);

    const failed = cachedModelAsset(cache, "broken", async () => {
      loads++;
      throw new Error("broken");
    });
    await expect(failed).rejects.toThrow("broken");
    await Promise.resolve();
    await expect(cachedModelAsset(cache, "broken", async () => ++loads)).resolves.toBe(3);
  });

  it("classifies locomotion from replay speed", () => {
    const current = { x: 3, y: 0, timestampMs: 1000 };
    expect(movementAnimation(current, null)).toBe("Stand");
    expect(movementAnimation(current, { x: 2.9, y: 0, timestampMs: 500 })).toBe("Stand");
    expect(movementAnimation(current, { x: 2, y: 0, timestampMs: 500 })).toBe("Walk");
    expect(movementAnimation(current, { x: 0, y: 0, timestampMs: 500 })).toBe("Run");
  });

  it("derives deterministic attack, cast, wound, and death priorities", () => {
    const fx = createEncounterEffects();
    addEffectEvent(fx, event({ timestampMs: 1000, attack: "ranged_auto" }));
    expect(modelAnimationState(fx, "source", 1100, "Stand", false, null)).toMatchObject({
      candidates: ["AttackBow", "AttackRifle", "AttackThrown", "AttackUnarmed"],
      startedAtMs: 1000,
      loop: false,
    });
    expect(modelAnimationState(fx, "source", 1100, "Stand", true, null).candidates[0]).toBe("SpellCastDirected");
    expect(modelAnimationState(fx, "target", 1100, "Stand", false, null).candidates[0]).toBe("CombatWound");
    expect(modelAnimationState(fx, "target", 1100, "Stand", false, 1050)).toMatchObject({
      candidates: ["Death"],
      startedAtMs: 1050,
      loop: false,
    });
  });

  it("prioritizes a configured boss mechanic animation for its aura lifetime", () => {
    const fx = createEncounterEffects();
    recordBossMechanicAnimationAura(fx.bossMechanicAnimationsByUnit, "herod", 8989, 12_965, true);
    recordBossMechanicAnimationAura(fx.bossMechanicAnimationsByUnit, "herod", 8989, 22_965, false);

    expect(modelAnimationState(fx, "herod", 12_964, "Stand", false, null).candidates).toEqual(["Stand", "Stand"]);
    expect(modelAnimationState(fx, "herod", 15_000, "Stand", true, null)).toMatchObject({
      candidates: ["Whirlwind"],
      startedAtMs: 12_965,
      loop: true,
      key: "mechanic:herod-whirlwind:12965",
    });
    expect(modelAnimationState(fx, "herod", 22_965, "Stand", false, null).candidates).toEqual(["Stand", "Stand"]);
    expect(modelAnimationState(fx, "herod", 15_000, "Stand", true, 14_000).candidates).toEqual(["Death"]);
  });

  it("uses a static corpse only after a missing death clip is known", () => {
    expect(usesStaticDeathFallback(1000, "Stand", false)).toBe(false);
    expect(usesStaticDeathFallback(1000, "Stand", true)).toBe(true);
    expect(usesStaticDeathFallback(1000, "Death", true)).toBe(false);
    expect(usesStaticDeathFallback(null, "Stand", true)).toBe(false);
  });

  it("seeks looping and one-shot clips from replay time", () => {
    expect(modelAnimationTimeSeconds(3500, 1000, 2, true)).toBe(0.5);
    expect(modelAnimationTimeSeconds(3500, 1000, 2, false)).toBe(2);
    expect(modelAnimationTimeSeconds(500, 1000, 2, true)).toBe(0);
  });

  it("falls back through available clips and remains deterministic when scrubbing", () => {
    const available = new Map<string, unknown>([["Stand", {}], ["AttackUnarmed", {}]]);
    expect(selectModelAnimation(available, ["Attack1H", "AttackUnarmed"])).toBe("AttackUnarmed");
    expect(selectModelAnimation(available, ["SpellCast"])).toBe("Stand");
    const state = modelAnimationState(null, "unit", 5000, "Run", false, null);
    expect(state).toEqual(modelAnimationState(null, "unit", 5000, "Run", false, null));
  });
});
