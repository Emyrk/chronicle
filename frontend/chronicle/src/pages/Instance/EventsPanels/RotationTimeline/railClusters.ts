/**
 * Groups procs and cooldowns on the rail whose icons would overlap on screen
 * (design: Rotations 2a, stacked rail tooltips). Zoomed in, events spread out
 * to their own times; zoomed out, crowded ones stack.
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

/** Icons drawn per cluster; the rest are listed in the hover tooltip. */
export const MAX_STACKED_ICONS = 4;

/** On-screen width of a stack of n icons of the given size. */
export function stackWidthPx(n: number, iconPx: number): number {
  const step = Math.round(iconPx * 0.5);
  return iconPx + step * (Math.min(n, MAX_STACKED_ICONS) - 1) + 4;
}

/** events must be sorted by startMs. */
export function clusterRailEvents(events: readonly RailEvent[], pxPerMs: number, iconPx: number): RailCluster[] {
  const clusters: RailCluster[] = [];
  for (const event of events) {
    const t = event.cast.startMs;
    const last = clusters[clusters.length - 1];
    if (last) {
      const wouldOverlap = (t - last.startMs) * pxPerMs < stackWidthPx(last.events.length + 1, iconPx);
      if (wouldOverlap) {
        last.events.push(event);
        last.endMs = t;
        continue;
      }
    }
    clusters.push({ events: [event], startMs: t, endMs: t });
  }
  return clusters;
}
