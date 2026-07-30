import { describe, expect, it } from "vitest";
import type {
  HealProcessorEvent,
  ProcessorContext,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
  SpellStartProcessorEvent,
} from "../processorTypes";
import {
  healerCastsProcessor,
  healerCastComposition,
  healerCastStateAt,
  isTransientOffHealer,
  normalizedCastStartOffsets,
  normalizedCastStarts,
  type HealerCastEntry,
} from "./healerCasts.processor";

const HEALER = "0x0000000000000001";
const TARGET = "0x0000000000000002";

function context(): ProcessorContext {
  return {
    players: {
      [HEALER]: { name: "Healer", class: "PRIEST" },
      [TARGET]: { name: "Tank", class: "WARRIOR" },
    },
    selectedEncounterIds: new Set(["encounter-1"]),
    entitySelection: { playerIds: new Set(), enemyIds: new Set() },
  };
}

function start(overrides: Partial<SpellStartProcessorEvent> = {}): SpellStartProcessorEvent {
  return {
    type: "spell_start",
    index: 1,
    offsetMilli: 1_000,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    caster: HEALER,
    target: TARGET,
    spell: { id: 2060, name: "Greater Heal" },
    itemId: null,
    castFlags: 0,
    castTimeMilli: 2_500,
    channelTimeMilli: 0,
    spellType: 0,
    ...overrides,
  };
}

function complete(overrides: Partial<SpellGoProcessorEvent> = {}): SpellGoProcessorEvent {
  return {
    type: "spell_go",
    index: 2,
    offsetMilli: 3_500,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    caster: HEALER,
    target: TARGET,
    spell: { id: 2060, name: "Greater Heal" },
    numHits: 1,
    numMisses: 0,
    itemId: null,
    corpseOwner: null,
    ...overrides,
  };
}

function fail(overrides: Partial<SpellFailProcessorEvent> = {}): SpellFailProcessorEvent {
  return {
    type: "spell_fail",
    index: 2,
    offsetMilli: 2_000,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    caster: HEALER,
    spell: { id: 2060, name: "Greater Heal" },
    failedByServer: false,
    ...overrides,
  };
}

function heal(overrides: Partial<HealProcessorEvent> = {}): HealProcessorEvent {
  return {
    type: "heal",
    index: 3,
    offsetMilli: 3_500,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    caster: HEALER,
    sourceName: "Greater Heal",
    target: TARGET,
    hitType: 0,
    amount: 2_000,
    overheal: 500,
    absorbed: 0,
    school: 0,
    spellId: 2060,
    spellAttackOutcome: null,
    ...overrides,
  };
}

function entry(overrides: Partial<HealerCastEntry> = {}): HealerCastEntry {
  return {
    timestampMilli: 1_000,
    eventIndex: 1,
    spellId: 2060,
    spellName: "Greater Heal",
    targetId: TARGET,
    durationMilli: 2_500,
    kind: "start",
    amount: 0,
    overheal: 0,
    absorbed: 0,
    ...overrides,
  };
}

describe("healerCastComposition", () => {
  it("splits the cast bar by effective healing and overhealing", () => {
    expect(healerCastComposition({
      effective: 400,
      overheal: 600,
      absorbed: 0,
      targetIds: [TARGET],
    })).toEqual({ effectivePercent: 40, overhealPercent: 60 });
  });

  it("uses an entirely effective bar when no healing lands", () => {
    expect(healerCastComposition({
      effective: 0,
      overheal: 0,
      absorbed: 0,
      targetIds: [],
    })).toEqual({ effectivePercent: 100, overhealPercent: 0 });
  });
});

describe("normalizedCastStartOffsets", () => {
  it("normalizes displayed cast starts to the earliest cast", () => {
    const first = healerCastStateAt([entry()], 2_000);
    const second = healerCastStateAt([
      entry({ timestampMilli: 2_600, eventIndex: 2 }),
    ], 3_000);
    const idle = healerCastStateAt([], 3_000);

    expect(normalizedCastStartOffsets([first, second, idle])).toEqual([0, 1.6, null]);
  });

  it("assigns dense placements and ties simultaneous casts", () => {
    const states = [
      healerCastStateAt([entry({ timestampMilli: 2_600 })], 3_000),
      healerCastStateAt([entry({ timestampMilli: 1_000 })], 2_000),
      healerCastStateAt([entry({ timestampMilli: 2_600, eventIndex: 2 })], 3_000),
      healerCastStateAt([entry({ timestampMilli: 4_200 })], 5_000),
      healerCastStateAt([], 5_000),
    ];

    expect(normalizedCastStarts(states)).toEqual([
      { offsetSeconds: 1.6, placement: 2 },
      { offsetSeconds: 0, placement: 1 },
      { offsetSeconds: 1.6, placement: 2 },
      { offsetSeconds: 3.2, placement: 3 },
      null,
    ]);
  });
});

describe("healerCastsProcessor", () => {
  it("records cast lifecycle events with absolute encounter timestamps", () => {
    const state = healerCastsProcessor.createState();
    const firstTimestamp = new Date("2026-07-30T00:00:00Z");
    const ctx = context();

    healerCastsProcessor.processEvent(state, start(), "encounter-1", firstTimestamp, "spell_start", ctx);
    healerCastsProcessor.processEvent(state, complete(), "encounter-1", firstTimestamp, "spell_go", ctx);

    const casts = state.encounters.get("encounter-1")?.castsByPlayer.get(HEALER);
    expect(casts).toHaveLength(2);
    expect(casts?.[0]).toMatchObject({
      timestampMilli: firstTimestamp.getTime() + 1_000,
      spellName: "Greater Heal",
      targetId: TARGET,
      durationMilli: 2_500,
      kind: "start",
    });
    expect(casts?.[1].kind).toBe("complete");
  });

  it("ignores non-player casters and unselected encounters", () => {
    const state = healerCastsProcessor.createState();
    const ctx = context();

    healerCastsProcessor.processEvent(
      state,
      start({ caster: "0xF130000000000001" }),
      "encounter-1",
      new Date(0),
      "spell_start",
      ctx,
    );
    healerCastsProcessor.processEvent(state, start(), "other", new Date(0), "spell_start", ctx);

    expect(state.encounters.size).toBe(0);
  });
});

describe("healerCastStateAt", () => {
  it("returns active progress while a cast is in flight", () => {
    const state = healerCastStateAt([entry()], 2_000);
    expect(state.status).toBe("casting");
    expect(state.cast?.spellName).toBe("Greater Heal");
    expect(state.progress).toBeCloseTo(0.4);
  });

  it("exposes the known healing impact before the cast lands", () => {
    const completed = entry({ timestampMilli: 3_500, eventIndex: 2, durationMilli: 0, kind: "complete" });
    const impact = entry({
      timestampMilli: 3_500,
      eventIndex: 3,
      durationMilli: 0,
      kind: "heal",
      amount: 2_000,
      overheal: 500,
    });

    const state = healerCastStateAt([entry(), completed, impact], 2_000);
    expect(state.status).toBe("casting");
    expect(state.impact).toEqual({
      effective: 1_500,
      overheal: 500,
      absorbed: 0,
      targetIds: [TARGET],
    });
  });

  it("shows non-healers only while a known healing cast is active or fading", () => {
    const completed = entry({ timestampMilli: 3_500, eventIndex: 2, durationMilli: 0, kind: "complete" });
    const impact = entry({
      timestampMilli: 3_500,
      eventIndex: 3,
      durationMilli: 0,
      kind: "heal",
      amount: 2_000,
      overheal: 500,
    });

    expect(isTransientOffHealer(healerCastStateAt([entry()], 2_000))).toBe(false);
    expect(isTransientOffHealer(healerCastStateAt([entry(), completed, impact], 2_000))).toBe(true);
    expect(isTransientOffHealer(healerCastStateAt([entry(), completed, impact], 3_600))).toBe(true);
    expect(isTransientOffHealer(healerCastStateAt([entry(), completed, impact], 5_000))).toBe(false);
  });

  it("does not show an off-healer for a fully overhealed cast", () => {
    const completed = entry({ timestampMilli: 3_500, eventIndex: 2, durationMilli: 0, kind: "complete" });
    const overheal = entry({
      timestampMilli: 3_500,
      eventIndex: 3,
      durationMilli: 0,
      kind: "heal",
      amount: 2_000,
      overheal: 2_000,
    });

    const state = healerCastStateAt([entry(), completed, overheal], 2_000);
    expect(state.status).toBe("casting");
    expect(state.impact?.effective).toBe(0);
    expect(isTransientOffHealer(state)).toBe(false);
  });

  it("fills the bar when a cast completes", () => {
    const completed = entry({ timestampMilli: 3_500, eventIndex: 2, durationMilli: 0, kind: "complete" });
    const state = healerCastStateAt([entry(), completed], 3_600);

    expect(state.status).toBe("completed");
    expect(state.cast?.spellName).toBe("Greater Heal");
    expect(state.progress).toBe(1);
  });

  it("marks an in-flight cast when a future failure is already known", () => {
    const failed = entry({ timestampMilli: 2_000, eventIndex: 2, durationMilli: 0, kind: "fail" });
    const state = healerCastStateAt([entry(), failed], 1_500);

    expect(state.status).toBe("casting");
    expect(state.willCancel).toBe(true);
    expect(state.opacity).toBe(1);
  });

  it("shows a cancelled cast at the progress where it failed", () => {
    const failed = entry({ timestampMilli: 2_000, eventIndex: 2, durationMilli: 0, kind: "fail" });
    const state = healerCastStateAt([entry(), failed], 2_100);

    expect(state.status).toBe("cancelled");
    expect(state.cast?.spellName).toBe("Greater Heal");
    expect(state.progress).toBeCloseTo(0.4);
  });

  it("replaces an in-flight cast when a newer cast starts", () => {
    const first = entry();
    const second = entry({
      timestampMilli: 2_000,
      eventIndex: 2,
      spellId: 139,
      spellName: "Renew",
      durationMilli: 1_500,
    });

    const state = healerCastStateAt([first, second], 2_500);
    expect(state.status).toBe("casting");
    expect(state.cast?.spellName).toBe("Renew");
  });

  it("shows instant completed casts even when no cast start exists", () => {
    const instant = entry({
      timestampMilli: 2_000,
      eventIndex: 2,
      spellId: 139,
      spellName: "Renew",
      durationMilli: 0,
      kind: "complete",
    });

    const state = healerCastStateAt([instant], 2_100);
    expect(state.status).toBe("completed");
    expect(state.cast?.spellName).toBe("Renew");
    expect(state.progress).toBe(1);
  });

  it("aggregates effective healing and overhealing at cast impact", () => {
    const completed = entry({ timestampMilli: 3_500, eventIndex: 2, durationMilli: 0, kind: "complete" });
    const firstHeal = entry({
      timestampMilli: 3_500,
      eventIndex: 3,
      durationMilli: 0,
      kind: "heal",
      amount: 2_000,
      overheal: 500,
    });
    const secondHeal = entry({
      timestampMilli: 3_550,
      eventIndex: 4,
      targetId: "0x0000000000000003",
      durationMilli: 0,
      kind: "heal",
      amount: 1_000,
      overheal: 100,
      absorbed: 50,
    });

    const state = healerCastStateAt([entry(), completed, firstHeal, secondHeal], 3_600);
    expect(state.impact).toEqual({
      effective: 2_400,
      overheal: 600,
      absorbed: 50,
      targetIds: [TARGET, "0x0000000000000003"],
    });
  });

  it("fades terminal feedback over 1.5 seconds", () => {
    const completed = entry({ timestampMilli: 3_500, eventIndex: 2, durationMilli: 0, kind: "complete" });

    expect(healerCastStateAt([entry(), completed], 3_500).opacity).toBe(1);
    expect(healerCastStateAt([entry(), completed], 4_250).opacity).toBeCloseTo(0.5);
  });

  it("removes terminal feedback after 1.5 seconds", () => {
    const completed = entry({ timestampMilli: 3_500, eventIndex: 2, durationMilli: 0, kind: "complete" });
    const state = healerCastStateAt([entry(), completed], 5_000);

    expect(state.status).toBe("idle");
    expect(state.cast).toBeNull();
    expect(state.opacity).toBe(0);
  });

  it("handles heal and spell_fail events produced by the processor", () => {
    const state = healerCastsProcessor.createState();
    const ctx = context();
    healerCastsProcessor.processEvent(state, start(), "encounter-1", new Date(0), "spell_start", ctx);
    healerCastsProcessor.processEvent(state, fail(), "encounter-1", new Date(0), "spell_fail", ctx);
    healerCastsProcessor.processEvent(state, heal(), "encounter-1", new Date(0), "heal", ctx);

    const casts = state.encounters.get("encounter-1")?.castsByPlayer.get(HEALER) ?? [];
    expect(casts.map((cast) => cast.kind)).toEqual(["start", "fail", "heal"]);
    expect(healerCastStateAt(casts, 2_100).status).toBe("cancelled");
  });
});
