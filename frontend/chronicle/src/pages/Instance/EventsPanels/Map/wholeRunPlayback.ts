import { useEffect, useRef, useState } from "react";

/** How far the panel has got loading one selection's data. */
export interface LoadCycle {
  key: string;
  seenLoading: boolean;
}

/**
 * The load cycle after a render. A fresh panel, or one given a new selection,
 * renders once with loading off and an empty (or the previous) result before
 * its loading effect runs, so a result only counts once loading has been seen
 * on for the current selection.
 */
export function nextLoadCycle(cycle: LoadCycle, key: string, loading: boolean): LoadCycle {
  if (cycle.key !== key) return { key, seenLoading: loading };
  if (loading && !cycle.seenLoading) return { key, seenLoading: true };
  return cycle;
}

/** Whether the current selection's load has finished. */
export function loadSettled(cycle: LoadCycle, loading: boolean): boolean {
  return cycle.seenLoading && !loading;
}

/** Whether the panel has finished loading the selection `key` (see nextLoadCycle). */
export function useLoadSettled(key: string, loading: boolean): boolean {
  const [cycle, setCycle] = useState<LoadCycle>(() => ({ key, seenLoading: loading }));
  const next = nextLoadCycle(cycle, key, loading);
  if (next !== cycle) setCycle(next);
  return loadSettled(next, loading);
}

/** Whether to make a once-only selection now, and whether it has been made. */
export function selectOnceStep(done: boolean, wanted: boolean): { select: boolean; done: boolean } {
  if (done || !wanted) return { select: false, done };
  return { select: true, done: true };
}

/** Calls `select` the first time `wanted` holds, never again for this component. */
export function useSelectOnce(wanted: boolean, select: (() => void) | undefined) {
  const done = useRef(false);
  useEffect(() => {
    if (!select) return;
    const step = selectOnceStep(done.current, wanted);
    done.current = step.done;
    if (step.select) select();
  }, [select, wanted]);
}

/**
 * Expand from the 2D mini map: it switches to the whole run and asks for
 * fullscreen in the same click. `requested` until the map is expanded;
 * `restoreChoice` is the whole-run choice to go back to.
 */
export type MiniExpand = { phase: "requested" | "expanded"; restoreChoice: boolean | null } | null;

/**
 * `immersive` / `inline`: the map entered or left fullscreen (or window
 * fullscreen); `refused`: the browser refused fullscreen; `unplayable`: the
 * whole run cannot play.
 */
export type MiniExpandEvent = "immersive" | "inline" | "refused" | "unplayable";

export interface MiniExpandStep {
  state: MiniExpand;
  /** Put the whole-run choice back to `restoreChoice`. */
  restore: boolean;
  restoreChoice: boolean | null;
  /** Fall back to the old Expand: the Map tab. */
  openMapTab: boolean;
  exitFullscreen: boolean;
}

/**
 * The next expand state. Leaving fullscreen puts the mini map back as it was;
 * a refused fullscreen or a whole run that cannot play falls back to the Map
 * tab. Repeated events are no-ops.
 */
export function miniExpandStep(state: MiniExpand, event: MiniExpandEvent): MiniExpandStep {
  const unchanged: MiniExpandStep = { state, restore: false, restoreChoice: null, openMapTab: false, exitFullscreen: false };
  if (!state) return unchanged;
  const done = { state: null, restore: true, restoreChoice: state.restoreChoice };
  switch (event) {
    case "immersive":
      return state.phase === "expanded" ? unchanged : { ...unchanged, state: { ...state, phase: "expanded" } };
    case "inline":
      // Still waiting for the browser: the map has not been expanded yet.
      return state.phase === "requested" ? unchanged : { ...done, openMapTab: false, exitFullscreen: false };
    case "refused":
      return { ...done, openMapTab: true, exitFullscreen: false };
    case "unplayable":
      return { ...done, openMapTab: true, exitFullscreen: true };
  }
}
