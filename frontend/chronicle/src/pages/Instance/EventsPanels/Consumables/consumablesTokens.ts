/**
 * panelOption tokens for the Consumables Log panel (persisted in saved and
 * shared layouts). `pc:` controls directly observed pre-combat uses and `pp:`
 * controls active-at-pull pre-pots. Other tokens are owned by EventsPanel.
 */

export interface ConsumablesTimingTokens {
  showPreCombat: boolean;
  showPrePot: boolean;
}

/** Parse panel-owned tokens from the persisted panelOption string. */
export function parseConsumablesTokens(option: string | null | undefined): ConsumablesTimingTokens {
  const tokens = (option ?? "").split(",").map((t) => t.trim());
  return {
    showPreCombat: !tokens.includes("pc:off"),
    showPrePot: !tokens.includes("pp:off"),
  };
}

/** Rebuild the panelOption string, preserving tokens owned by EventsPanel. */
export function buildConsumablesTokens(
  existing: string | null | undefined,
  timing: ConsumablesTimingTokens,
): string | null {
  const preserved = (existing ?? "").split(",").map((t) => t.trim())
    .filter((t) => t && !t.startsWith("pc:") && !t.startsWith("pp:"));
  if (!timing.showPreCombat) preserved.push("pc:off");
  if (!timing.showPrePot) preserved.push("pp:off");
  return preserved.length > 0 ? preserved.join(",") : null;
}
