import { describe, expect, it } from "vitest";
import { stripReplayProgress } from "./stripReplay";

const bounds = {
  start: new Date("2026-01-01T00:00:00.000Z"),
  end: new Date("2026-01-01T00:01:40.000Z"),
};

describe("stripReplayProgress", () => {
  it("returns null outside replay mode", () => {
    expect(stripReplayProgress(false, new Date("2026-01-01T00:00:50.000Z"), bounds)).toBeNull();
  });

  it("returns normalized replay progress", () => {
    expect(stripReplayProgress(true, new Date("2026-01-01T00:00:25.000Z"), bounds)).toBe(0.25);
  });

  it("clamps timestamps to the encounter bounds", () => {
    expect(stripReplayProgress(true, new Date("2025-12-31T23:59:59.000Z"), bounds)).toBe(0);
    expect(stripReplayProgress(true, new Date("2026-01-01T00:02:00.000Z"), bounds)).toBe(1);
  });
});
