/**
 * Metrics processor - no-op processor for diagnostics panel.
 *
 * The Metrics panel reads timing data from PanelTimingContext and does not
 * require event stream aggregation.
 */

import type { PanelProcessor, ProcessorEvent, ProcessorContext } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";

export interface MetricsResult {
  // No worker state needed.
}

export const metricsProcessor: PanelProcessor<MetricsResult, ProcessorEvent> = {
  id: "metrics",
  streams: [],
  createState: (): MetricsResult => ({}),
  processEvent: (
    _state: MetricsResult,
    _event: ProcessorEvent,
    _encounterID: string,
    _firstTimestamp: Date,
    _streamType: StreamType,
    _context: ProcessorContext,
  ): void => {
    // No-op.
  },
};
