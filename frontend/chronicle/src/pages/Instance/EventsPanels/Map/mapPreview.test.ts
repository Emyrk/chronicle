import { describe, expect, it } from "vitest";
import { previewCursorMs, previewElapsedAt, previewSpeed } from "./useMapScene";

describe("mini map preview clock", () => {
  it("plays a loop in about 90 seconds, never slower than real time", () => {
    expect(previewSpeed(30_000)).toBe(1);
    expect(previewSpeed(6 * 60_000)).toBe(4);
    expect(previewSpeed(4 * 60 * 60_000)).toBe(32);
  });

  it("can cap long whole-run previews for a calmer mobile map", () => {
    expect(previewSpeed(4 * 60 * 60_000, 4)).toBe(4);
    expect(previewCursorMs(0, 60 * 60_000, 1_000, 4)).toBe(4_000);
  });

  it("loops through the encounter from its start", () => {
    // A 6 minute fight at 4x: 45 s of real time is the middle, 90 s wraps to the start.
    const startMs = 1_000;
    const endMs = startMs + 6 * 60_000;
    expect(previewCursorMs(startMs, endMs, 0)).toBe(startMs);
    expect(previewCursorMs(startMs, endMs, 45_000)).toBe(startMs + 3 * 60_000);
    expect(previewCursorMs(startMs, endMs, 90_000)).toBe(startMs);
  });

  it("finds the elapsed time that puts the preview at a replay moment", () => {
    // A 6 minute fight at 4x: three minutes in is 45 s of preview.
    const startMs = 1_000;
    const endMs = startMs + 6 * 60_000;
    expect(previewElapsedAt(startMs, endMs, startMs + 3 * 60_000)).toBe(45_000);
    expect(previewCursorMs(startMs, endMs, previewElapsedAt(startMs, endMs, startMs + 100_000))).toBe(startMs + 100_000);
  });

  it("clamps moments outside the encounter, short of the loop's wrap", () => {
    const startMs = 1_000;
    const endMs = startMs + 6 * 60_000;
    expect(previewElapsedAt(startMs, endMs, 0)).toBe(0);
    const atEnd = previewCursorMs(startMs, endMs, previewElapsedAt(startMs, endMs, endMs + 60_000));
    expect(atEnd).toBeGreaterThan(endMs - 1_000);
    expect(atEnd).toBeLessThan(endMs);
  });
});
