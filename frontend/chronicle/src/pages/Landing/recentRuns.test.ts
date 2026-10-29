import { describe, expect, it } from "vitest";
import { formatRunDuration } from "./recentRuns";

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
