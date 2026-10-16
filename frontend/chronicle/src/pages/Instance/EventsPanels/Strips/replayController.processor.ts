/**
 * Replay controller strip data: party damage in 500ms bins and player deaths,
 * from the Timeline processor with a fixed series. `baseMs` turns its offsets
 * into absolute ms so the strip lines them up with the replay cursor.
 */

import type { PanelProcessor, ProcessorContext, ProcessorEvent } from "../processorTypes";
import { timelineProcessor, type TimelineResult } from "../Timeline/timeline.processor";
import type { TimelineSeriesConfig } from "../Timeline/timelineTypes";

// Fine bins; the strip groups them into bars sized to the fight (replayBucketMs).
export const REPLAY_CONTROLLER_BIN_MS = 500;
export const PARTY_DAMAGE_SERIES_ID = "party_damage";

const PARTY_DAMAGE_SERIES: TimelineSeriesConfig = {
  id: PARTY_DAMAGE_SERIES_ID,
  name: "Party damage",
  stream: "damage",
  aggregation: "sum",
  color: "#3b82f6",
  filters: [
    { type: "source_type", value: ["pet", "player"], applyTo: ["damage"] },
    { type: "target_type", value: ["enemy_pet", "enemy"], combinator: "and", applyTo: ["damage"] },
  ],
};

export interface ReplayControllerResult {
  timeline: TimelineResult;
  /** Absolute ms of global offset 0 (the first selected encounter's start), or null before any event. */
  baseMs: number | null;
}

// The Timeline processor reads its series and bin size from panelContext;
// one augmented context per worker context keeps that allocation-free.
const timelineContexts = new WeakMap<ProcessorContext, ProcessorContext>();

function timelineContext(context: ProcessorContext): ProcessorContext {
  let augmented = timelineContexts.get(context);
  if (!augmented) {
    augmented = {
      ...context,
      panelContext: {
        ...context.panelContext,
        timelineSeries: [PARTY_DAMAGE_SERIES],
        timelineSettings: { binMs: REPLAY_CONTROLLER_BIN_MS },
      },
    };
    timelineContexts.set(context, augmented);
  }
  return augmented;
}

export const replayControllerProcessor: PanelProcessor<ReplayControllerResult, ProcessorEvent> = {
  id: "replay_controller",
  streams: ["damage", "slain"],
  processAllEvents: true,
  createState: () => ({ timeline: timelineProcessor.createState(), baseMs: null }),
  processEvent: (state, event, encounterId, firstTimestamp, streamType, context) => {
    if (!context.selectedEncounterIds.has(encounterId)) return;
    if (state.baseMs === null) state.baseMs = firstTimestamp.getTime() + event.offsetMilli - (event.globalOffsetMilli ?? event.offsetMilli);
    timelineProcessor.processEvent(state.timeline, event, encounterId, firstTimestamp, streamType, timelineContext(context));
  },
};
