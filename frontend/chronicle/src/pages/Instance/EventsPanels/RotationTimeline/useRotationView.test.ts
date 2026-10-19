import { describe, expect, it } from "vitest";
import { resolveSharedRotationView } from "./useRotationView";

describe("resolveSharedRotationView", () => {
  it("applies a shared timeline view without requiring a page remount", () => {
    expect(resolveSharedRotationView({
      align: "first_cast",
      follow: true,
      pinnedMs: 6500,
      window: { startMs: 5000, endMs: 15000 },
    }, 30_000)).toEqual({
      align: "first_cast",
      follow: true,
      pinnedMs: 6500,
      range: [5000, 15000],
    });
  });

  it("clamps remote windows and restores the whole fight when no window is shared", () => {
    expect(resolveSharedRotationView({ window: { startMs: 28_000, endMs: 40_000 } }, 30_000).range)
      .toEqual([18_000, 30_000]);
    expect(resolveSharedRotationView({}, 30_000).range).toEqual([0, 30_000]);
  });
});
