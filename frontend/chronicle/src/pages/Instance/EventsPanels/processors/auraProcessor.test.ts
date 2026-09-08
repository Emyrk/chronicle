import { describe, expect, it } from "vitest";
import { AuraApplication, AuraState, type AuraProcessorEvent, type ProcessorEvent, type SlainProcessorEvent } from "../processorTypes";
import { applyAuraEvent, applySlainEvent, createAuraProcessorState, getAuraCaster, getAuraStacks, hasAura } from "./auraProcessor";

function createAuraEvent(overrides: Partial<AuraProcessorEvent> = {}): AuraProcessorEvent {
  return {
    type: "aura",
    index: 0,
    offsetMilli: 0,
    target: "target-1",
    caster: null,
    spellName: "Sunder Armor",
    spellId: 7386,
    amount: 1,
    application: AuraApplication.Gains,
    state: AuraState.Added,
    isBuff: false,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    spellAttackOutcome: null,
    ...overrides,
  };
}

function createSlainEvent(overrides: Partial<SlainProcessorEvent> = {}): SlainProcessorEvent {
  return {
    type: "slain",
    index: 0,
    offsetMilli: 0,
    target: "target-1",
    caster: "caster-1",
    attribution: null,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    ...overrides,
  };
}

describe("auraProcessor", () => {
  it("treats amount 0 as inactive even when state is Added", () => {
    const state = createAuraProcessorState();
    const event = createAuraEvent({ amount: 0, state: AuraState.Added });

    applyAuraEvent(state, "enc1", event);

    expect(hasAura(state, "enc1", "target-1", { spellId: 7386 })).toBe(false);
    expect(getAuraStacks(state, "enc1", "target-1", { spellId: 7386 })).toBe(0);
  });

  it("updates stacks on Modified > 0", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ amount: 1, state: AuraState.Added }));
    applyAuraEvent(state, "enc1", createAuraEvent({ amount: 4, state: AuraState.Modified }));

    expect(getAuraStacks(state, "enc1", "target-1", { spellId: 7386 })).toBe(4);
  });

  it("tracks the known caster and keeps it across source-less updates", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ caster: "caster-1", amount: 1 }));
    applyAuraEvent(state, "enc1", createAuraEvent({ caster: null, amount: 2, state: AuraState.Modified }));

    expect(getAuraCaster(state, "enc1", "target-1", { spellId: 7386 })).toBe("caster-1");
  });

  it("updates the caster when a later event has direct attribution", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ caster: "caster-1", amount: 1 }));
    applyAuraEvent(state, "enc1", createAuraEvent({ caster: "caster-2", amount: 1, state: AuraState.Added }));

    expect(getAuraCaster(state, "enc1", "target-1", { spellName: "Sunder Armor" })).toBe("caster-2");
  });

  it("removes aura on Modified=0", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ state: AuraState.Added }));
    applyAuraEvent(state, "enc1", createAuraEvent({ state: AuraState.Modified, amount: 0 }));

    expect(hasAura(state, "enc1", "target-1", { spellId: 7386 })).toBe(false);
  });

  it("treats Removed with positive amount as still active", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ state: AuraState.Added, amount: 2 }));
    applyAuraEvent(state, "enc1", createAuraEvent({ state: AuraState.Removed, amount: 1 }));

    expect(hasAura(state, "enc1", "target-1", { spellId: 7386 })).toBe(true);
    expect(getAuraStacks(state, "enc1", "target-1", { spellId: 7386 })).toBe(1);
  });

  it("removes aura on Removed state when amount is 0", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ state: AuraState.Added, amount: 1 }));
    applyAuraEvent(state, "enc1", createAuraEvent({ state: AuraState.Removed, amount: 0 }));

    expect(hasAura(state, "enc1", "target-1", { spellId: 7386 })).toBe(false);
  });

  it("clears target auras on slain via applyAuraEvent dispatcher", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ target: "target-1", spellId: 7386, spellName: "Sunder Armor" }));
    applyAuraEvent(state, "enc1", createAuraEvent({ target: "target-2", spellId: 1234, spellName: "Curse of Tongues" }));

    applyAuraEvent(state, "enc1", createSlainEvent({ target: "target-1" }));

    expect(hasAura(state, "enc1", "target-1", { spellId: 7386 })).toBe(false);
    expect(hasAura(state, "enc1", "target-2", { spellId: 1234 })).toBe(true);
  });

  it("keeps applySlainEvent wrapper compatibility", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ target: "target-1", spellId: 7386, spellName: "Sunder Armor" }));
    applySlainEvent(state, "enc1", createSlainEvent({ target: "target-1" }));

    expect(hasAura(state, "enc1", "target-1", { spellId: 7386 })).toBe(false);
  });

  it("isolates aura state by encounter", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ target: "target-1", spellId: 7386 }));

    expect(hasAura(state, "enc1", "target-1", { spellId: 7386 })).toBe(true);
    expect(hasAura(state, "enc2", "target-1", { spellId: 7386 })).toBe(false);
  });

  it("supports spell name lookup when aura is tracked by spell ID", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ spellId: 20925, spellName: "Holy Shield" }));

    expect(hasAura(state, "enc1", "target-1", { spellName: "holy shield" })).toBe(true);
    expect(getAuraStacks(state, "enc1", "target-1", { spellName: "Holy Shield" })).toBe(1);
  });

  it("ignores unsupported event types", () => {
    const state = createAuraProcessorState();

    applyAuraEvent(state, "enc1", createAuraEvent({ spellId: 7386, spellName: "Sunder Armor" }));

    const unsupportedEvent = {
      type: "damage",
      target: "target-1",
    } as unknown as ProcessorEvent;

    applyAuraEvent(state, "enc1", unsupportedEvent);

    expect(hasAura(state, "enc1", "target-1", { spellId: 7386 })).toBe(true);
  });
});
