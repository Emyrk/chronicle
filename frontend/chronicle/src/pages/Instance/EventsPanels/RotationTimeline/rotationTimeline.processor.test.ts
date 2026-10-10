import { describe, expect, it } from "vitest";
import type { AuraProcessorEvent, ProcessorContext } from "../processorTypes";
import { AuraState, AuraTransition } from "../processorTypes";
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
