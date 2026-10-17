import { describe, expect, it } from "vitest";
import { createDeathLogPanel } from "./DeathLog";
import { createDeathsProcessor, type DeathEvent } from "./deaths.processor";
import { getSortedDeathLogEvents } from "./deathLogEvents";
import { extractDeathWindow, updateDeathWindow } from "./deathBreakoutWindow";
import type { DamageProcessorEvent, ProcessorContext, ResurrectionProcessorEvent, SlainProcessorEvent, UnitResourcesProcessorEvent } from "../processorTypes";

describe("Death Log filters", () => {
  it("defaults to hiding zero-effective heals with an editable filter", () => {
    const panel = createDeathLogPanel();

    expect(panel.supportsFiltering).toBe(true);
    expect(panel.defaultFilters).toContainEqual({
      type: "event_value",
      value: "!=:0",
      applyTo: ["heal"],
    });
    expect(panel.fixedFilters).toBeUndefined();
  });
});

describe("Death Log resurrections", () => {
  it("aggregates resurrection details for player targets", () => {
    const player = "0x0000000000000001";
    const resurrector = "0x0000000000000002";
    const context: ProcessorContext = {
      players: {
        [player]: { name: "Fallen", class: "WARRIOR" },
        [resurrector]: { name: "Healer", class: "PRIEST" },
      },
      selectedEncounterIds: new Set(["encounter"]),
      entitySelection: { playerIds: new Set(), enemyIds: new Set() },
    };
    const event: ResurrectionProcessorEvent = {
      type: "ressurection",
      index: 2,
      offsetMilli: 3_000,
      source: resurrector,
      target: player,
      spell: { id: 2006, name: "Resurrection" },
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };
    const processor = createDeathsProcessor();
    const state = processor.createState();

    processor.processEvent(state, event, "encounter", new Date(10_000), "ressurection", context);

    expect(processor.streams).toContain("ressurection");
    expect(state.ResurrectionEvents).toEqual([{
      dateMilli: 13_000,
      offsetMilli: 3_000,
      playerID: player,
      playerName: "Fallen",
      className: "WARRIOR",
      resurrectorID: resurrector,
      resurrectorName: "Healer",
      spellID: 2006,
      spellName: "Resurrection",
      encounterID: "encounter",
    }]);
  });

  it("interleaves player deaths and resurrections chronologically, but excludes resurrections from enemy mode", () => {
    const processor = createDeathsProcessor();
    const state = processor.createState();
    state.DeathEvents = [{ dateMilli: 20_000, encounterID: "encounter" } as DeathEvent];
    state.EnemyDeathEvents = [{ dateMilli: 15_000, encounterID: "encounter" } as DeathEvent];
    state.ResurrectionEvents = [{
      dateMilli: 10_000,
      offsetMilli: 0,
      playerID: "player",
      playerName: "Player",
      className: "PRIEST",
      resurrectorID: "healer",
      resurrectorName: "Healer",
      spellID: 2006,
      spellName: "Resurrection",
      encounterID: "encounter",
    }];

    expect(getSortedDeathLogEvents(["encounter"], state, "players").map((event) => event.dateMilli)).toEqual([10_000, 20_000]);
    expect(getSortedDeathLogEvents(["encounter"], state, "enemies").map((event) => event.dateMilli)).toEqual([15_000]);
  });
});

describe("Death Log unit health", () => {
  it("retains unit-resource samples in the death recap for actual HP", () => {
    const player = "0x0000000000000001";
    const context: ProcessorContext = {
      players: { [player]: { name: "Fallen", class: "WARRIOR" } },
      selectedEncounterIds: new Set(["encounter"]),
      entitySelection: { playerIds: new Set(), enemyIds: new Set() },
    };
    const resources: UnitResourcesProcessorEvent = {
      type: "unit_resources",
      index: 1,
      offsetMilli: 1_000,
      unit: player,
      currentHealth: 7_500,
      maximumHealth: 10_000,
      absorb: 0,
      powerType: "rage",
      currentPower: 0,
      maximumPower: 100,
      attackPower: 0,
      spellPower: 0,
      unitLevel: 60,
      averageItemLevel: null,
      armor: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };
    const slain: SlainProcessorEvent = {
      type: "slain",
      index: 2,
      offsetMilli: 2_000,
      target: player,
      caster: "",
      attribution: null,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };
    const processor = createDeathsProcessor();
    const state = processor.createState();

    processor.processEvent(state, resources, "encounter", new Date(10_000), "unit_resources", context);
    processor.processEvent(state, slain, "encounter", new Date(10_000), "slain", context);

    expect(processor.streams).toContain("unit_resources");
    expect(state.DeathEvents[0].recap).toContainEqual(expect.objectContaining({
      type: "unit_resources",
      currentHealth: 7_500,
      maximumHealth: 10_000,
    }));
  });
});

describe("Death Log same-timestamp ordering", () => {
  it("includes a final hit logged after the death at the same timestamp", () => {
    const player = "0x0000000000000001";
    const enemy = "0xF130000000000001";
    const context: ProcessorContext = {
      players: { [player]: { name: "Speedhack", class: "ROGUE" } },
      units: { [enemy]: { name: "Soulflayer", owner: null, entry: 1 } },
      selectedEncounterIds: new Set(["encounter"]),
      entitySelection: { playerIds: new Set(), enemyIds: new Set() },
    };
    const preDeathHit: DamageProcessorEvent = {
      type: "damage",
      index: 11,
      offsetMilli: 21_200,
      caster: player,
      sourceName: "Poisonous Blood",
      target: player,
      hitType: 0,
      amount: 75,
      schools: [5],
      tailers: [],
      tailerCount: 0,
      spellId: null,
      spellAttackOutcome: null,
      overkill: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };
    const slain: SlainProcessorEvent = {
      type: "slain",
      index: 12,
      offsetMilli: 21_200,
      target: player,
      caster: "",
      attribution: null,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };
    const finalHit: DamageProcessorEvent = {
      ...preDeathHit,
      index: 13,
      caster: enemy,
      sourceName: "Auto Attack",
      amount: 794,
      schools: [2],
    };
    const processor = createDeathsProcessor();
    const state = processor.createState();

    processor.processEvent(state, preDeathHit, "encounter", new Date(10_000), "damage", context);
    processor.processEvent(state, slain, "encounter", new Date(10_000), "slain", context);
    processor.processEvent(state, finalHit, "encounter", new Date(10_000), "damage", context);

    expect(state.DeathEvents[0].recap).toEqual([
      expect.objectContaining({
        eventIndex: 11,
        offsetMilli: 21_200,
        sourceName: "Poisonous Blood",
        amount: 75,
      }),
      expect.objectContaining({
        eventIndex: 13,
        offsetMilli: 21_200,
        sourceName: "Auto Attack",
        amount: 794,
      }),
    ]);
  });
});

describe("Death Log breakout window", () => {
  it("defaults missing and invalid values to 30 seconds", () => {
    expect(extractDeathWindow(null)).toBe(30);
    expect(extractDeathWindow("m:players,w:nope")).toBe(30);
  });

  it("clamps numeric values and parses All", () => {
    expect(extractDeathWindow("w:2")).toBe(5);
    expect(extractDeathWindow("w:200")).toBe(120);
    expect(extractDeathWindow("w:all")).toBe("all");
  });

  it("updates the window while preserving unrelated options", () => {
    expect(updateDeathWindow("m:enemies,foo", "all")).toBe("m:enemies,foo,w:all");
    expect(updateDeathWindow("m:players,w:30", 45)).toBe("m:players,w:45");
  });
});
