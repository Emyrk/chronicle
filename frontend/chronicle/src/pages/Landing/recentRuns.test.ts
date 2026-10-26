import { describe, expect, it } from "vitest";
import { formatRunDuration, runBadge, runStillUrl } from "./recentRuns";

describe("runBadge", () => {
  it("is 3D only for a positional run on a meshed map", () => {
    expect(runBadge({ has_positions: true }, "3d")).toBe("3d");
    expect(runBadge({ has_positions: true }, "2d")).toBe("2d");
    expect(runBadge({ has_positions: true }, "coming")).toBe("2d");
  });

  it("has no badge without positions", () => {
    expect(runBadge({ has_positions: false }, "3d")).toBeNull();
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
