import { describe, expect, it } from "vitest";
import { parseStatusFocuses, updateStatusFocuses } from "./statusFocus";

describe("Status breakout focus options", () => {
  it("parses multiple focused units", () => {
    expect([...parseStatusFocuses("hide-dead,f:player-1,f:player-2")]).toEqual([
      "player-1",
      "player-2",
    ]);
  });

  it("replaces focused units while preserving other panel options", () => {
    expect(updateStatusFocuses(
      "u:enemies,f:old-player,w:compact",
      ["player-1", "player-2"],
    )).toBe("u:enemies,w:compact,f:player-1,f:player-2");
  });

  it("removes all focus tokens when every breakout closes", () => {
    expect(updateStatusFocuses("f:player-1,f:player-2,w:tight", [])).toBe("w:tight");
  });
});
