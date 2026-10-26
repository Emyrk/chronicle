import { describe, expect, it } from "vitest";
import { mapAutoplayStart, parseMapPanelOptions, WATCH_MAP_PANEL_OPTION } from "./mapPanelOptions";

describe("Map panel options", () => {
  it("reads each token on its own and ignores others", () => {
    expect(parseMapPanelOptions(null)).toEqual({ wholeRun: false, autoplay: false, toolbarCollapsed: false });
    expect(parseMapPanelOptions("mini")).toEqual({ wholeRun: false, autoplay: false, toolbarCollapsed: false });
    expect(parseMapPanelOptions("wr")).toEqual({ wholeRun: true, autoplay: false, toolbarCollapsed: false });
    expect(parseMapPanelOptions(WATCH_MAP_PANEL_OPTION)).toEqual({ wholeRun: true, autoplay: true, toolbarCollapsed: true });
  });

  it("plays from the start, or with reduced motion stays paused on the first boss pull", () => {
    expect(mapAutoplayStart({ startMs: 1_000, firstPullMs: 60_000, reducedMotion: false })).toEqual({ timestampMs: 1_000, play: true });
    expect(mapAutoplayStart({ startMs: 1_000, firstPullMs: 60_000, reducedMotion: true })).toEqual({ timestampMs: 60_000, play: false });
    expect(mapAutoplayStart({ startMs: 1_000, firstPullMs: null, reducedMotion: true })).toEqual({ timestampMs: 1_000, play: false });
  });
});
