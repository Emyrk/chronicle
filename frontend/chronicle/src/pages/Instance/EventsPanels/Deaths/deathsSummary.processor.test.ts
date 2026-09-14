import { describe, expect, it } from "vitest";
import type { ProcessorContext, SlainProcessorEvent } from "../processorTypes";
import { deathsSummaryProcessor } from "./deathsSummary.processor";

const PLAYER = "0x0000000000000001";
const ENEMY = "0xF130000000000001";
const FIRST_TIMESTAMP = new Date(10_000);

function context(): ProcessorContext {
  return {
    players: {
      [PLAYER]: { name: "Player", class: "PRIEST" },
    },
    units: {
      [ENEMY]: { name: "Enemy", owner: null, entry: 1 },
    },
    selectedEncounterIds: new Set(["selected"]),
    entitySelection: { playerIds: new Set(), enemyIds: new Set() },
  };
}

function slain(target: string, caster: string): SlainProcessorEvent {
  return {
    type: "slain",
    index: 1,
    offsetMilli: 1_000,
    target,
    caster,
    attribution: null,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };
}

describe("deathsSummaryProcessor", () => {
  it("only requests slain events", () => {
    expect(deathsSummaryProcessor.streams).toEqual(["slain"]);
  });

  it("aggregates selected player deaths and killer details", () => {
    const state = deathsSummaryProcessor.createState();
    const processorContext = context();
    const event = slain(PLAYER, ENEMY);

    deathsSummaryProcessor.processEvent(state, event, "selected", FIRST_TIMESTAMP, "slain", processorContext);
    deathsSummaryProcessor.processEvent(state, event, "selected", FIRST_TIMESTAMP, "slain", processorContext);
    deathsSummaryProcessor.processEvent(state, event, "unselected", FIRST_TIMESTAMP, "slain", processorContext);

    expect(state.EncounterDeaths.has("unselected")).toBe(false);
    expect(state.EncounterDeaths.get("selected")?.get(PLAYER)).toEqual({
      playerID: PLAYER,
      playerName: "Player",
      className: "PRIEST",
      deathCount: 2,
      killers: new Map([
        [ENEMY, { killerID: ENEMY, killerName: "Enemy", count: 2 }],
      ]),
    });
  });

  it("keeps enemy deaths separate from player deaths", () => {
    const state = deathsSummaryProcessor.createState();

    deathsSummaryProcessor.processEvent(
      state,
      slain(ENEMY, PLAYER),
      "selected",
      FIRST_TIMESTAMP,
      "slain",
      context(),
    );

    expect(state.EncounterDeaths.size).toBe(0);
    expect(state.EncounterEnemyDeaths.get("selected")?.get(ENEMY)).toMatchObject({
      playerID: ENEMY,
      playerName: "Enemy",
      className: "ENEMY",
      deathCount: 1,
    });
  });
});
