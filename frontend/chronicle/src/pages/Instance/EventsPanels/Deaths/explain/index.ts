/**
 * Death Log explainer \u2014 summary/tips plus the full lesson set.
 */

import { createElement } from "react";
import type { PanelExplainer } from "../../../PanelExplainer/types";
import type { DeathsResult } from "../deaths.processor";
import { deriveCapabilities, type DeathLogCapabilities } from "./capabilities";
import { DEATH_LOG_LESSONS } from "./lessons";

export const deathLogExplainer: PanelExplainer<DeathsResult, DeathLogCapabilities> = {
  summary:
    "A chronological list of every death in the selection \u2014 who died, when, and to what. " +
    "Each death expands into a recap of its final ten seconds, and floating recap windows " +
    "let you scrub through a death with a relative health bar.",

  tips: [
    "Flip 'Encounter offset' for fight-relative timestamps",
    "Hover 'Killed By' for the killing blow's ability, amount, and crits",
    "Click an encounter name to select that pull everywhere",
    "The \u2197 button opens a draggable recap \u2014 open several to compare deaths",
    "Hovering a recap's event list scrubs the shared fight cursor",
  ],

  lessonSet: {
    deriveCapabilities,
    lessons: DEATH_LOG_LESSONS,
    renderExample: () =>
      createElement(
        "div",
        {
          className:
            "grid h-full place-items-center rounded-lg border border-border bg-card text-xs text-muted-foreground",
        },
        "Example data for the Death Log is not available yet.",
      ),
  },
};
