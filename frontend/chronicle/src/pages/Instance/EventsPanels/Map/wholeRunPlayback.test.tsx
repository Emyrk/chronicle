import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  loadSettled,
  miniExpandStep,
  nextLoadCycle,
  selectOnceStep,
  useWholeRunUnplayable,
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

function UnplayableProbe({ loading, message }: { loading: boolean; message: { pending?: boolean } | null }) {
  const unplayable = useWholeRunUnplayable({
    selectionKey: "a,b",
    loading,
    webglUnavailable: false,
    meshFailed: false,
    sceneMessage: message,
  });
  return <span>{unplayable ? "fallback" : "plays"}</span>;
}

describe("whole-run fallback timing", () => {
  it("does not fall back on a fresh panel's first render: empty result, loading not yet on", () => {
    // The panel's loading effect has not run yet, so the scene says "No position telemetry".
    expect(renderToStaticMarkup(<UnplayableProbe loading={false} message={{}} />)).toBe("<span>plays</span>");
  });

  it("still falls back at once without WebGL", () => {
    const markup = renderToStaticMarkup(<FallbackProbeNoWebgl />);
    expect(markup).toBe("<span>fallback</span>");
  });

  it("counts a result only after loading has been on for the current selection", () => {
    expect(settledAcross([
      ["a,b", false], // fresh mount: empty result
      ["a,b", true], // loading
      ["a,b", true], // processing
      ["a,b", false], // done
    ])).toEqual([false, false, false, true]);
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

function FallbackProbeNoWebgl() {
  const unplayable = useWholeRunUnplayable({
    selectionKey: "a,b",
    loading: false,
    webglUnavailable: true,
    meshFailed: false,
    sceneMessage: null,
  });
  return <span>{unplayable ? "fallback" : "plays"}</span>;
}

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
