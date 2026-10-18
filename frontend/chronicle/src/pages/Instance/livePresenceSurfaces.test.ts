import { describe, expect, it } from "vitest";
import { moveLivePresenceParticipant } from "./livePresenceSurfaces";

describe("moveLivePresenceParticipant", () => {
  it("tracks participants entering and leaving a surface", () => {
    const entered = moveLivePresenceParticipant({}, "peer-b", undefined, "map");
    expect(entered).toEqual({ map: ["peer-b"] });

    const joined = moveLivePresenceParticipant(entered, "peer-a", undefined, "map");
    expect(joined).toEqual({ map: ["peer-a", "peer-b"] });

    expect(moveLivePresenceParticipant(joined, "peer-b", "map", undefined))
      .toEqual({ map: ["peer-a"] });
    expect(moveLivePresenceParticipant({ map: ["peer-b"] }, "peer-b", "map", undefined))
      .toEqual({});
  });

  it("moves participants between surfaces without duplicating them", () => {
    const current = { map: ["peer-a"], timeline: ["peer-b"] };
    expect(moveLivePresenceParticipant(current, "peer-a", "map", "timeline"))
      .toEqual({ timeline: ["peer-a", "peer-b"] });
    expect(moveLivePresenceParticipant(current, "peer-a", "map", "map")).toBe(current);
  });
});
