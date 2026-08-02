import type { StatusRaidHealthModel } from "../Status/statusRaidHealth";
import { statusRaidHealthTimeline } from "../Status/statusRaidHealth";

export interface TimelineRaidDurabilityBar {
  startSec: number;
  endSec: number;
  percent: number;
  color: string;
}

export function timelineRaidDurabilityColor(percent: number): string {
  if (percent < 25) return "#ef4444";
  if (percent < 55) return "#f59e0b";
  return "#10b981";
}

export function createTimelineRaidDurabilityBars(
  model: StatusRaidHealthModel,
  encounterStartMilli: number,
  durationMs: number,
  bucketCount = 96,
): TimelineRaidDurabilityBar[] {
  if (durationMs <= 0) return [];

  return statusRaidHealthTimeline(
    model,
    encounterStartMilli,
    encounterStartMilli + durationMs,
    bucketCount,
  ).map((bucket) => ({
    startSec: (bucket.startMilli - encounterStartMilli) / 1000,
    endSec: (bucket.endMilli - encounterStartMilli) / 1000,
    percent: bucket.percent,
    color: timelineRaidDurabilityColor(bucket.percent),
  }));
}
