import { describe, expect, it } from "vitest";
import { mapHostCapabilities, mapPreviewMaxSpeed, mapPreviewOn, type MapHostCapabilities } from "./mapHostModel";

const on = (caps: MapHostCapabilities) => Object.entries(caps).filter(([, value]) => value).map(([key]) => key).sort();

describe("Map host capabilities", () => {
  it("mini map (Summary): just the replay, with play, scrubber, preview veil and Expand", () => {
    expect(on(mapHostCapabilities("mini", false))).toEqual(
      ["compactCamera", "compactNotice", "compass", "expand", "framing", "header", "interactive", "playback", "presence", "previewVeil", "scrubber"],
    );
  });

  it("full map, inline: framed, with frames, settings, walk, plan, meters, fullscreen, jumps and notes", () => {
    expect(on(mapHostCapabilities("full", false))).toEqual([
      "compass", "framed", "frames", "framing", "fullscreen", "header", "hints", "interactive", "jumps",
      "meters", "notes", "plan", "presence", "settings", "video", "walk",
    ]);
  });

  it("immersive (fill window or fullscreen): the full map unframed, plus the encounter picker and Replay bar; the mini map expanded is the same", () => {
    const full = mapHostCapabilities("full", true);
    expect(full.framed).toBe(false);
    expect(full.immersiveChrome).toBe(true);
    expect(on(full)).toEqual(on({ ...mapHostCapabilities("full", false), framed: false, immersiveChrome: true }));
    expect(mapHostCapabilities("mini", true)).toEqual(full);
  });

  it("mobile: the replay alone, opened fullscreen with touch controls", () => {
    expect(on(mapHostCapabilities("mobile", false))).toEqual(["compass", "interactive", "mobileWorld", "presence"]);
    expect(mapHostCapabilities("mobile", true)).toEqual(mapHostCapabilities("mobile", false));
  });
});

describe("Map host preview", () => {
  it("plays its own loop while Replay is off on the mini and mobile maps, a whole run, and any fullscreen map", () => {
    expect(mapPreviewOn("mini", { wholeRun: false, immersive: false, replayOn: false })).toBe(true);
    expect(mapPreviewOn("mobile", { wholeRun: false, immersive: false, replayOn: false })).toBe(true);
    expect(mapPreviewOn("full", { wholeRun: true, immersive: false, replayOn: false })).toBe(true);
    expect(mapPreviewOn("full", { wholeRun: false, immersive: true, replayOn: false })).toBe(true);
    expect(mapPreviewOn("full", { wholeRun: false, immersive: false, replayOn: false })).toBe(false);
  });

  it("hands over to the page's Replay once it is on", () => {
    expect(mapPreviewOn("mini", { wholeRun: true, immersive: true, replayOn: true })).toBe(false);
  });

  it("caps a mobile whole run at 4x, and nothing else", () => {
    expect(mapPreviewMaxSpeed("mobile", true)).toBe(4);
    expect(mapPreviewMaxSpeed("mobile", false)).toBeUndefined();
    expect(mapPreviewMaxSpeed("full", true)).toBeUndefined();
  });
});
