/**
 * All Activity explainer \u2014 summary/tips plus the full lesson set.
 */

import { createElement } from "react";
import type { PanelExplainer } from "../../../PanelExplainer/types";
import type { AllActivityState } from "../../processors";
import { deriveCapabilities, type AllActivityCapabilities } from "./capabilities";
import { ALL_ACTIVITY_LESSONS } from "./lessons";

export const allActivityExplainer: PanelExplainer<AllActivityState, AllActivityCapabilities> = {
  summary:
    "The raw combat log, event by event \u2014 every damage tick, heal, aura, cast, and death " +
    "in order. Stream chips choose which event types you see, quick filters narrow by " +
    "source, ability, or target, and the Time column can show UTC, your local clock, or " +
    "fight-relative offsets.",

  tips: [
    "Click a stream chip to show or hide that event type",
    "Hover a chip for a description and its event count",
    "Quick filters narrow by source, ability, or target as you type",
    "Click the Time header to switch between UTC and your local clock",
    "Flip 'Encounter offset' for fight-relative +m:ss.s timestamps",
    "Click any row to expand its full details",
  ],

  lessonSet: {
    deriveCapabilities,
    lessons: ALL_ACTIVITY_LESSONS,
    renderExample: () =>
      createElement(
        "div",
        {
          className:
            "grid h-full place-items-center rounded-lg border border-border bg-card text-xs text-muted-foreground",
        },
        "Example data for All Activity is not available yet.",
      ),
  },
};
