import { describe, expect, it } from "vitest";
import { formatRunDuration, runBadge, runStillUrl } from "./recentRuns";

describe("runBadge", () => {
  it("is a replay for a positional run", () => {
    expect(runBadge({ has_positions: true })).toBe("replay");
  });

  it("has no badge without positions", () => {
    expect(runBadge({ has_positions: false })).toBeNull();
  });
});

describe("formatRunDuration", () => {
  it("formats minutes and hours as a clock", () => {
    expect(formatRunDuration(28 * 60_000 + 42_000)).toBe("28:42");
    expect(formatRunDuration(3_723_000)).toBe("1:02:03");
  });

  it("is null without a duration", () => {
    expect(formatRunDuration(null)).toBeNull();
    expect(formatRunDuration(0)).toBeNull();
  });
});

describe("runStillUrl", () => {
  it("points at the instance's still endpoint", () => {
    expect(runStillUrl("abc")).toBe("/api/v1/raidlogs/instances/abc/still.jpg");
  });
});
