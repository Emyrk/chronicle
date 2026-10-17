import { describe, expect, it } from "vitest";
import type {
  HealProcessorEvent,
  ProcessorContext,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
  SpellStartProcessorEvent,
  UnitResourcesProcessorEvent,
} from "../processorTypes";
import {
  enemyFrameUnits,
  orderRaidFramePlayers,
  activeCastAt,
  incomingHealsAt,
  recentInstantAt,
  latestResourceAt,
  raidFramesProcessor,
} from "./raidFrames.processor";

const PLAYER = "0x0000000000000001";
const OTHER_PLAYER = "0x0000000000000002";
const ENCOUNTER = "encounter-1";
const FIRST_TIMESTAMP = new Date("2026-01-01T00:00:00Z");

const meta = {
  index: 1,
  offsetMilli: 1_000,
  activity: [],
  activityCount: 0,
  isSynthetic: false,
};

function context(): ProcessorContext {
  return {
    players: {
      [PLAYER]: { name: "Healer", class: "PRIEST" },
      [OTHER_PLAYER]: { name: "Mage", class: "MAGE" },
    },
    selectedEncounterIds: new Set([ENCOUNTER]),
    entitySelection: { playerIds: new Set(), enemyIds: new Set() },
  };
}

function resources(overrides: Partial<UnitResourcesProcessorEvent> = {}): UnitResourcesProcessorEvent {
  return {
    ...meta,
    type: "unit_resources",
    unit: PLAYER,
    currentHealth: 3_500,
    maximumHealth: 5_000,
    absorb: 500,
    powerType: "Mana",
    currentPower: 2_000,
    maximumPower: 4_000,
    attackPower: 0,
    spellPower: 700,
    unitLevel: 60,
    averageItemLevel: null,
    armor: 1_000,
    ...overrides,
  };
}

function spellStart(overrides: Partial<SpellStartProcessorEvent> = {}): SpellStartProcessorEvent {
  return {
    ...meta,
    type: "spell_start",
    caster: PLAYER,
    target: OTHER_PLAYER,
    spell: { id: 2061, name: "Flash Heal" },
    itemId: null,
    castFlags: 0,
    castTimeMilli: 1_500,
    channelTimeMilli: 0,
    spellType: 0,
    ...overrides,
  };
}

function spellGo(overrides: Partial<SpellGoProcessorEvent> = {}): SpellGoProcessorEvent {
  return {
    ...meta,
    type: "spell_go",
    offsetMilli: 2_200,
    caster: PLAYER,
    target: OTHER_PLAYER,
    spell: { id: 2061, name: "Flash Heal" },
    numHits: 1,
    numMisses: 0,
    itemId: null,
    corpseOwner: null,
    ...overrides,
  };
}

function spellFail(overrides: Partial<SpellFailProcessorEvent> = {}): SpellFailProcessorEvent {
  return {
    ...meta,
    type: "spell_fail",
    offsetMilli: 1_600,
    caster: PLAYER,
    spell: { id: 2061, name: "Flash Heal" },
    failedByServer: false,
    ...overrides,
  };
}

function heal(overrides: Partial<HealProcessorEvent> = {}): HealProcessorEvent {
  return {
    ...meta,
    type: "heal",
    caster: OTHER_PLAYER,
    sourceName: "Mage",
    target: PLAYER,
    hitType: 0,
    amount: 1_200,
    overheal: 0,
    absorbed: 0,
    schools: [],
    spellId: 2061,
    spellAttackOutcome: null,
    ...overrides,
  };
}

describe("raidFramesProcessor", () => {
  it("keeps changing resource snapshots for players", () => {
    const state = raidFramesProcessor.createState();
    const ctx = context();

    raidFramesProcessor.processEvent(state, resources(), ENCOUNTER, FIRST_TIMESTAMP, "unit_resources", ctx);
    raidFramesProcessor.processEvent(state, resources({ offsetMilli: 1_500 }), ENCOUNTER, FIRST_TIMESTAMP, "unit_resources", ctx);
    raidFramesProcessor.processEvent(state, resources({ offsetMilli: 2_000, currentHealth: 4_000, currentPower: 1_500 }), ENCOUNTER, FIRST_TIMESTAMP, "unit_resources", ctx);
    raidFramesProcessor.processEvent(state, resources({ unit: "enemy" }), ENCOUNTER, FIRST_TIMESTAMP, "unit_resources", ctx);

    const samples = state.encounters.get(ENCOUNTER)?.resourcesByUnit.get(PLAYER) ?? [];
    expect(samples).toHaveLength(2);
    expect(samples[0]).toMatchObject({ currentHealth: 3_500, powerType: "mana" });
    expect(latestResourceAt(samples, FIRST_TIMESTAMP.getTime() + 1_999)?.currentHealth).toBe(3_500);
    expect(latestResourceAt(samples, FIRST_TIMESTAMP.getTime() + 2_000)?.currentPower).toBe(1_500);
    // Enemies are recorded too, for inspecting them.
    expect(state.encounters.get(ENCOUNTER)?.resourcesByUnit.get("enemy")).toHaveLength(1);
  });

  it("tracks active, completed, and failed casts", () => {
    const state = raidFramesProcessor.createState();
    const ctx = context();

    raidFramesProcessor.processEvent(state, spellStart(), ENCOUNTER, FIRST_TIMESTAMP, "spell_start", ctx);
    const casts = state.encounters.get(ENCOUNTER)?.castsByUnit.get(PLAYER) ?? [];
    const startMs = FIRST_TIMESTAMP.getTime() + 1_000;
    expect(activeCastAt(casts, startMs + 500)?.spellName).toBe("Flash Heal");
    expect(state.spellNames.get(casts[0].spellId)).toBe("Flash Heal");

    raidFramesProcessor.processEvent(state, spellGo(), ENCOUNTER, FIRST_TIMESTAMP, "spell_go", ctx);
    expect(casts[0].endMs).toBe(FIRST_TIMESTAMP.getTime() + 2_200);
    expect(activeCastAt(casts, FIRST_TIMESTAMP.getTime() + 2_200)).toBeNull();

    raidFramesProcessor.processEvent(state, spellStart({ offsetMilli: 3_000 }), ENCOUNTER, FIRST_TIMESTAMP, "spell_start", ctx);
    raidFramesProcessor.processEvent(state, spellFail({ offsetMilli: 3_400 }), ENCOUNTER, FIRST_TIMESTAMP, "spell_fail", ctx);
    expect(casts[1].failed).toBe(true);
    expect(activeCastAt(casts, FIRST_TIMESTAMP.getTime() + 3_300)?.spellName).toBe("Flash Heal");
    expect(activeCastAt(casts, FIRST_TIMESTAMP.getTime() + 3_500)).toBeNull();
  });

  it("records zero-cast-time spell_starts as instant casts, not lone spell_gos (procs)", () => {
    const state = raidFramesProcessor.createState();
    const ctx = context();
    const at = (offset: number) => FIRST_TIMESTAMP.getTime() + offset;
    const renew = { id: 6077, name: "Renew" };
    const process = (event: SpellStartProcessorEvent | SpellGoProcessorEvent | SpellFailProcessorEvent) =>
      raidFramesProcessor.processEvent(state, event, ENCOUNTER, FIRST_TIMESTAMP, event.type, ctx);

    // A timed cast finishing a little late still ends that cast.
    process(spellStart());
    process(spellGo({ offsetMilli: 2_700 }));
    // A proc: spell_go with no spell_start.
    process(spellGo({ offsetMilli: 3_000, spell: { id: 12536, name: "Clearcasting" } }));
    // An instant: spell_start with no cast time, then spell_go.
    process(spellStart({ offsetMilli: 4_000, spell: renew, castTimeMilli: 0 }));
    process(spellGo({ offsetMilli: 4_001, spell: renew }));
    // An instant that failed.
    process(spellStart({ offsetMilli: 6_000, spell: renew, castTimeMilli: 0 }));
    process(spellFail({ offsetMilli: 6_001, spell: renew }));

    const encounter = state.encounters.get(ENCOUNTER)!;
    expect(encounter.castsByUnit.get(PLAYER)?.[0].endMs).toBe(at(2_700));
    const instants = encounter.instantsByUnit.get(PLAYER) ?? [];
    expect(instants).toEqual([{ atMs: at(4_000), spellId: 6077, spellName: "Renew" }]);
    expect(recentInstantAt(instants, at(3_999), 1_000)).toBeNull();
    expect(recentInstantAt(instants, at(4_500), 1_000)?.spellName).toBe("Renew");
    expect(recentInstantAt(instants, at(5_000), 1_000)).toBeNull();
  });

  it("finds player heals landing inside the incoming window", () => {
    const state = raidFramesProcessor.createState();
    const ctx = context();

    raidFramesProcessor.processEvent(state, heal(), ENCOUNTER, FIRST_TIMESTAMP, "heal", ctx);
    raidFramesProcessor.processEvent(state, heal({ offsetMilli: 2_000, amount: 800 }), ENCOUNTER, FIRST_TIMESTAMP, "heal", ctx);
    raidFramesProcessor.processEvent(state, heal({ offsetMilli: 4_000 }), ENCOUNTER, FIRST_TIMESTAMP, "heal", ctx);
    raidFramesProcessor.processEvent(state, heal({ offsetMilli: 2_000, target: "enemy" }), ENCOUNTER, FIRST_TIMESTAMP, "heal", ctx);
    raidFramesProcessor.processEvent(state, heal({ offsetMilli: 2_500, amount: 0 }), ENCOUNTER, FIRST_TIMESTAMP, "heal", ctx);

    const heals = state.encounters.get(ENCOUNTER)?.healsByUnit.get(PLAYER) ?? [];
    expect(heals).toHaveLength(3);
    const base = FIRST_TIMESTAMP.getTime();
    expect(incomingHealsAt(heals, base + 1_000, 1_500).map((h) => h.amount)).toEqual([800]);
    expect(incomingHealsAt(heals, base + 500, 1_500).map((h) => h.amount)).toEqual([1_200, 800]);
    expect(incomingHealsAt(heals, base + 2_000, 1_500)).toEqual([]);
    expect(state.encounters.get(ENCOUNTER)?.healsByUnit.get("enemy")).toHaveLength(1);
    expect(heals[0]).toMatchObject({ spellId: 2061, sourceName: "Mage", overheal: 0 });
  });

  it("ignores unselected encounters", () => {
    const state = raidFramesProcessor.createState();
    raidFramesProcessor.processEvent(state, resources(), "other", FIRST_TIMESTAMP, "unit_resources", context());
    expect(state.encounters.size).toBe(0);
  });

  it("keeps the Raid Composition group layout", () => {
    const state = raidFramesProcessor.createState();
    const groupMemberGuids = Array<string>(40).fill("");
    groupMemberGuids[0] = OTHER_PLAYER;
    groupMemberGuids[5] = PLAYER;
    raidFramesProcessor.processEvent(state, { ...meta, type: "raid_group", groupMemberGuids }, ENCOUNTER, FIRST_TIMESTAMP, "raid_group", context());
    expect(state.composition.groups[0][0]).toBe(OTHER_PLAYER);
    expect(state.composition.groups[1][0]).toBe(PLAYER);
  });
});

describe("orderRaidFramePlayers", () => {
  const players = [["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"]] as const;

  it("keeps the fallback order without group data", () => {
    expect(orderRaidFramePlayers(players, [["", "", "", "", ""]])).toEqual(players);
  });

  it("orders by group, pads each group to five, then appends the ungrouped", () => {
    const ordered = orderRaidFramePlayers(players, [["c", "", "a", "", ""], ["", "", "", "", ""], ["b", "", "", "", ""]]);
    expect(ordered.map((entry) => entry?.[0] ?? null)).toEqual([
      "c", "a", null, null, null,
      "b", null, null, null, null,
      "d",
    ]);
  });
});

describe("enemyFrameUnits", () => {
  it("lists non-player, non-pet units with health, bosses first then by maximum health", () => {
    const sample = (maximumHealth: number) => ({ timestampMs: 0, currentHealth: maximumHealth, maximumHealth, absorb: 0, powerType: "mana", currentPower: 0, maximumPower: 0 });
    const encounter = {
      encounterId: ENCOUNTER, startMs: 0, endMs: 0, castsByUnit: new Map(),
      instantsByUnit: new Map(), healsByUnit: new Map(),
      resourcesByUnit: new Map([
        [PLAYER, [sample(4_000)]],
        ["pet", [sample(1_000)]],
        ["add-small", [sample(5_000)]],
        ["add-big", [sample(20_000)]],
        ["boss", [sample(10_000)]],
        ["no-health", [sample(0)]],
      ]),
    };
    const units = enemyFrameUnits(
      encounter,
      (guid) => guid === PLAYER,
      (guid) => (guid === "pet" ? PLAYER : null),
      (guid) => guid,
      new Set(["boss"]),
    );
    expect(units.map((unit) => unit.guid)).toEqual(["boss", "add-big", "add-small"]);
    // With the encounter's enemy list, units outside it are left out.
    expect(enemyFrameUnits(encounter, (guid) => guid === PLAYER, () => null, (guid) => guid, new Set(), new Set(["add-small"]))
      .map((unit) => unit.guid)).toEqual(["add-small"]);
  });
});

