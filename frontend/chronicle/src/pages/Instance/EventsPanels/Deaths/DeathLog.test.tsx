import { describe, expect, it } from "vitest";
import { createDeathLogPanel } from "./DeathLog";
import { createDeathsProcessor, type DeathEvent } from "./deaths.processor";
import { getSortedDeathLogEvents } from "./deathLogEvents";
import { extractDeathWindow, updateDeathWindow } from "./deathBreakoutWindow";
import type { ProcessorContext, ResurrectionProcessorEvent } from "../processorTypes";

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
