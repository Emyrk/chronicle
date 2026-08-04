/**
 * Explainer content for the Healing Done panel.
 */

import type { PanelExplainer } from "../../PanelExplainer/types";

export const healingDoneExplainer: PanelExplainer = {
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
};
