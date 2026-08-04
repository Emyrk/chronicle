/**
 * Explainer content for the Roles panel.
 */

import type { PanelExplainer } from "../../PanelExplainer/types";

export const rolesExplainer: PanelExplainer = {
  summary:
    "Automatically detects player roles (Tank, Healer, DPS) based on combat behavior - not their class. " +
    "Only the selected encounter is considered when determining roles, so some players may switch roles between fights." ,

  tips: [
    "Click a role header (Tanks/Healers/DPS) to select all players in that role",
    "Click a class name in the DPS section to select all of that class",
    "Click individual player names to toggle their selection",
    "Selected players filter all other panels - great for comparing healers",
    "Hybrid classes may show different roles on different fights",
  ],
};
