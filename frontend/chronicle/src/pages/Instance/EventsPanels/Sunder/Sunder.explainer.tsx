/**
 * Explainer content for the Sunder Armor panel.
 */

import type { PanelExplainer } from "../../PanelExplainer/types";

export const sunderExplainer: PanelExplainer = {
  summary:
    "Tracks Sunder Armor effectiveness by warriors. A sunder is 'effective' if it actually applies a stack to the target. " +
    "If the target dodges, parries, or is already at 5 stacks, the sunder is wasted. " +
    "Use this to evaluate warrior coordination and time-to-5-stacks on bosses.",

  tips: [
    "Toggle 'Show targets' to see time-to-5-stacks per target",
    "Click a target row to see the detailed cast/affliction timeline",
  ],
};
