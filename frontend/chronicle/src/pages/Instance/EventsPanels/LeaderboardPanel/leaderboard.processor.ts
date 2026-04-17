import type { PanelProcessor, ProcessorEvent, ProcessorContext } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";

export interface LeaderboardPanelResult {
  // No data needed — leaderboard data comes from instance context, not event streams
}

export const leaderboardProcessor: PanelProcessor<LeaderboardPanelResult, ProcessorEvent> = {
  id: "leaderboard",
  streams: [],

  createState: (): LeaderboardPanelResult => ({}),

  processEvent: (
    _state: LeaderboardPanelResult,
    _event: ProcessorEvent,
    _encounterID: string,
    _firstTimestamp: Date,
    _streamType: StreamType,
    _context: ProcessorContext,
  ): void => {
    // No-op — speedrun proof is precomputed at parse time
  },
};
