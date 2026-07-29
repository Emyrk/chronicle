import { describe, expect, it } from "vitest";
import { timelinePreviewPercent, timelinePreviewTimeAtY } from "./eventTimelinePreview";

describe("event timeline preview mapping", () => {
  it("maps death to the top and the window start to the bottom", () => {
    expect(timelinePreviewPercent(0, 30_000)).toBe(0);
    expect(timelinePreviewPercent(-15_000, 30_000)).toBe(50);
    expect(timelinePreviewPercent(-30_000, 30_000)).toBe(100);
  });

  it("clamps event markers to the preview bounds", () => {
    expect(timelinePreviewPercent(1_000, 30_000)).toBe(0);
    expect(timelinePreviewPercent(-31_000, 30_000)).toBe(100);
  });

  it("maps preview pointer positions back to relative time", () => {
    expect(timelinePreviewTimeAtY(0, 200, 30_000)).toBe(0);
    expect(timelinePreviewTimeAtY(100, 200, 30_000)).toBe(-15_000);
    expect(timelinePreviewTimeAtY(200, 200, 30_000)).toBe(-30_000);
  });

  it("clamps pointer positions outside the preview", () => {
    expect(timelinePreviewTimeAtY(-10, 200, 30_000)).toBe(0);
    expect(timelinePreviewTimeAtY(250, 200, 30_000)).toBe(-30_000);
  });
});
