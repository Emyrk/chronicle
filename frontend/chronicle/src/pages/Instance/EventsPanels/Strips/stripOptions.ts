export type StripTitleMode = "overlay" | "large" | "none";

export type RaidDurabilityMode = "estimate" | "actual";

export const RAID_DURABILITY_MODE_PREFIX = "durability-mode:";
export const STRIP_TITLE_MODE_PREFIX = "title-mode:";
const LEGACY_SHOW_STRIP_TITLE_TOKEN = "show-title";

export function parseStripOptionTokens(option: string | null | undefined): string[] {
  return option?.split(",").map((token) => token.trim()).filter(Boolean) ?? [];
}

export function stripOptionValue(
  option: string | null | undefined,
  prefix: string,
): string | null {
  const token = parseStripOptionTokens(option).find((candidate) => candidate.startsWith(prefix));
  return token ? token.slice(prefix.length) : null;
}

export function raidDurabilityMode(
  option: string | null | undefined,
  actualSupported: boolean,
): RaidDurabilityMode {
  const value = stripOptionValue(option, RAID_DURABILITY_MODE_PREFIX);
  if (value === "estimate") return "estimate";
  if (value === "actual" && actualSupported) return "actual";
  return actualSupported ? "actual" : "estimate";
}

export function updateRaidDurabilityMode(
  option: string | null | undefined,
  mode: RaidDurabilityMode,
): string | null {
  const tokens = parseStripOptionTokens(option).filter((token) =>
    !token.startsWith(RAID_DURABILITY_MODE_PREFIX),
  );
  tokens.push(`${RAID_DURABILITY_MODE_PREFIX}${mode}`);
  return tokens.join(",");
}

/** The Replay strip's look: durability or damage bars to scrub on, or the plain slider. */
export type ReplayStripVariant = "durability" | "damage" | "slider";

export const REPLAY_STRIP_VARIANTS: { value: ReplayStripVariant; label: string; description: string }[] = [
  { value: "durability", label: "Durability", description: "Bars of the raid's lowest durability; drag them to scrub" },
  { value: "damage", label: "Damage", description: "Bars of party damage; drag them to scrub" },
  { value: "slider", label: "Slider", description: "A plain slider with death markers" },
];

export const REPLAY_STRIP_VARIANT_PREFIX = "variant:";

export function replayStripVariant(option: string | null | undefined): ReplayStripVariant {
  const value = stripOptionValue(option, REPLAY_STRIP_VARIANT_PREFIX);
  return REPLAY_STRIP_VARIANTS.find((variant) => variant.value === value)?.value ?? "durability";
}

export function updateReplayStripVariant(
  option: string | null | undefined,
  variant: ReplayStripVariant,
): string | null {
  const tokens = parseStripOptionTokens(option).filter((token) => !token.startsWith(REPLAY_STRIP_VARIANT_PREFIX));
  if (variant !== "durability") tokens.push(`${REPLAY_STRIP_VARIANT_PREFIX}${variant}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}

export function stripTitleMode(option: string | null | undefined): StripTitleMode {
  const value = stripOptionValue(option, STRIP_TITLE_MODE_PREFIX);
  if (value === "overlay" || value === "large" || value === "none") return value;
  // Preserve layouts saved by the original boolean title option.
  if (parseStripOptionTokens(option).includes(LEGACY_SHOW_STRIP_TITLE_TOKEN)) return "overlay";
  return "none";
}

export function updateStripTitleMode(
  option: string | null | undefined,
  mode: StripTitleMode,
): string | null {
  const tokens = parseStripOptionTokens(option).filter((token) =>
    token !== LEGACY_SHOW_STRIP_TITLE_TOKEN && !token.startsWith(STRIP_TITLE_MODE_PREFIX),
  );
  if (mode !== "none") tokens.push(`${STRIP_TITLE_MODE_PREFIX}${mode}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}
