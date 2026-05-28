/**
 * Pulls & Cleanup processor - no event processing needed.
 * All data comes from encounter metadata (start_time, end_time, kill_type).
 */

import type { PanelProcessor, ProcessorEvent } from "../processorTypes";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PullsAndCleanupResult {
  // Empty - all data comes from context.instance.encounters
}

export const pullsAndCleanupProcessor: PanelProcessor<
  PullsAndCleanupResult,
  ProcessorEvent
> = {
  id: "pulls_and_cleanup",
  streams: [],
  createState: (): PullsAndCleanupResult => ({}),
  processEvent: (): void => {
    // No-op - this panel reads encounter metadata directly
  },
};
