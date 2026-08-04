/**
 * Healing Done explainer — summary/tips plus the full lesson set.
 * (Example mode is hidden from user flows; renderExample is a placeholder
 * until a healing fixture panel is built.)
 */

import { createElement } from "react";
import type { PanelExplainer } from "../../../PanelExplainer/types";
import type { UnifiedHealingResult } from "../../processors/healing.processor";
import { deriveCapabilities, type HealingDoneCapabilities } from "./capabilities";
import { HEALING_DONE_LESSONS } from "./lessons";

export const healingDoneExplainer: PanelExplainer<UnifiedHealingResult, HealingDoneCapabilities> = {
  summary:
    "Shows healing done by each healer. Effective healing restores HP, while overhealing is the 'overflow' when a heal exceeds the target's missing health. " +
    "High overhealing can indicate inefficient healing or just keeping the raid topped off.",

  tips: [
    "Toggle 'Per Second' to see HPS instead of total healing",
    "Click any row to see breakdown by spell and heal target",
    "Overhealing percentage helps identify wasted healing",
    "Select specific players in the Entity panel to compare healers",
    "You can open more than 1 breakout panel!",
    "Click 'Healed' in the breakout table to see heals by target instead of by spell",
  ],

  lessonSet: {
    deriveCapabilities,
    lessons: HEALING_DONE_LESSONS,
    renderExample: () =>
      createElement(
        "div",
        {
          className:
            "grid h-full place-items-center rounded-lg border border-border bg-card text-xs text-muted-foreground",
        },
        "Example data for Healing Done is not available yet.",
      ),
  },
};
