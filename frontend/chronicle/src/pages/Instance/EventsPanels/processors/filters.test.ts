import { describe, expect, it } from "vitest";
import type { DamageProcessorEvent, ProcessorContext } from "../processorTypes";
import { evaluateFilters, type PanelFilter } from "./filters";

function createContext(overrides: Partial<ProcessorContext> = {}): ProcessorContext {
  return {
    players: {
      "0x0000000000000001": { name: "Player One", class: "MAGE" },
    },
    units: {
      "0xF130000000000001": { name: "Boss", owner: null, entry: 1 },
    },
    selectedEncounterIds: new Set(["enc1"]),
    entitySelection: {
      playerIds: new Set(["0x0000000000000001"]),
      enemyIds: new Set(["0xF130000000000001"]),
    },
    ...overrides,
  };
}

function createDamageEvent(overrides: Partial<DamageProcessorEvent> = {}): DamageProcessorEvent {
  return {
    type: "damage",
    index: 0,
    offsetMilli: 0,
    activity: [],
    activityCount: 0,
    caster: "0x0000000000000001",
    sourceName: "Fireball",
    target: "0xF130000000000001",
    hitType: 1,
    amount: 100,
    school: 4,
    tailers: [],
    tailerCount: 0,
    spellId: 133,
    ...overrides,
  };
}

describe("evaluateFilters", () => {
  it("passes when no filters are provided", () => {
    expect(evaluateFilters([], createDamageEvent(), createContext())).toBe(true);
  });

  it("matches selected player and enemy filters", () => {
    const filters: PanelFilter[] = [
      { type: "players", mode: "include", value: "selected" },
      { type: "enemies", mode: "include", value: "selected" },
    ];

    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(true);
  });

  it("rejects when include group does not match", () => {
    const filters: PanelFilter[] = [
      { type: "ability_name", mode: "include", value: "shadow" },
    ];

    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(false);
  });

  it("rejects when exclude filter matches", () => {
    const filters: PanelFilter[] = [
      { type: "ability_id", mode: "exclude", value: "133" },
    ];

    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(false);
  });

  it("supports OR within include type groups", () => {
    const filters: PanelFilter[] = [
      { type: "ability_name", mode: "include", value: "shadow" },
      { type: "ability_name", mode: "include", value: "fire" },
      { type: "event_type", mode: "include", value: "damage" },
    ];

    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(true);
  });

  it("parses comma separated values", () => {
    const filters: PanelFilter[] = [
      { type: "ability_name", mode: "include", value: "shadow, fire" },
    ];

    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(true);
  });

  it("matches ability_school using normalized enum school values", () => {
    const filters: PanelFilter[] = [
      { type: "ability_school", mode: "include", value: ["shadow", "fire"] },
    ];

    expect(evaluateFilters(filters, createDamageEvent({ school: 4 }), createContext())).toBe(true); // Fire enum
    expect(evaluateFilters(filters, createDamageEvent({ school: 7 }), createContext())).toBe(true); // Shadow enum
    expect(evaluateFilters(filters, createDamageEvent({ school: 5 }), createContext())).toBe(false); // Nature enum
  });
});
