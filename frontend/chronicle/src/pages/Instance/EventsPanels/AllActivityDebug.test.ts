import { describe, expect, it } from "vitest";
import { collectAllActivityEvents } from "./allActivityEvents";
import { allActivityProcessor, type RawDebugEvent } from "./processors";

function spellEvent(streamType: "spell_start" | "spell_fail"): RawDebugEvent {
  return {
    index: 1,
    offsetMilli: 1000,
    dateMilli: 1000,
    encounterID: "encounter",
    streamType,
    caster: "player",
    casterName: "Player",
    sourceName: "Frostbolt",
    target: "target",
    targetName: "Target",
    amount: 0,
  };
}

describe("collectAllActivityEvents", () => {
  it("includes spell start and spell fail rows", () => {
    const state = allActivityProcessor.createState();
    const spellStart = spellEvent("spell_start");
    const spellFail = spellEvent("spell_fail");
    state.rawEventsByStream.spell_start.push(spellStart);
    state.rawEventsByStream.spell_fail.push(spellFail);

    expect(collectAllActivityEvents(state.rawEventsByStream)).toEqual([
      spellStart,
      spellFail,
    ]);
  });
});
