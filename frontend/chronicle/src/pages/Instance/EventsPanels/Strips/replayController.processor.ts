/**
 * Replay controller strip data: party damage per 2s (the Timeline processor
 * with a fixed series), player deaths (from the same), and enemy cast starts
 * for the boss-cast markers. Times are absolute ms so the strip lines them up
 * with the replay cursor.
 */

import type { PanelProcessor, ProcessorContext, ProcessorEvent } from "../processorTypes";
import { timelineProcessor, type TimelineResult } from "../Timeline/timeline.processor";
import type { TimelineSeriesConfig } from "../Timeline/timelineTypes";

export const REPLAY_CONTROLLER_BIN_MS = 2000;
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

export interface ReplayControllerCast {
  timestampMs: number;
  caster: string;
  spellName: string;
}

export interface ReplayControllerResult {
  timeline: TimelineResult;
  /** Absolute ms of global offset 0 (the first selected encounter's start), or null before any event. */
  baseMs: number | null;
  /** Cast starts by non-player casters; the strip keeps the bosses'. */
  enemyCasts: ReplayControllerCast[];
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
  streams: ["damage", "slain", "spell_start"],
  processAllEvents: true,
  createState: () => ({ timeline: timelineProcessor.createState(), baseMs: null, enemyCasts: [] }),
  processEvent: (state, event, encounterId, firstTimestamp, streamType, context) => {
    if (!context.selectedEncounterIds.has(encounterId)) return;
    const timestampMs = firstTimestamp.getTime() + event.offsetMilli;
    if (state.baseMs === null) state.baseMs = timestampMs - (event.globalOffsetMilli ?? event.offsetMilli);
    if (event.type === "spell_start") {
      if (!context.players[event.caster]) {
        state.enemyCasts.push({ timestampMs, caster: event.caster, spellName: event.spell.name });
      }
      return;
    }
    timelineProcessor.processEvent(state.timeline, event, encounterId, firstTimestamp, streamType, timelineContext(context));
  },
};
