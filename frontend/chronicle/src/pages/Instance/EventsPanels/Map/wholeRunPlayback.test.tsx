import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { wholeRunUnplayable } from "./wholeRun";
import {
  loadSettled,
  miniExpandStep,
  nextLoadCycle,
  selectOnceStep,
  useLoadSettled,
  type LoadCycle,
  type MiniExpand,
} from "./wholeRunPlayback";

/** Replays a panel's renders (selection key, loading) through the load cycle; whether each render counts as settled. */
function settledAcross(renders: Array<[key: string, loading: boolean]>): boolean[] {
  let cycle: LoadCycle = { key: renders[0][0], seenLoading: renders[0][1] };
  return renders.map(([key, loading]) => {
    cycle = nextLoadCycle(cycle, key, loading);
    return loadSettled(cycle, loading);
  });
}

/** MapContent's load tracking feeding the 3D map's fallback, as on a panel's first render. */
function UnplayableProbe({ loading, message, webglUnavailable = false }: {
  loading: boolean;
  message: { pending?: boolean } | null;
  webglUnavailable?: boolean;
}) {
  const settled = useLoadSettled("a,b", loading);
  const unplayable = wholeRunUnplayable({ webglUnavailable, meshFailed: false, sceneMessage: message, settled });
  return <span>{unplayable ? "fallback" : "plays"}</span>;
}

describe("whole-run fallback timing", () => {
  it("does not fall back on a fresh panel's first render: empty result, loading not yet on", () => {
    // The panel's loading effect has not run yet, so the scene says "No position telemetry".
    expect(renderToStaticMarkup(<UnplayableProbe loading={false} message={{}} />)).toBe("<span>plays</span>");
  });

  it("still falls back at once without WebGL", () => {
    expect(renderToStaticMarkup(<UnplayableProbe loading={false} message={null} webglUnavailable />)).toBe("<span>fallback</span>");
  });

  it("counts a result only after loading has been on for the current selection", () => {
    expect(settledAcross([
      ["a,b", false], // fresh mount: empty result
      ["a,b", true], // loading
      ["a,b", true], // processing
      ["a,b", false], // done
    ])).toEqual([false, false, false, true]);
  });

  it("falls back after Expand on the 2D mini map, which mounts the 3D map on an already loaded selection", () => {
    // MapContent (which outlives the swap) saw the Summary load this selection;
    // Expand then mounts the 3D map with loading off, and it says "No position telemetry".
    const settled = settledAcross([
      ["a,b", false], // the Summary's panel mounts
      ["a,b", true], // loads
      ["a,b", false], // the 2D overview shows
      ["a,b", false], // Expand: the 3D map mounts, no new load
    ]);
    expect(settled[3]).toBe(true);
    expect(wholeRunUnplayable({ webglUnavailable: false, meshFailed: false, sceneMessage: {}, settled: settled[3] })).toBe(true);
  });

  it("starts over on a new selection, whose first render still shows the old result", () => {
    expect(settledAcross([
      ["a", true],
      ["a", false],
      ["a,b", false], // new selection, its load not started
      ["a,b", true],
      ["a,b", false],
    ])).toEqual([false, true, false, false, true]);
  });
});

describe("selectOnceStep", () => {
  it("selects the first time it is wanted, and never again", () => {
    let done = false;
    const selections = [false, true, true, false, true].map((wanted) => {
      const step = selectOnceStep(done, wanted);
      done = step.done;
      return step.select;
    });
    expect(selections).toEqual([false, true, false, false, false]);
  });
});

describe("miniExpandStep", () => {
  const requested: MiniExpand = { phase: "requested", restoreChoice: null };

  it("does nothing without an expansion under way", () => {
    for (const event of ["immersive", "inline", "refused", "unplayable"] as const) {
      const step = miniExpandStep(null, event);
      expect(step).toMatchObject({ state: null, restore: false, openMapTab: false, exitFullscreen: false });
    }
  });

  it("waits for the browser, then is expanded", () => {
    expect(miniExpandStep(requested, "inline").state).toBe(requested);
    const expanded = miniExpandStep(requested, "immersive").state;
    expect(expanded).toEqual({ phase: "expanded", restoreChoice: null });
    // Repeated reports (window fullscreen to browser fullscreen) change nothing.
    expect(miniExpandStep(expanded, "immersive").state).toBe(expanded);
  });

  it("puts the mini map back as it was on leaving fullscreen", () => {
    const step = miniExpandStep({ phase: "expanded", restoreChoice: null }, "inline");
    expect(step).toEqual({ state: null, restore: true, restoreChoice: null, openMapTab: false, exitFullscreen: false });
  });

  it("falls back to the Map tab when fullscreen is refused", () => {
    expect(miniExpandStep(requested, "refused")).toEqual({ state: null, restore: true, restoreChoice: null, openMapTab: true, exitFullscreen: false });
  });

  it("leaves fullscreen for the Map tab when the whole run cannot play", () => {
    const step = miniExpandStep({ phase: "expanded", restoreChoice: false }, "unplayable");
    expect(step).toEqual({ state: null, restore: true, restoreChoice: false, openMapTab: true, exitFullscreen: true });
  });
});
