/**
 * Explainer content for the Pulls & Cleanup panel.
 */

import type { PanelExplainer } from "../../PanelExplainer/types";

export const pullsAndCleanupExplainer: PanelExplainer = {
  summary:
    "Between pulls lists each gap with the exact time until the next attempt. " +
    "The timeline shows boss, trash, and idle segments across the raid window. " +
    "The mini charts scale to the longest gap so you can compare at a glance.",

  tips: [
    "Shift + scroll over the timeline to zoom in, then drag to pan",
    "Hover over any segment in the timeline or gap bars to see details",
    "Select specific encounters to see only the gaps between them",
    "Each gap bar shows a breakdown of combat vs idle time",
  ],

  breakoutsOpen: 0,
};
