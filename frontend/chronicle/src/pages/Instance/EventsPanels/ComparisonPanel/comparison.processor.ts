/**
 * Comparison processor - A no-op processor.
 *
 * The Comparison panel doesn't process events itself; it reads
 * pre-computed chart data from other panels via ChartDataRegistry.
 */

import type { PanelProcessor } from "../processorTypes";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ComparisonResult {}

export const comparisonProcessor: PanelProcessor<ComparisonResult> = {
  id: "comparison",
  streams: [],
  createState: () => ({}),
  processEvent: () => {},
};
