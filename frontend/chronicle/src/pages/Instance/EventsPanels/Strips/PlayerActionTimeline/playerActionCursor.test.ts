import { describe, expect, it } from "vitest";
import {
  buildPlayerActions,
  selectPlayerActionWindow,
} from "./playerActionCursor";
import type { PlayerActionEvent } from "./playerActionTimeline.processor";

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
      endMilli: 2_500,
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

  it("marks a matched failed cast as failed", () => {
    const [action] = buildPlayerActions([
      actionEvent({ eventIndex: 0, offsetMilli: 4_000, eventType: "spell_start", castTimeMilli: 2_000 }),
      actionEvent({ eventIndex: 1, offsetMilli: 4_700, eventType: "spell_fail" }),
    ]);

    expect(action).toMatchObject({ endMilli: 4_700, outcome: "failed" });
  });
});

describe("selectPlayerActionWindow", () => {
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
