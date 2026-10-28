import { describe, expect, it } from "vitest";
import { addUsage, EMPTY_USAGE, formatCost, formatTokens, formatUsage, turnUsageByMessage } from "./usage";

const usage = (promptTokens: number, costUsd?: number) => ({ ...EMPTY_USAGE, promptTokens, completionTokens: 0, calls: 1, ...(costUsd !== undefined && { costUsd }) });

describe("usage", () => {
  it("adds costs only when some call reported one", () => {
    expect(addUsage(usage(1), usage(2))?.costUsd).toBeUndefined();
    expect(addUsage(usage(1), usage(2, 0.5))?.costUsd).toBe(0.5);
    expect(addUsage(undefined, usage(3))?.promptTokens).toBe(3);
  });

  it("formats costs and tokens compactly", () => {
    expect([formatCost(0), formatCost(0.000314), formatCost(0.0421), formatCost(1.234)]).toEqual(["$0", "$0.00031", "$0.042", "$1.23"]);
    expect([formatTokens(999), formatTokens(1234), formatTokens(45_678), formatTokens(2_500_000)]).toEqual(["999", "1.2k", "46k", "2.5M"]);
    expect(formatUsage(usage(1500, 0.0021))).toBe("1.5k tokens · $0.0021");
    expect(formatUsage(usage(10))).toBe("10 tokens");
  });

  it("shows a turn's usage on its last reply once the turn is finished", () => {
    const messages = [
      { id: "u1", role: "user" as const, content: "a" },
      { id: "a1", role: "assistant" as const, content: "x", usage: usage(1) },
      { id: "a2", role: "assistant" as const, content: "y", usage: usage(2) },
      { id: "u2", role: "user" as const, content: "b" },
      { id: "a3", role: "assistant" as const, content: "z", usage: usage(4) },
    ];
    expect([...turnUsageByMessage(messages, false)].map(([id, turn]) => [id, turn.promptTokens])).toEqual([["a2", 3], ["a3", 4]]);
    // The turn still streaming shows nothing yet.
    expect([...turnUsageByMessage(messages, true).keys()]).toEqual(["a2"]);
  });
});
