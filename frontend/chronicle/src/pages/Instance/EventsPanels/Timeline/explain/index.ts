/**
 * Line Chart (Timeline) explainer — summary/tips plus the full lesson set.
 * (Example mode is hidden from user flows; renderExample is a placeholder.)
 */

import { createElement } from "react";
import type { PanelExplainer } from "../../../PanelExplainer/types";
import type { TimelineResult } from "../timeline.processor";
import { deriveCapabilities, type TimelineCapabilities } from "./capabilities";
import { TIMELINE_LESSONS } from "./lessons";

export const timelineExplainer: PanelExplainer<TimelineResult, TimelineCapabilities> = {
  summary:
    "Charts configurable series over the fight's timeline — damage by default, but any event " +
    "stream with its own aggregation, color, and filters. Drag on the chart to zoom every panel " +
    "into a time window.",

  tips: [
    "Drag across the chart to select a time window — all panels follow it",
    "Double-click (or 'Reset Selection') to restore the whole fight",
    "Click legend entries to hide or show series",
    "Flip the card (⋮ menu) to add series or change aggregations",
    "Per-series filters can chart a single ability's damage over time",
    "Set Background to Raid Durability to see raid health behind the lines",
  ],

  lessonSet: {
    deriveCapabilities,
    lessons: TIMELINE_LESSONS,
    renderExample: () =>
      createElement(
        "div",
        {
          className:
            "grid h-full place-items-center rounded-lg border border-border bg-card text-xs text-muted-foreground",
        },
        "Example data for the Line Chart is not available yet.",
      ),
  },
};
