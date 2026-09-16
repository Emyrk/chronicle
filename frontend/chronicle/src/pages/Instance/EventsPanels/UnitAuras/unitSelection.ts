export function parseSelectedUnits(panelOption: string | null | undefined): string[] {
  if (!panelOption) return [];
  return panelOption
    .split(",")
    .filter((part) => part.startsWith("u:"))
    .map((part) => part.slice(2))
    .filter(Boolean);
}

export function serializeSelectedUnits(guids: readonly string[]): string | null {
  return guids.length > 0 ? guids.map((guid) => `u:${guid}`).join(",") : null;
}
