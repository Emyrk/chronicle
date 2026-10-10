/**
 * Groups procs and cooldowns on the rail that are close in time or would
 * overlap on screen (design: Rotations 2a, stacked rail tooltips).
 */

import type { TimelineCast } from "./rotationTimeline.processor";

export type RailKind = "cd" | "proc";

export interface RailEvent {
  cast: TimelineCast;
  kind: RailKind;
}

export interface RailCluster {
  events: RailEvent[];
  startMs: number;
  endMs: number;
}

/** Icons drawn per cluster before the count badge takes over. */
export const MAX_STACKED_ICONS = 4;
/** Events this close to the previous one (and to the cluster start) group regardless of zoom. */
const JOIN_GAP_MS = 1000;
const MAX_CLUSTER_SPAN_MS = 2000;

/** On-screen width of a stack of n icons of the given size, including the count badge. */
export function stackWidthPx(n: number, iconPx: number): number {
  const step = Math.round(iconPx * 0.5);
  return iconPx + step * (Math.min(n, MAX_STACKED_ICONS) - 1) + (n > 1 ? 20 : 0) + 4;
}

/** events must be sorted by startMs. */
export function clusterRailEvents(events: readonly RailEvent[], pxPerMs: number, iconPx: number): RailCluster[] {
  const clusters: RailCluster[] = [];
  for (const event of events) {
    const t = event.cast.startMs;
    const last = clusters[clusters.length - 1];
    if (last) {
      const closeInTime = t - last.endMs <= JOIN_GAP_MS && t - last.startMs <= MAX_CLUSTER_SPAN_MS;
      const wouldOverlap = (t - last.startMs) * pxPerMs < stackWidthPx(last.events.length + 1, iconPx);
      if (closeInTime || wouldOverlap) {
        last.events.push(event);
        last.endMs = t;
        continue;
      }
    }
    clusters.push({ events: [event], startMs: t, endMs: t });
  }
  return clusters;
}
