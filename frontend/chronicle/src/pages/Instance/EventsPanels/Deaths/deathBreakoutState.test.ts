import { describe, expect, it } from "vitest";
import { extractOpenDeathRecaps, updateOpenDeathRecaps } from "./deathBreakoutState";

describe("death breakout panel state", () => {
  it("round-trips open recap keys while preserving other options", () => {
    const option = updateOpenDeathRecaps("m:players,w:10", ["encounter:player:1000:0", "key with spaces"]);

    expect(option).toContain("m:players");
    expect(option).toContain("w:10");
    expect(extractOpenDeathRecaps(option)).toEqual(new Set([
      "encounter:player:1000:0",
      "key with spaces",
    ]));
  });

  it("ignores malformed URI encoding from remote options", () => {
    expect(extractOpenDeathRecaps("m:players,o:%E0%A4%A~valid")).toEqual(new Set(["valid"]));
  });

  it("removes the open-recap token when no breakouts remain", () => {
    expect(updateOpenDeathRecaps("m:players,o:old,w:all", [])).toBe("m:players,w:all");
  });
});
