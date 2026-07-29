import { describe, expect, it } from "vitest";
import { auraUptimeProcessor } from "./auraUptime.processor";
import {
  AuraApplication,
  AuraState,
  type AuraProcessorEvent,
  type ProcessorContext,
} from "../processorTypes";

const TARGET_GUID = "0xF130003E9C0158EA";

function createContext(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
  return {
    players: {},
    units: {
      [TARGET_GUID]: { name: "Test Target", owner: null, entry: 1604 },
    },
    selectedEncounterIds: new Set(["enc1"]),
    entitySelection: {
      enemyIds: new Set(),
      playerIds: new Set(),
    },
    ...overrides,
  };
}

function createAuraEvent(overrides: Partial<AuraProcessorEvent> = {}): AuraProcessorEvent {
  return {
    type: "aura",
    index: 0,
    offsetMilli: 0,
    target: TARGET_GUID,
    spellName: "Fireball!",
    spellId: 11198,
    amount: 1,
    application: AuraApplication.Gains,
    state: AuraState.Added,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    spellAttackOutcome: null,
    ...overrides,
  };
}

describe("auraUptimeProcessor", () => {
  it("keeps aura active for Removed events while amount remains positive", () => {
    const state = auraUptimeProcessor.createState();
    const context = createContext();

    auraUptimeProcessor.processEvent(
      state,
      createAuraEvent({ index: 1, offsetMilli: 1000, state: AuraState.Added, amount: 1 }),
      "enc1",
      new Date(0),
      "aura",
      context,
    );

    // Stack decrement with the same timestamp should not end uptime when amount stays > 0.
    auraUptimeProcessor.processEvent(
      state,
      createAuraEvent({ index: 2, offsetMilli: 1000, state: AuraState.Removed, amount: 1 }),
      "enc1",
      new Date(0),
      "aura",
      context,
    );

    auraUptimeProcessor.processEvent(
      state,
      createAuraEvent({ index: 3, offsetMilli: 5000, state: AuraState.Removed, amount: 0 }),
      "enc1",
      new Date(0),
      "aura",
      context,
    );

    const auraData = state.byAura.get("Fireball!");
    expect(auraData).toBeDefined();

    const targetData = auraData?.perTarget.get(TARGET_GUID);
    expect(targetData).toBeDefined();
    expect(targetData?.applicationCount).toBe(1);
    expect(targetData?.totalUptimeMs).toBe(4000);
    expect(targetData?.segments).toHaveLength(1);
    expect(targetData?.segments[0]).toEqual({
      startMs: 1000,
      endMs: 5000,
      encounterId: "enc1",
    });
  });
});
