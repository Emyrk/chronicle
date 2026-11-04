// Shared instance configuration - maps instance names to loading screen images.
// The JSON file is also embedded by Go for Open Graph instance images.

import instanceConfigJSON from "../../../../../instance-config.json";

export type InstanceContentLevel = 60 | 70 | 80;

export interface InstanceConfig {
  background: string;
  bossCount?: number;
  abbrev?: string; // Short name for mobile display
  accentColor?: string;
  contentLevel: InstanceContentLevel | readonly InstanceContentLevel[];
}

export const INSTANCE_CONFIG = instanceConfigJSON as Record<string, InstanceConfig>;

export const DEFAULT_BACKGROUND = "/c/images/loadingscreens/LoadScreenDungeon.webp";
export const DEFAULT_INSTANCE_ACCENT = "#64748b";

// Pre-computed lowercase → canonical name map for case-insensitive lookup
const INSTANCE_NAME_LOOKUP = new Map<string, string>(
  Object.keys(INSTANCE_CONFIG).map((name) => [name.toLowerCase(), name]),
);

/** Resolve an instance name case-insensitively, returning the canonical config key or undefined. */
export function resolveInstanceName(name: string): string | undefined {
  // Fast path: exact match
  if (name in INSTANCE_CONFIG) return name;
  return INSTANCE_NAME_LOOKUP.get(name.toLowerCase());
}

export function getInstanceConfig(name: string): InstanceConfig | undefined {
  const canonical = resolveInstanceName(name);
  return canonical ? INSTANCE_CONFIG[canonical] : undefined;
}

/** Returns the content-level bracket for an instance, using raid size to distinguish reused raid names. */
export function getInstanceContentLevel(
  name: string,
  maxPlayers?: number,
): InstanceContentLevel | undefined {
  const contentLevel = getInstanceConfig(name)?.contentLevel;
  if (contentLevel == null || typeof contentLevel === "number") return contentLevel;

  // Naxxramas and Onyxia's Lair exist as level 60 40-player raids and
  // level 80 10/25-player raids under the same instance name.
  if (maxPlayers == null || maxPlayers <= 0) return undefined;
  return maxPlayers >= 40 ? 60 : 80;
}

export function getInstanceBackground(name: string): string {
  const canonical = resolveInstanceName(name);
  return canonical ? INSTANCE_CONFIG[canonical].background : DEFAULT_BACKGROUND;
}

const LOADING_SCREEN_PREFIX = "/c/images/loadingscreens/";

/**
 * A small crop of the instance's loading screen: the server's 512x341 JPG
 * (the OG image) instead of the full-size webp.
 */
export function getInstanceArtCrop(name: string): string {
  const background = getInstanceBackground(name);
  if (!background.startsWith(LOADING_SCREEN_PREFIX) || !background.endsWith(".webp")) return background;
  return `/c/images/og/loadingscreens/${background.slice(LOADING_SCREEN_PREFIX.length, -".webp".length)}.jpg`;
}

export function getInstanceAccentColor(name: string): string {
  return getInstanceConfig(name)?.accentColor ?? DEFAULT_INSTANCE_ACCENT;
}

export function getInstanceAbbrev(name: string): string {
  const canonical = resolveInstanceName(name);
  return canonical ? (INSTANCE_CONFIG[canonical].abbrev ?? canonical) : name;
}
