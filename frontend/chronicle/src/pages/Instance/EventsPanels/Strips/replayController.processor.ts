/**
 * Replay controller strip data: player deaths, from the Timeline processor
 * with no series. `baseMs` turns its offsets into absolute ms so the strip
 * lines them up with the replay cursor. (The bars, raid durability, come from
 * the Status processor in the strip.)
 */

import type { PanelProcessor, ProcessorContext, ProcessorEvent } from "../processorTypes";
import { timelineProcessor, type TimelineResult } from "../Timeline/timeline.processor";

const REPLAY_CONTROLLER_BIN_MS = 500;

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
        timelineSeries: [],
        timelineSettings: { binMs: REPLAY_CONTROLLER_BIN_MS },
      },
    };
    timelineContexts.set(context, augmented);
  }
  return augmented;
}

export const replayControllerProcessor: PanelProcessor<ReplayControllerResult, ProcessorEvent> = {
  id: "replay_controller",
  streams: ["slain"],
  processAllEvents: true,
  createState: () => ({ timeline: timelineProcessor.createState(), baseMs: null }),
  processEvent: (state, event, encounterId, firstTimestamp, streamType, context) => {
    if (!context.selectedEncounterIds.has(encounterId)) return;
    if (state.baseMs === null) state.baseMs = firstTimestamp.getTime() + event.offsetMilli - (event.globalOffsetMilli ?? event.offsetMilli);
    timelineProcessor.processEvent(state.timeline, event, encounterId, firstTimestamp, streamType, timelineContext(context));
  },
};
