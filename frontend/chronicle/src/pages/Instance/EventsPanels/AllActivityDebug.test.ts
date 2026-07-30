import { describe, expect, it } from "vitest";
import { collectAllActivityEvents, eventDetail, eventValue } from "./allActivityEvents";
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
    isSynthetic: false,
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

  it("includes interrupt and absorbed rows", () => {
    const state = allActivityProcessor.createState();
    const interrupt = { ...spellEvent("spell_fail"), streamType: "interrupt" as const };
    const absorbed = { ...spellEvent("spell_fail"), streamType: "absorbed" as const, amount: 512 };
    state.rawEventsByStream.interrupt.push(interrupt);
    state.rawEventsByStream.absorbed.push(absorbed);

    expect(collectAllActivityEvents(state.rawEventsByStream)).toEqual([
      interrupt,
      absorbed,
    ]);
  });

  it("combines event outcomes with damage trailer summaries", () => {
    const event: RawDebugEvent = {
      ...spellEvent("spell_fail"),
      streamType: "damage",
      extra: "Crit · Fire",
      damageTrailers: [
        { amount: 120, hitType: 1, labels: ["Partial Absorb"] },
        { amount: 40, hitType: 2, labels: ["Partial Block"] },
      ],
      amount: 1842,
    };

    expect(eventDetail(event)).toBe("Crit · Fire · 120 absorb · 40 block");
    expect(eventValue(event)).toBe("1,842");
  });

  it("uses an em dash when a message has no useful primary value", () => {
    expect(eventValue(spellEvent("spell_start"))).toBe("—");
  });
});
