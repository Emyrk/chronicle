import { describe, expect, it } from "vitest";
import { HitTypePartialAbsorb, HitTypePartialBlock, HitTypePartialResist } from "@/lib/hittype/hittype";
import type { ConsumeProcessorEvent, DamageProcessorEvent, ProcessorContext, ResurrectionProcessorEvent } from "../processorTypes";
import { allActivityProcessor } from "./allActivityDebug.processor";

function createContext(): ProcessorContext {
  return {
    players: {
      player: { name: "Sathite", class: "SHAMAN" },
    },
    units: {
      doan: { name: "Doan", owner: null, entry: 25223 },
    },
    selectedEncounterIds: new Set(["encounter"]),
    entitySelection: {
      enemyIds: new Set(),
      playerIds: new Set(),
    },
  };
}

function createDamageEvent(): DamageProcessorEvent {
  return {
    type: "damage",
    index: 7,
    offsetMilli: 1250,
    caster: "player",
    sourceName: "Earth Shock",
    target: "doan",
    hitType: 0,
    amount: 800,
    school: 5,
    tailers: [
      { amount: 200, hitType: HitTypePartialAbsorb },
      { amount: 100, hitType: HitTypePartialBlock },
      { amount: 50, hitType: HitTypePartialResist },
    ],
    tailerCount: 3,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    spellId: 10414,
    spellAttackOutcome: null,
    overkill: 0,
  };
}

describe("allActivityProcessor", () => {
  it("preserves damage trailer amounts and readable outcome labels", () => {
    const state = allActivityProcessor.createState();

    allActivityProcessor.processEvent(
      state,
      createDamageEvent(),
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "damage",
      createContext(),
    );

    const event = state.rawEventsByStream.damage[0];
    expect(event.damageTrailers).toEqual([
      { amount: 200, hitType: HitTypePartialAbsorb, labels: ["Partial Absorb"] },
      { amount: 100, hitType: HitTypePartialBlock, labels: ["Partial Block"] },
      { amount: 50, hitType: HitTypePartialResist, labels: ["Partial Resist"] },
    ]);
  });

  it("captures resurrection source, target, and spell details", () => {
    const state = allActivityProcessor.createState();
    const event: ResurrectionProcessorEvent = {
      type: "ressurection",
      index: 8,
      offsetMilli: 2500,
      source: "player",
      target: "doan",
      spell: { id: 48949, name: "Redemption" },
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };

    allActivityProcessor.processEvent(
      state,
      event,
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "ressurection",
      createContext(),
    );

    expect(state.rawEventsByStream.ressurection[0]).toMatchObject({
      caster: "player",
      casterName: "Sathite",
      target: "doan",
      targetName: "Doan",
      sourceName: "Redemption",
      spellId: 48949,
      extra: "resurrected",
    });
  });

  it("captures consume identity and evidence details", () => {
    const state = allActivityProcessor.createState();
    const event: ConsumeProcessorEvent = {
      type: "consume",
      index: 9,
      offsetMilli: -1500,
      consumeId: "consume-123",
      evidenceId: "evidence-456",
      player: "player",
      itemId: 13444,
      candidateItemIds: [13444, 20002],
      candidateItemIdsCount: 2,
      spell: { id: 24361, name: "Major Mana Potion" },
      kind: 7,
      confidence: 2,
      consumedAtUnixMilli: null,
      observedAtUnixMilli: 1785250000000,
      amount: 1800,
      resourceType: "Mana",
      isProjection: true,
      activity: [],
      activityCount: 0,
      isSynthetic: true,
    };

    allActivityProcessor.processEvent(
      state,
      event,
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "consume",
      createContext(),
    );

    expect(state.streamCounts.consume).toBe(1);
    expect(state.rawEventsByStream.consume[0]).toMatchObject({
      caster: "player",
      casterName: "Sathite",
      sourceName: "Major Mana Potion",
      amount: 1800,
      spellId: 24361,
      extra: "kind=Active at Pull confidence=Effect Derived consume=consume-123 evidence=evidence-456 item=13444 candidates=13444|20002 resource=Mana projection",
    });
  });
});
