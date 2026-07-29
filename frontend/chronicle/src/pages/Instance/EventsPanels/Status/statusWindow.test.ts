import { describe, expect, it } from "vitest";
import { parseStatusWindow, updateStatusWindow } from "./statusWindow";

describe("Status timeline window options", () => {
  it("uses the standard window by default", () => {
    expect(parseStatusWindow(null)).toMatchObject({
      id: "standard",
      historyMilli: 10_000,
      futureMilli: 40_000,
    });
  });

  it("offers a tight window for dense event timelines", () => {
    expect(parseStatusWindow("w:tight")).toMatchObject({
      id: "tight",
      historyMilli: 2_000,
      futureMilli: 8_000,
    });
  });

  it("parses a persisted preset", () => {
    expect(parseStatusWindow("u:pets,w:compact")).toMatchObject({
      id: "compact",
      historyMilli: 5_000,
      futureMilli: 20_000,
    });
  });

  it("updates the preset while preserving unrelated panel options", () => {
    expect(updateStatusWindow("u:pets,w:compact,f:player", "extended")).toBe(
      "u:pets,f:player,w:extended",
    );
    expect(updateStatusWindow("u:pets,w:extended", "standard")).toBe("u:pets");
  });
});
