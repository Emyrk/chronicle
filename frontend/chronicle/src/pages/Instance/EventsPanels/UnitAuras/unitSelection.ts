const AURA_SEARCH_PREFIX = "q:";
const SELECTED_UNIT_PREFIX = "u:";

function panelOptionParts(panelOption: string | null | undefined): string[] {
  return panelOption?.split(",").filter(Boolean) ?? [];
}

export function parseSelectedUnits(panelOption: string | null | undefined): string[] {
  return panelOptionParts(panelOption)
    .filter((part) => part.startsWith(SELECTED_UNIT_PREFIX))
    .map((part) => part.slice(SELECTED_UNIT_PREFIX.length))
    .filter(Boolean);
}

export function parseAuraSearchQuery(panelOption: string | null | undefined): string {
  const encoded = panelOptionParts(panelOption)
    .find((part) => part.startsWith(AURA_SEARCH_PREFIX))
    ?.slice(AURA_SEARCH_PREFIX.length);
  if (!encoded) return "";

  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

export function serializeUnitAuraOptions(
  guids: readonly string[],
  auraSearchQuery: string,
): string | null {
  const parts = guids.map((guid) => `${SELECTED_UNIT_PREFIX}${guid}`);
  if (auraSearchQuery) {
    parts.push(`${AURA_SEARCH_PREFIX}${encodeURIComponent(auraSearchQuery)}`);
  }
  return parts.length > 0 ? parts.join(",") : null;
}

export function serializeSelectedUnits(guids: readonly string[]): string | null {
  return serializeUnitAuraOptions(guids, "");
}
