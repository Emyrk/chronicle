import { describe, expect, it } from "vitest";
import { HitTypeCrushing, HitTypeFullResist, HitTypeGlancing, HitTypeImmune, HitTypePartialAbsorb, HitTypePartialBlock, HitTypePartialResist } from "@/lib/hittype/hittype";
import type { ConsumeProcessorEvent, DamageProcessorEvent, ExtraAttackProcessorEvent, ProcessorContext, ResourceChangeProcessorEvent, ResurrectionProcessorEvent, SlainProcessorEvent, SpellStartProcessorEvent, UnitClassificationProcessorEvent } from "../processorTypes";
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
    expect(event.sourceClass).toBe("SHAMAN");
    expect(event.sourceIsEnemy).toBeUndefined();
    expect(event.targetClass).toBeUndefined();
    expect(event.targetIsEnemy).toBe(true);
    expect(event.spellId).toBe(10414);
    expect(event.damageTrailers).toEqual([
      { amount: 200, hitType: HitTypePartialAbsorb, labels: ["Partial Absorb"] },
      { amount: 100, hitType: HitTypePartialBlock, labels: ["Partial Block"] },
      { amount: 50, hitType: HitTypePartialResist, labels: ["Partial Resist"] },
    ]);
  });

  it("flags immune and fully resisted damage", () => {
    const state = allActivityProcessor.createState();
    const event = createDamageEvent();
    event.hitType = HitTypeImmune | HitTypeFullResist;

    allActivityProcessor.processEvent(
      state,
      event,
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "damage",
      createContext(),
    );

    expect(state.rawEventsByStream.damage[0].flags).toEqual(["IMMUNE", "FULL RESIST"]);
  });

  it("flags glancing and crushing damage", () => {
    const state = allActivityProcessor.createState();
    const event = createDamageEvent();
    event.hitType = HitTypeGlancing | HitTypeCrushing;

    allActivityProcessor.processEvent(
      state,
      event,
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "damage",
      createContext(),
    );

    expect(state.rawEventsByStream.damage[0].flags).toEqual(["GLANCING", "CRUSHING"]);
  });

  it("captures extra-attack spell details", () => {
    const state = allActivityProcessor.createState();
    const event: ExtraAttackProcessorEvent = {
      type: "extra_attack",
      index: 9,
      offsetMilli: 2250,
      target: "player",
      amount: 2,
      sourceName: "Windfury Attack",
      spellId: 25504,
      spellAttackOutcome: null,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };

    allActivityProcessor.processEvent(
      state,
      event,
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "extra_attack",
      createContext(),
    );

    expect(state.rawEventsByStream.extra_attack[0]).toMatchObject({
      sourceName: "Windfury Attack",
      spellId: 25504,
      extra: "extra attacks=2",
    });
  });

  it("captures resource type, waste, flag, and spell details", () => {
    const state = allActivityProcessor.createState();
    const event: ResourceChangeProcessorEvent = {
      type: "resource_change",
      index: 8,
      offsetMilli: 2000,
      caster: "player",
      sourceName: "Mana Tide Totem",
      target: "player",
      amount: 120,
      overResource: 20,
      resourceType: "Mana",
      direction: "Gain",
      spellId: 16190,
      spellAttackOutcome: null,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };

    allActivityProcessor.processEvent(
      state,
      event,
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "resource_change",
      createContext(),
    );

    expect(state.rawEventsByStream.resource_change[0]).toMatchObject({
      resourceType: "Mana",
      spellId: 16190,
      extra: "Gain · Mana · 20 wasted",
      flags: ["MANA"],
    });
  });

  it("captures slain attribution spell details", () => {
    const state = allActivityProcessor.createState();
    const event: SlainProcessorEvent = {
      type: "slain",
      index: 10,
      offsetMilli: 2500,
      target: "player",
      caster: "doan",
      attribution: {
        caster: "doan",
        sourceName: "Shadow Bolt",
        hitType: 0,
        amount: 900,
        school: 6,
        spellId: 11659,
        spellAttackOutcome: null,
      },
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };

    allActivityProcessor.processEvent(
      state,
      event,
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "slain",
      createContext(),
    );

    expect(state.rawEventsByStream.slain[0]).toMatchObject({
      sourceName: "Shadow Bolt",
      spellId: 11659,
    });
  });

  it("uses a concise message when slain attribution is unavailable", () => {
    const state = allActivityProcessor.createState();
    const event: SlainProcessorEvent = {
      type: "slain",
      index: 11,
      offsetMilli: 2750,
      target: "player",
      caster: "",
      attribution: null,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };

    allActivityProcessor.processEvent(
      state,
      event,
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "slain",
      createContext(),
    );

    expect(state.rawEventsByStream.slain[0]).toMatchObject({
      extra: "attribution unavailable",
      flags: ["NO ATTRIB"],
    });
  });

  it("flags possessed unit classifications", () => {
    const state = allActivityProcessor.createState();
    const event: UnitClassificationProcessorEvent = {
      type: "unit_classification",
      index: 12,
      offsetMilli: 3000,
      target: "doan",
      unitType: 2,
      affiliation: 2,
      owner: null,
      controller: "player",
      spellId: 605,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };

    allActivityProcessor.processEvent(
      state,
      event,
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "unit_classification",
      createContext(),
    );

    expect(state.rawEventsByStream.unit_classification[0]).toMatchObject({
      caster: "player",
      casterName: "Sathite",
      flags: ["POSSESSED"],
    });
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

  it("captures spell start messages and spell details", () => {
    const state = allActivityProcessor.createState();
    const event: SpellStartProcessorEvent = {
      type: "spell_start",
      index: 9,
      offsetMilli: 3000,
      caster: "player",
      target: "doan",
      spell: { id: 25364, name: "Frostbolt" },
      itemId: null,
      castFlags: 0,
      castTimeMilli: 2500,
      channelTimeMilli: 0,
      spellType: 0,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };
    const context = createContext();
    context.pagination = { offset: 0, limit: 100, abilityFilter: "frost" };

    allActivityProcessor.processEvent(
      state,
      event,
      "encounter",
      new Date("2026-07-14T17:41:42.709Z"),
      "spell_start",
      context,
    );

    expect(state.streamCounts.spell_start).toBe(1);
    expect(state.rawEventsByStream.spell_start[0]).toMatchObject({
      caster: "player",
      casterName: "Sathite",
      target: "doan",
      targetName: "Doan",
      sourceName: "Frostbolt",
      amount: 0,
      spellId: 25364,
      extra: "cast=2500ms",
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
      extra: "kind=Active at Pull · confidence=Effect Derived · consume=consume-123 · evidence=evidence-456 · item=13444 · candidates=13444|20002 · resource=Mana · projection",
      flags: ["SYNTHETIC", "ITEM", "PROJECTED"],
    });
  });
});
