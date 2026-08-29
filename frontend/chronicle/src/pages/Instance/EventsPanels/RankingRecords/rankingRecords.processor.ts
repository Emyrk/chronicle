import type { PanelProcessor, ProcessorEvent } from "../processorTypes";

export type RankingRecordsResult = Record<string, never>;

export const rankingRecordsProcessor: PanelProcessor<RankingRecordsResult, ProcessorEvent> = {
  id: "ranking_records",
  streams: [],
  createState: (): RankingRecordsResult => ({}),
  processEvent: (): void => {},
};
