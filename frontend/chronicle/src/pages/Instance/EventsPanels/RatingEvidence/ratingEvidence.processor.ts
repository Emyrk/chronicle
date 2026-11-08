import type { PanelProcessor, ProcessorEvent } from "../processorTypes";

export type RatingEvidenceResult = Record<string, never>;

export const ratingEvidenceProcessor: PanelProcessor<RatingEvidenceResult, ProcessorEvent> = {
  id: "rating_evidence",
  streams: [],
  createState: (): RatingEvidenceResult => ({}),
  processEvent: (): void => {},
};
