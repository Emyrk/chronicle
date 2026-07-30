import { describe, expect, it } from "vitest";
import {
  buildPlayerActions,
  selectPlayerActionWindow,
} from "./playerActionCursor";
import type {
  PlayerActionEffect,
  PlayerActionEvent,
} from "./playerActionTimeline.processor";

function actionEvent(overrides: Partial<PlayerActionEvent>): PlayerActionEvent {
  return {
    eventIndex: 0,
    offsetMilli: 0,
    spellId: 1,
    spellName: "Test Spell",
    target: "target",
    eventType: "spell_go",
    castTimeMilli: 0,
    channelTimeMilli: 0,
    ...overrides,
  };
}

function effect(overrides: Partial<PlayerActionEffect>): PlayerActionEffect {
  return {
    eventIndex: 10,
    offsetMilli: 0,
    spellId: 1,
    spellName: "Test Spell",
    target: "target",
    effectType: "damage",
    amount: 100,
    periodic: false,
    ...overrides,
  };
}

describe("buildPlayerActions", () => {
  it("pairs cast starts with their completion and preserves instant casts", () => {
    const actions = buildPlayerActions([
      actionEvent({ eventIndex: 2, offsetMilli: 3_000, spellId: 2, spellName: "Instant" }),
      actionEvent({ eventIndex: 0, offsetMilli: 1_000, eventType: "spell_start", castTimeMilli: 1_500 }),
      actionEvent({ eventIndex: 1, offsetMilli: 2_500, eventType: "spell_go" }),
    ]);

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      spellName: "Test Spell",
      startMilli: 1_000,
      launchMilli: 2_500,
      durationMilli: 1_500,
      outcome: "completed",
    });
    expect(actions[1]).toMatchObject({
      spellName: "Instant",
      startMilli: 3_000,
      durationMilli: 0,
      outcome: "completed",
    });
  });

  it("correlates the first matching direct effect as the spell impact", () => {
    const [action] = buildPlayerActions([
      actionEvent({ eventIndex: 0, offsetMilli: 1_000, eventType: "spell_start", castTimeMilli: 1_500 }),
      actionEvent({ eventIndex: 1, offsetMilli: 2_500, eventType: "spell_go" }),
    ], [
      effect({ eventIndex: 10, offsetMilli: 2_750, periodic: true }),
      effect({ eventIndex: 11, offsetMilli: 3_100, target: "target" }),
    ]);

    expect(action).toMatchObject({
      launchMilli: 2_500,
      impactMilli: 3_100,
      impactTarget: "target",
    });
  });

  it("marks a matched failed cast as failed", () => {
    const [action] = buildPlayerActions([
      actionEvent({ eventIndex: 0, offsetMilli: 4_000, eventType: "spell_start", castTimeMilli: 2_000 }),
      actionEvent({ eventIndex: 1, offsetMilli: 4_700, eventType: "spell_fail" }),
    ]);

    expect(action).toMatchObject({ launchMilli: 4_700, outcome: "failed" });
  });
});

describe("selectPlayerActionWindow", () => {
  it("selects a launched spell as in flight until its matched impact", () => {
    const actions = buildPlayerActions([
      actionEvent({ eventIndex: 0, offsetMilli: 1_000, eventType: "spell_start", castTimeMilli: 1_000 }),
      actionEvent({ eventIndex: 1, offsetMilli: 2_000, eventType: "spell_go" }),
    ], [effect({ offsetMilli: 2_600 })]);

    const window = selectPlayerActionWindow(actions, 2_300);

    expect(window.activeAction).toBeNull();
    expect(window.inFlightAction?.spellName).toBe("Test Spell");
    expect(window.focusAction).toBe(window.inFlightAction);
  });

  it("selects an active cast and clips visible actions to the cursor window", () => {
    const actions = buildPlayerActions([
      actionEvent({ eventIndex: 0, offsetMilli: 10_000, eventType: "spell_start", castTimeMilli: 2_000 }),
      actionEvent({ eventIndex: 1, offsetMilli: 12_000, eventType: "spell_go" }),
      actionEvent({ eventIndex: 2, offsetMilli: 15_000, spellId: 2, spellName: "Next" }),
      actionEvent({ eventIndex: 3, offsetMilli: 30_000, spellId: 3, spellName: "Distant" }),
    ]);

    const window = selectPlayerActionWindow(actions, 11_000, 4_000, 6_000);

    expect(window.activeAction?.spellName).toBe("Test Spell");
    expect(window.nextAction?.spellName).toBe("Next");
    expect(window.focusAction).toBe(window.activeAction);
    expect(window.visibleActions.map((action) => action.spellName)).toEqual(["Test Spell", "Next"]);
  });
});
