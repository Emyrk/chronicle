import { describe, expect, it } from "vitest";
import { getReplayResetTimestamp } from "./replaySelection";

const firstEncounter = {
  start: "2026-01-01T00:00:00.000Z",
  end: "2026-01-01T00:01:00.000Z",
};

const secondEncounter = {
  start: "2026-01-01T00:02:00.000Z",
  end: "2026-01-01T00:03:00.000Z",
};

describe("getReplayResetTimestamp", () => {
  it("resets an active replay to the new encounter start", () => {
    expect(getReplayResetTimestamp(firstEncounter, secondEncounter, true)).toEqual(
      new Date(secondEncounter.start),
    );
  });

  it("does not reset when replay is disabled", () => {
    expect(getReplayResetTimestamp(firstEncounter, secondEncounter, false)).toBeNull();
  });

  it("does not reset when the encounter selection is unchanged", () => {
    expect(getReplayResetTimestamp(firstEncounter, firstEncounter, true)).toBeNull();
  });

  it("does not reset without complete encounter bounds", () => {
    expect(
      getReplayResetTimestamp(firstEncounter, { start: undefined, end: undefined }, true),
    ).toBeNull();
  });
});
