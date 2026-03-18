import { describe, expect, it } from "vitest";
import type { DamageProcessorEvent, ProcessorContext } from "../processorTypes";
import { evaluateFilters, compileFilters, type PanelFilter } from "./filters";

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
    globalOffsetMilli: 0,
    activity: [],
    activityCount: 0,
    spellAttackOutcome: null,
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

  it("matches selected player and enemy filters (AND)", () => {
    const filters: PanelFilter[] = [
      { type: "players", value: "selected" },
      { type: "enemies", value: "selected" },
    ];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(true);
  });

  it("rejects when filter does not match", () => {
    const filters: PanelFilter[] = [
      { type: "ability_name", value: "shadow" },
    ];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(false);
  });

  it("rejects when negated filter matches", () => {
    const filters: PanelFilter[] = [
      { type: "ability_id", value: "133", negate: true },
    ];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(false);
  });

  it("supports OR combinator between filters", () => {
    const filters: PanelFilter[] = [
      { type: "ability_name", value: "shadow" },
      { type: "ability_name", value: "fire", combinator: "or" },
    ];
    // "shadow" fails but "fire" matches via OR → group passes
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(true);
  });

  it("AND groups must all pass", () => {
    const filters: PanelFilter[] = [
      { type: "ability_name", value: "shadow" },
      { type: "ability_name", value: "fire", combinator: "or" },
      { type: "ability_id", value: "133" }, // AND (new group)
    ];
    // Group 1: (shadow OR fire) → true. Group 2: (spell 133) → true
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(true);
  });

  it("AND group rejects if any group fails", () => {
    const filters: PanelFilter[] = [
      { type: "ability_name", value: "shadow" },
      { type: "ability_name", value: "fire", combinator: "or" },
      { type: "ability_id", value: "999" }, // AND — this group fails (no spell 999)
    ];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(false);
  });

  it("parses comma separated values", () => {
    const filters: PanelFilter[] = [
      { type: "ability_name", value: "shadow, fire" },
    ];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(true);
  });

  it("matches ability_school using normalized enum school values", () => {
    const filters: PanelFilter[] = [
      { type: "ability_school", value: ["shadow", "fire"] },
    ];
    expect(evaluateFilters(filters, createDamageEvent({ school: 4 }), createContext())).toBe(true);  // Fire
    expect(evaluateFilters(filters, createDamageEvent({ school: 7 }), createContext())).toBe(true);  // Shadow
    expect(evaluateFilters(filters, createDamageEvent({ school: 5 }), createContext())).toBe(false); // Nature
  });

  it("negate works with any filter type", () => {
    const filters: PanelFilter[] = [
      { type: "ability_id", value: "133", negate: true },
    ];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(false);
  });

  it("default combinator is AND", () => {
    // Two filters with no combinator → both must match
    const filters: PanelFilter[] = [
      { type: "ability_name", value: "fire" },
      { type: "ability_name", value: "shadow" }, // no combinator = AND, new group
    ];
    // "fire" matches but "shadow" doesn't → false
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(false);
  });

  describe("source_type with proper pet classification", () => {
    const PLAYER_GUID = "0x0000000000000001";
    const FRIENDLY_PET_GUID = "0x0040000000000010"; // high & 0x00f0 = 0x0040 = pet
    const ENEMY_PET_GUID = "0x0040000000000020";    // also a pet GUID
    const ENEMY_BOSS_GUID = "0xF130000000000001";   // high & 0x00f0 = 0x0030 = creature
    const ENEMY_OWNER_GUID = "0xF130000000000099";  // creature (non-player owner)

    function ctxWithUnits(): ProcessorContext {
      return createContext({
        units: {
          [FRIENDLY_PET_GUID]: { name: "Wolf", owner: PLAYER_GUID, entry: 100 },
          [ENEMY_PET_GUID]: { name: "Imp", owner: ENEMY_OWNER_GUID, entry: 200 },
          [ENEMY_BOSS_GUID]: { name: "Boss", owner: null, entry: 1 },
        },
      });
    }

    it("player matches player caster", () => {
      const filters: PanelFilter[] = [{ type: "source_type", value: "player" }];
      expect(evaluateFilters(filters, createDamageEvent({ caster: PLAYER_GUID }), ctxWithUnits())).toBe(true);
    });

    it("pet matches friendly pet (player-owned)", () => {
      const filters: PanelFilter[] = [{ type: "source_type", value: "pet" }];
      expect(evaluateFilters(filters, createDamageEvent({ caster: FRIENDLY_PET_GUID }), ctxWithUnits())).toBe(true);
    });

    it("pet does NOT match enemy pet", () => {
      const filters: PanelFilter[] = [{ type: "source_type", value: "pet" }];
      expect(evaluateFilters(filters, createDamageEvent({ caster: ENEMY_PET_GUID }), ctxWithUnits())).toBe(false);
    });

    it("enemy_pet matches enemy-owned pet", () => {
      const filters: PanelFilter[] = [{ type: "source_type", value: "enemy_pet" }];
      expect(evaluateFilters(filters, createDamageEvent({ caster: ENEMY_PET_GUID }), ctxWithUnits())).toBe(true);
    });

    it("enemy_pet does NOT match friendly pet", () => {
      const filters: PanelFilter[] = [{ type: "source_type", value: "enemy_pet" }];
      expect(evaluateFilters(filters, createDamageEvent({ caster: FRIENDLY_PET_GUID }), ctxWithUnits())).toBe(false);
    });

    it("enemy matches mob with no owner", () => {
      const filters: PanelFilter[] = [{ type: "source_type", value: "enemy" }];
      expect(evaluateFilters(filters, createDamageEvent({ caster: ENEMY_BOSS_GUID }), ctxWithUnits())).toBe(true);
    });

    it("enemy does NOT match owned pets", () => {
      const filters: PanelFilter[] = [{ type: "source_type", value: "enemy" }];
      expect(evaluateFilters(filters, createDamageEvent({ caster: FRIENDLY_PET_GUID }), ctxWithUnits())).toBe(false);
      expect(evaluateFilters(filters, createDamageEvent({ caster: ENEMY_PET_GUID }), ctxWithUnits())).toBe(false);
    });

    it("player,pet matches both players and friendly pets", () => {
      const filters: PanelFilter[] = [{ type: "source_type", value: ["player", "pet"] }];
      expect(evaluateFilters(filters, createDamageEvent({ caster: PLAYER_GUID }), ctxWithUnits())).toBe(true);
      expect(evaluateFilters(filters, createDamageEvent({ caster: FRIENDLY_PET_GUID }), ctxWithUnits())).toBe(true);
      expect(evaluateFilters(filters, createDamageEvent({ caster: ENEMY_PET_GUID }), ctxWithUnits())).toBe(false);
    });
    it("selected_players matches pets owned by selected players", () => {
      const filters: PanelFilter[] = [{ type: "source_type", value: ["selected_players"] }];
      // Player matches
      expect(evaluateFilters(filters, createDamageEvent({ caster: PLAYER_GUID }), ctxWithUnits())).toBe(true);
      // Pet owned by selected player matches
      expect(evaluateFilters(filters, createDamageEvent({ caster: FRIENDLY_PET_GUID }), ctxWithUnits())).toBe(true);
      // Enemy pet does not match
      expect(evaluateFilters(filters, createDamageEvent({ caster: ENEMY_PET_GUID }), ctxWithUnits())).toBe(false);
      // Boss does not match
      expect(evaluateFilters(filters, createDamageEvent({ caster: "0xF130000000000001" }), ctxWithUnits())).toBe(false);
    });

  });

  it("matches ability_hittype using bitmask", () => {
    const filters: PanelFilter[] = [
      { type: "ability_hittype", value: ["crit", "glancing"] },
    ];
    const ctx = createContext();
    // crit = 0x0004
    expect(evaluateFilters(filters, createDamageEvent({ hitType: 0x0004 }), ctx)).toBe(true);
    // glancing = 0x0100
    expect(evaluateFilters(filters, createDamageEvent({ hitType: 0x0100 }), ctx)).toBe(true);
    // hit = 0x0002 (not in filter)
    expect(evaluateFilters(filters, createDamageEvent({ hitType: 0x0002 }), ctx)).toBe(false);
  });

  it("matches ability_hittype with multi-flag event", () => {
    const filters: PanelFilter[] = [
      { type: "ability_hittype", value: ["crit"] },
    ];
    // Event has crit + offhand (0x0004 | 0x0001 = 0x0005)
    expect(evaluateFilters(filters, createDamageEvent({ hitType: 0x0005 }), createContext())).toBe(true);
  });

  it("ability_hittype returns false for event without hitType", () => {
    const filters: PanelFilter[] = [
      { type: "ability_hittype", value: ["crit"] },
    ];
    const event = { type: "cast" as const, index: 0, offsetMilli: 0, activity: [], activityCount: 0 } as any;
    expect(evaluateFilters(filters, event, createContext())).toBe(false);
  });

  it("ability_hittype supports negate", () => {
    const filters: PanelFilter[] = [
      { type: "ability_hittype", value: ["crit"], negate: true },
    ];
    // crit event should be rejected
    expect(evaluateFilters(filters, createDamageEvent({ hitType: 0x0004 }), createContext())).toBe(false);
    // non-crit event should pass
    expect(evaluateFilters(filters, createDamageEvent({ hitType: 0x0002 }), createContext())).toBe(true);
  });
});

describe("compileFilters", () => {
  it("returns a reusable predicate", () => {
    const filters: PanelFilter[] = [
      { type: "source_type", value: "player" },
    ];
    const predicate = compileFilters(filters, createContext());
    expect(predicate(createDamageEvent())).toBe(true);
    expect(predicate(createDamageEvent({ caster: "0xF130000000000002" }))).toBe(false);
  });

  it("empty filters always pass", () => {
    const predicate = compileFilters([], createContext());
    expect(predicate(createDamageEvent())).toBe(true);
  });
});
describe("time_range filter", () => {
  it("passes all events when value is empty", () => {
    const filters: PanelFilter[] = [{ type: "time_range", value: "" }];
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 5000 }), createContext())).toBe(true);
  });

  it("filters by start bound only", () => {
    const filters: PanelFilter[] = [{ type: "time_range", value: "3000," }];
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 2000 }), createContext())).toBe(false);
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 3000 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 5000 }), createContext())).toBe(true);
  });

  it("filters by end bound only", () => {
    const filters: PanelFilter[] = [{ type: "time_range", value: ",10000" }];
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 5000 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 10000 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 15000 }), createContext())).toBe(false);
  });

  it("filters by both bounds", () => {
    const filters: PanelFilter[] = [{ type: "time_range", value: "2000,8000" }];
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 1000 }), createContext())).toBe(false);
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 2000 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 5000 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 8000 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 9000 }), createContext())).toBe(false);
  });

  it("supports negation", () => {
    const filters: PanelFilter[] = [{ type: "time_range", value: "2000,8000", negate: true }];
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 5000 }), createContext())).toBe(false);
    expect(evaluateFilters(filters, createDamageEvent({ globalOffsetMilli: 1000 }), createContext())).toBe(true);
  });
});
describe("event_value filter", () => {
  it("filters > operator", () => {
    const filters: PanelFilter[] = [{ type: "event_value", value: ">:1000" }];
    expect(evaluateFilters(filters, createDamageEvent({ amount: 1500 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ amount: 1000 }), createContext())).toBe(false);
    expect(evaluateFilters(filters, createDamageEvent({ amount: 500 }), createContext())).toBe(false);
  });

  it("filters >= operator", () => {
    const filters: PanelFilter[] = [{ type: "event_value", value: ">=:1000" }];
    expect(evaluateFilters(filters, createDamageEvent({ amount: 1000 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ amount: 999 }), createContext())).toBe(false);
  });

  it("filters < operator", () => {
    const filters: PanelFilter[] = [{ type: "event_value", value: "<:100" }];
    expect(evaluateFilters(filters, createDamageEvent({ amount: 50 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ amount: 100 }), createContext())).toBe(false);
  });

  it("filters <= operator", () => {
    const filters: PanelFilter[] = [{ type: "event_value", value: "<=:100" }];
    expect(evaluateFilters(filters, createDamageEvent({ amount: 100 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ amount: 101 }), createContext())).toBe(false);
  });

  it("filters = operator", () => {
    const filters: PanelFilter[] = [{ type: "event_value", value: "=:0" }];
    expect(evaluateFilters(filters, createDamageEvent({ amount: 0 }), createContext())).toBe(true);
    expect(evaluateFilters(filters, createDamageEvent({ amount: 1 }), createContext())).toBe(false);
  });

  it("filters != operator", () => {
    const filters: PanelFilter[] = [{ type: "event_value", value: "!=:0" }];
    expect(evaluateFilters(filters, createDamageEvent({ amount: 0 }), createContext())).toBe(false);
    expect(evaluateFilters(filters, createDamageEvent({ amount: 500 }), createContext())).toBe(true);
  });

  it("supports negation", () => {
    const filters: PanelFilter[] = [{ type: "event_value", value: ">:1000", negate: true }];
    expect(evaluateFilters(filters, createDamageEvent({ amount: 1500 }), createContext())).toBe(false);
    expect(evaluateFilters(filters, createDamageEvent({ amount: 500 }), createContext())).toBe(true);
  });

  it("empty value passes all events", () => {
    const filters: PanelFilter[] = [{ type: "event_value", value: "" }];
    expect(evaluateFilters(filters, createDamageEvent({ amount: 999 }), createContext())).toBe(true);
  });

  it("invalid value passes all events", () => {
    const filters: PanelFilter[] = [{ type: "event_value", value: ">:abc" }];
    expect(evaluateFilters(filters, createDamageEvent({ amount: 999 }), createContext())).toBe(true);
  });
});

describe("event_type filter", () => {
  it("matches matching event type", () => {
    const filters: PanelFilter[] = [{ type: "event_type", value: ["damage"] }];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(true);
  });

  it("rejects non-matching event type", () => {
    const filters: PanelFilter[] = [{ type: "event_type", value: ["heal"] }];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(false);
  });

  it("matches any of multiple types", () => {
    const filters: PanelFilter[] = [{ type: "event_type", value: ["heal", "damage"] }];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(true);
  });

  it("negated excludes matching types", () => {
    const filters: PanelFilter[] = [{ type: "event_type", value: ["damage"], negate: true }];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(false);
  });

  it("empty value passes all events", () => {
    const filters: PanelFilter[] = [{ type: "event_type", value: [] }];
    expect(evaluateFilters(filters, createDamageEvent(), createContext())).toBe(true);
  });
});



