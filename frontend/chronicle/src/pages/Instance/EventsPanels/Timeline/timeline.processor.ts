/**
 * Timeline processor — multi-series, multi-stream time-binning processor.
 *
 * Subscribes to all event streams. Each configured series (from panelContext)
 * specifies which stream to listen to and optional filters. The processor
 * always stores raw sums; aggregation is applied at render time.
 */

import type { PanelProcessor, ProcessorEvent, ProcessorContext } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";
import type { AggregationType, TimelineSeriesConfig } from "./timelineTypes";
import { DEFAULT_BIN_MS, FALLBACK_SERIES_CONFIG, resolveStreamType } from "./timelineTypes";
import { compileFilters, type FilterPredicate } from "../processors/filters";

export interface TimelineSeriesMeta {
  name: string;
  color: string;
  aggregation: AggregationType;
}

export interface TimelinePlayerDeath {
  offsetMs: number;
  playerId: string;
  playerName: string;
  className: string;
}

export interface TimelineResult {
  /** seriesId → raw bin values (always sums) */
  series: Map<string, number[]>;
  /** Bin width in ms */
  binMs: number;
  /** Highest bin index seen + 1 */
  binCount: number;
  /** seriesId → display metadata for rendering */
  seriesMeta: Map<string, TimelineSeriesMeta>;
  /** Player deaths collected independently of configured chart series */
  playerDeaths: TimelinePlayerDeath[];
  /** Compiled per-series filter predicates (cached, not serialized) */
  _filterCache: Map<string, FilterPredicate>;
}

function getConfigs(context: ProcessorContext): TimelineSeriesConfig[] {
  const raw = context.panelContext?.timelineSeries;
  if (Array.isArray(raw) && raw.length > 0) return raw as TimelineSeriesConfig[];
  return FALLBACK_SERIES_CONFIG;
}

function getBinMs(context: ProcessorContext): number {
  const settings = context.panelContext?.timelineSettings;
  if (settings && typeof settings === "object" && "binMs" in settings) {
    return (settings as { binMs: number }).binMs;
  }
  return DEFAULT_BIN_MS;
}

/** Extract a numeric "amount" from any event type. Returns 0 for event types without amounts. */
function getEventAmount(event: ProcessorEvent): number {
  switch (event.type) {
    case "resource_change":
      return event.amount;
    case "extra_attack":
      return event.amount;
    case "heal":
      return event.amount;
    case "damage":
      return event.amount - event.overkill;
    case "slain":
      return 1; // count
    case "cast":
      return 1; // count
    case "aura":
      return 1; // count
    default:
      return 0;
  }
}

export const timelineProcessor: PanelProcessor<TimelineResult, ProcessorEvent> = {
  id: "timeline",
  streams: ["damage", "heal", "resource_change", "extra_attack", "slain"],
  processAllEvents: true, // Timeline manages its own per-series filtering internally

  createState: (): TimelineResult => ({
    series: new Map(),
    binMs: DEFAULT_BIN_MS,
    binCount: 0,
    seriesMeta: new Map(),
    playerDeaths: [],
    _filterCache: new Map(),
  }),

  processEvent: (
    state: TimelineResult,
    event: ProcessorEvent,
    encounterID: string,
    _firstTimestamp: Date,
    streamType: StreamType,
    context: ProcessorContext,
  ) => {
    const configs = getConfigs(context);
    const binMs = getBinMs(context);
    state.binMs = binMs;

    const offsetMs = event.globalOffsetMilli ?? event.offsetMilli;
    const binIndex = Math.max(0, Math.floor(offsetMs / binMs));
    const amount = getEventAmount(event);
    if (!context.selectedEncounterIds.has(encounterID)) {
      return;
    }

    if (streamType === "slain" && event.type === "slain") {
      const player = context.players[event.target];
      if (player) {
        state.playerDeaths.push({
          offsetMs,
          playerId: event.target,
          playerName: player.name,
          className: player.class,
        });
      }
    }

    for (const cfg of configs) {
      // Only process events from the stream this series cares about
      if (resolveStreamType(cfg.stream) !== streamType) continue;

      // Per-series filter: compile once, cache on state
      if (cfg.filters.length > 0) {
        let predicate = state._filterCache.get(cfg.id);
        if (!predicate) {
          predicate = compileFilters(cfg.filters, context);
          state._filterCache.set(cfg.id, predicate);
        }
        if (!predicate(event)) continue;
      }

      // Ensure series bins exist
      let bins = state.series.get(cfg.id);
      if (!bins) {
        bins = [];
        state.series.set(cfg.id, bins);
        state.seriesMeta.set(cfg.id, {
          name: cfg.name,
          color: cfg.color,
          aggregation: cfg.aggregation,
        });
      }

      // Grow array if needed
      while (bins.length <= binIndex) {
        bins.push(0);
      }

      // Effective healing: subtract overhealing from raw heal amount
      const amt = cfg.stream === "effective_heal" && event.type === "heal"
        ? event.amount - event.overheal
        : amount;
      bins[binIndex] += amt;

      if (binIndex + 1 > state.binCount) {
        state.binCount = binIndex + 1;
      }
    }
  },
};
