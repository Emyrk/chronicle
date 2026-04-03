/**
 * Possession processor — tracks mind control / possession intervals from unit_classification events.
 * Runs in Web Worker (no React, no JSX).
 */

import type { PanelProcessor, UnitClassificationProcessorEvent } from "../processorTypes";

export interface PossessionInterval {
  targetGuid: string;
  controllerGuid: string;
  spellId: number;
  affiliation: number; // 0=Unknown, 1=Friendly, 2=Hostile, 3=Neutral
  startOffsetMilli: number;
  endOffsetMilli: number | null; // null = ongoing at encounter end
  encounterID: string;
}

export interface PossessionResult {
  intervals: PossessionInterval[];
  /** Used during processing to track open possessions — Maps are serialized by worker */
  openByTarget: Map<string, PossessionInterval>;
}

export const possessionProcessor: PanelProcessor<PossessionResult, UnitClassificationProcessorEvent> = {
  id: "possession",
  streams: ["unit_classification"],
  createState: (): PossessionResult => ({ intervals: [], openByTarget: new Map() }),
  processEvent: (state, event, encounterID) => {
    const open = state.openByTarget.get(event.target);
    if (event.controller && !open) {
      // Possession started
      const interval: PossessionInterval = {
        targetGuid: event.target,
        controllerGuid: event.controller!,
        spellId: event.spellId,
        affiliation: event.affiliation,
        startOffsetMilli: event.offsetMilli,
        endOffsetMilli: null,
        encounterID,
      };
      state.intervals.push(interval);
      state.openByTarget.set(event.target, interval);
    } else if (!event.controller && open) {
      // Possession ended
      open.endOffsetMilli = event.offsetMilli;
      state.openByTarget.delete(event.target);
    }
  },
};
