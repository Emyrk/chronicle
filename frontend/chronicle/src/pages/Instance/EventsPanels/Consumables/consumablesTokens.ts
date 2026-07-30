/**
 * panelOption tokens for the Consumables Log panel (persisted in saved and
 * shared layouts). Panel-owned tokens use the `pp:` prefix; other tokens
 * (cb, t:, bc:) are owned by EventsPanel and must be preserved.
 */

/** Parse panel-owned tokens from the persisted panelOption string. */
export function parseConsumablesTokens(option: string | null | undefined): { showPrePull: boolean } {
  const tokens = (option ?? "").split(",").map((t) => t.trim());
  return { showPrePull: !tokens.includes("pp:off") };
}

/** Rebuild the panelOption string, preserving tokens owned by EventsPanel. */
export function buildConsumablesTokens(
  existing: string | null | undefined,
  showPrePull: boolean,
): string | null {
  const preserved = (existing ?? "").split(",").map((t) => t.trim())
    .filter((t) => t && !t.startsWith("pp:"));
  if (!showPrePull) preserved.push("pp:off");
  return preserved.length > 0 ? preserved.join(",") : null;
}
