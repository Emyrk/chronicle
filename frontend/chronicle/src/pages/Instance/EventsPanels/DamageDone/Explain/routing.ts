/**
 * Routing predicate for Damage Done explain view.
 * Separated from the component file for react-refresh compatibility.
 */

/** Panel types that use the DamageDone explain view. */
const DAMAGE_DONE_EXPLAIN_TYPES = new Set(["damage_done", "enemy_damage_done"]);

/** Check if a panel type should use the DamageDone explain view. */
export function isDamageDoneExplainType(panelType: string): boolean {
  return DAMAGE_DONE_EXPLAIN_TYPES.has(panelType);
}
