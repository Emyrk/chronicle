/** Parse SpellDescriptionVariables text into a variable name to expression map. */
export function parseDescriptionVariables(
  raw: string | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("$")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 2) continue;
    map.set(trimmed.substring(1, eqIdx), trimmed.substring(eqIdx + 1));
  }

  return map;
}
