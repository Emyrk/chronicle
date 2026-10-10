import { describe, expect, it } from "vitest";
import type { AbsorbedProcessorEvent, AuraProcessorEvent, HealProcessorEvent, ProcessorContext, SpellGoProcessorEvent } from "../processorTypes";
import { AuraState, AuraTransition } from "../processorTypes";
import { HitTypePeriodic } from "@/lib/hittype/hittype";
import { rotationTimelineProcessor } from "./rotationTimeline.processor";

const ENC = "enc-1";
const PLAYER = "player-1";
const BOSS = "boss-1";

function context(): ProcessorContext {
  return {
    players: { [PLAYER]: { name: "Nastycrush", class: "Warrior", level: 60 } },
    selectedEncounterIds: new Set([ENC]),
    entitySelection: { playerIds: new Set(), enemyIds: new Set() },
    panelContext: { focus: [PLAYER] },
  } as unknown as ProcessorContext;
}

function aura(offsetMilli: number, extra: Partial<AuraProcessorEvent>): AuraProcessorEvent {
  return {
    type: "aura",
    index: offsetMilli,
    offsetMilli,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    target: PLAYER,
    caster: null,
    spellName: "Berserker Rage",
    spellId: 18499,
    spellAttackOutcome: null,
    amount: 1,
    application: 0,
    state: AuraState.Added,
    transition: AuraTransition.Applied,
    isBuff: true,
    ...extra,
  } as AuraProcessorEvent;
}

function run(events: AuraProcessorEvent[]) {
  const state = rotationTimelineProcessor.createState();
  const ctx = context();
  for (const e of events) {
    rotationTimelineProcessor.processEvent(state, e, ENC, new Date(0), "aura", ctx);
  }
  return state;
}

describe("rotationTimelineProcessor auras", () => {
  it("closes a buff when the fade has no caster", () => {
    const state = run([
      aura(1000, { caster: PLAYER }),
      aura(11000, { caster: null, amount: 0, state: AuraState.Removed, transition: AuraTransition.Removed }),
    ]);
    expect(state.players.get(PLAYER)?.aurasOn.map((s) => [s.startMs, s.endMs])).toEqual([[1000, 11000]]);
  });

  it("closes a buff when the fade only carries the name", () => {
    const state = run([
      aura(1000, { caster: PLAYER }),
      aura(5000, { spellId: null, amount: 0, state: AuraState.Removed }),
    ]);
    expect(state.players.get(PLAYER)?.aurasOn[0].endMs).toBe(5000);
  });

  it("treats a second gain as a refresh, not a new segment", () => {
    const state = run([
      aura(1000, { caster: PLAYER }),
      aura(3000, { caster: PLAYER, state: AuraState.Added, transition: AuraTransition.Refreshed }),
      aura(9000, { amount: 0, state: AuraState.Removed }),
    ]);
    expect(state.players.get(PLAYER)?.aurasOn.map((s) => [s.startMs, s.endMs])).toEqual([[1000, 9000]]);
  });

  it("closes a debuff on an enemy when the fade has no caster", () => {
    const state = run([
      aura(2000, { target: BOSS, caster: PLAYER, isBuff: false, spellName: "Sunder Armor", spellId: 11597 }),
      aura(32000, { target: BOSS, caster: null, isBuff: false, spellName: "Sunder Armor", spellId: 11597, amount: 0, state: AuraState.Removed }),
    ]);
    expect(state.players.get(PLAYER)?.debuffsCast.map((s) => [s.startMs, s.endMs])).toEqual([[2000, 32000]]);
  });
});

describe("rotationTimelineProcessor aura procs", () => {
  it("records gains, refreshes and stack gains of curated auras, not charges used up", () => {
    const flurry = (offsetMilli: number, extra: Partial<AuraProcessorEvent>) =>
      aura(offsetMilli, { spellName: "Flurry", spellId: 12970, caster: PLAYER, amount: 3, ...extra });
    const state = run([
      flurry(1000, {}),
      flurry(2000, { amount: 2, state: AuraState.Modified, transition: AuraTransition.StackChanged }),
      flurry(3000, { amount: 3, state: AuraState.Modified, transition: AuraTransition.StackChanged }),
      flurry(4000, { transition: AuraTransition.Refreshed }),
      aura(5000, { target: BOSS, caster: PLAYER, isBuff: false, spellName: "Deep Wounds", spellId: 43104 }),
    ]);
    expect(state.players.get(PLAYER)?.auraProcs.map((p) => [p.offsetMs, p.spellName])).toEqual([
      [1000, "Flurry"],
      [3000, "Flurry"],
      [4000, "Flurry"],
      [5000, "Deep Wounds"],
    ]);
  });
});

describe("rotationTimelineProcessor healing", () => {
  const base = { activity: [], activityCount: 0, isSynthetic: false };
  const go = (offsetMilli: number, spellId: number): SpellGoProcessorEvent =>
    ({ ...base, type: "spell_go", index: offsetMilli, offsetMilli, caster: PLAYER, target: "tank", spell: { id: spellId, name: "Flash of Light" }, numHits: 1, numMisses: 0, itemId: null, corpseOwner: null }) as SpellGoProcessorEvent;
  const heal = (offsetMilli: number, spellId: number, amount: number, overheal: number): HealProcessorEvent =>
    ({ ...base, type: "heal", index: offsetMilli, offsetMilli, caster: PLAYER, sourceName: "", target: "tank", hitType: 2, amount, overheal, absorbed: 0, schools: [], spellId, spellAttackOutcome: null }) as HealProcessorEvent;
  const absorb = (offsetMilli: number, amount: number): AbsorbedProcessorEvent =>
    ({ ...base, type: "absorbed", index: offsetMilli, offsetMilli, attacker: "boss", target: "tank", damageSpellId: null, damageSpellName: null, caster: PLAYER, absorbSpellId: 10901, absorbSpellName: "Power Word: Shield", absorbSchools: [], amount, estimated: false }) as AbsorbedProcessorEvent;

  it("links effective healing and overheal to the cast, and counts shield absorbs", () => {
    const state = rotationTimelineProcessor.createState();
    const ctx = context();
    const events = [go(1000, 19750), heal(1100, 19750, 1000, 400), go(2000, 10901), absorb(5000, 600)];
    for (const e of events) rotationTimelineProcessor.processEvent(state, e, ENC, new Date(0), e.type, ctx);
    const p = state.players.get(PLAYER)!;
    expect(p.totalHealing).toBe(1200);
    expect(p.totalOverheal).toBe(400);
    expect(p.goCasts.map((c) => [c.spellId, c.healing, c.overheal])).toEqual([
      [19750, 600, 400],
      [10901, 600, 0],
    ]);
    expect(state.healingByPlayer.get(PLAYER)).toBe(1200);
  });

  it("marks casts on another player", () => {
    const state = rotationTimelineProcessor.createState();
    const ctx = context();
    (ctx.players as Record<string, unknown>).mage = { name: "Mage", class: "Mage", level: 60 };
    const events = [{ ...go(1000, 10060), target: "mage" }, { ...go(2000, 10060), target: PLAYER }, { ...go(3000, 10060), target: BOSS }];
    for (const e of events) rotationTimelineProcessor.processEvent(state, e, ENC, new Date(0), e.type, ctx);
    expect(state.players.get(PLAYER)!.goCasts.map((c) => c.onOtherPlayer ?? false)).toEqual([true, false, false]);
  });

  it("credits HoT ticks to the latest cast on the same target", () => {
    const state = rotationTimelineProcessor.createState();
    const ctx = context();
    const goOn = (offsetMilli: number, target: string) => ({ ...go(offsetMilli, 48441), target });
    const tick = (offsetMilli: number, target: string, amount: number) => ({ ...heal(offsetMilli, 48441, amount, 0), target, hitType: 2 | HitTypePeriodic });
    const events = [goOn(1000, "tank"), goOn(2000, "mage"), tick(4000, "tank", 300), tick(5000, "mage", 100), tick(6000, "rogue", 50)];
    for (const e of events) rotationTimelineProcessor.processEvent(state, e, ENC, new Date(0), e.type, ctx);
    // The rogue had no Rejuvenation cast on it: falls back to the latest cast.
    expect(state.players.get(PLAYER)!.goCasts.map((c) => [c.target, c.healing])).toEqual([
      ["tank", 300],
      ["mage", 150],
    ]);
  });
});
