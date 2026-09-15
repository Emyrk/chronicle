export const EMERALD_SANCTUM_INSTANCE = "Emerald Sanctum"

export type EmeraldSanctumMode = "normal" | "hard"

const EMERALD_SANCTUM_ENCOUNTERS: Record<EmeraldSanctumMode, readonly string[]> = {
  normal: ["Erennius", "Solnius"],
  hard: ["Solnius (Hard Mode)"],
}

export function parseEmeraldSanctumMode(value: string | null): EmeraldSanctumMode {
  return value === "hard" ? "hard" : "normal"
}

export function emeraldSanctumModeParamForValue(mode: EmeraldSanctumMode): string | null {
  return mode === "hard" ? "hard" : null
}

export function getEmeraldSanctumEncounterNames(
  mode: EmeraldSanctumMode,
  availableNames: Iterable<string>,
): Set<string> {
  const available = new Set(availableNames)
  return new Set(EMERALD_SANCTUM_ENCOUNTERS[mode].filter((name) => available.has(name)))
}
