/**
 * Damage Done explainer — summary/tips plus the full lesson set (capabilities,
 * lessons, example fixture). The lesson set is wired in as content lands.
 */

import type { PanelExplainer } from "../../../PanelExplainer/types";

export const damageDoneExplainer: PanelExplainer = {
  summary:
    "Shows total damage dealt by each player (or enemy) during the selected encounters. " +
    "Useful for comparing DPS performance and identifying top contributors.",

  tips: [
    "Toggle 'Per Second' to see DPS instead of total damage",
    "Click any row to see breakdown by ability and target",
    "Select specific enemies in the Entity panel to see damage only to those targets",
    "Multi-select encounters (Ctrl/Cmd+click) to see combined totals",
    "You can open more than 1 breakout panel!",
    "Click 'By Target' to see the damage breakdown by target instead of by ability",
  ],
};
