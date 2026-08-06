/**
 * Registry of panel explainers.
 * 
 * Only panels with explainers defined here will show the ? help button.
 * Import explainers from their co-located files in each panel directory.
 */

import type { PanelExplainer } from "../../PanelExplainer/types";
import type { EventsPanelType } from "../EventsPanel";

// Import explainers from panel directories
// These will be added as panels get their explainers
import { damageDoneExplainer } from "../DamageDone/explain";
import { healingDoneExplainer } from "../HealingDone/explain";
import { timelineExplainer } from "../Timeline/explain";
import { deathLogExplainer } from "../Deaths/explain";
import { allActivityExplainer } from "../AllActivity/explain";
import { sunderExplainer } from "../Sunder/Sunder.explainer";
import { damageTakenExplainer } from "../DamageTaken/DamageTaken.explainer";
import { rolesExplainer } from "../Roles/Roles.explainer";
import { pullsAndCleanupExplainer } from "../PullsAndCleanup/PullsAndCleanup.explainer";
import { equipmentExplainer } from "../Equipment/explain";
import { leaderboardExplainer } from "../LeaderboardPanel/explain";

/**
 * Map of panel types to their explainer configurations.
 * 
 * Partial because not all panels have explainers yet.
 * The ? button only appears for panels in this registry.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PANEL_EXPLAINERS: Partial<Record<EventsPanelType, PanelExplainer<any, any>>> = {
  damage_done: damageDoneExplainer,
  enemy_damage_done: damageDoneExplainer, // Same explainer, different context
  healing_done: healingDoneExplainer,
  timeline: timelineExplainer,
  death_log: deathLogExplainer,
  all_activity: allActivityExplainer,
  sunder: sunderExplainer,
  damage_taken: damageTakenExplainer,
  enemy_damage_taken: damageTakenExplainer, // Same explainer, different context
  roles: rolesExplainer,
  pulls_and_cleanup: pullsAndCleanupExplainer,
  equipment: equipmentExplainer,
  leaderboard: leaderboardExplainer,
};

/**
 * Check if a panel has an explainer available.
 */
export function hasExplainer(panelType: EventsPanelType): boolean {
  return panelType in PANEL_EXPLAINERS;
}

/**
 * Get the explainer for a panel type, if available.
 */
export function getExplainer(panelType: EventsPanelType): PanelExplainer | undefined {
  return PANEL_EXPLAINERS[panelType];
}
