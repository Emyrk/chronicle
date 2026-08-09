/**
 * Vehicle processor - no-op because vehicle control timelines are instance metadata.
 * Runs in the Web Worker to satisfy the standard panel contract.
 */

import type { PanelProcessor, ProcessorEvent } from "../processorTypes";

export type VehicleResult = Record<string, never>;

export const vehicleProcessor: PanelProcessor<VehicleResult, ProcessorEvent> = {
  id: "vehicle",
  streams: [],
  createState: (): VehicleResult => ({}),
  processEvent: () => {},
};
