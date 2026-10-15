const SERVER_NAME = import.meta.env.VITE_SERVER_NAME ?? "turtle";
const ICON_CDN = "https://icons.chronicleclassic.com";

/** Default base URL for icon assets (compiled-in server identity) */
export const ICON_BASE_URL = `${ICON_CDN}/${SERVER_NAME}`;

/**
 * Full URL for a named icon. When baseUrl is provided (from DatasetProvider),
 * it overrides the default. Falls back to the compiled-in server identity.
 */
export function iconUrl(name: string, baseUrl?: string): string {
  if (!name) return "";
  const base = baseUrl || ICON_BASE_URL;
  return `${base}/${name.toLowerCase()}.webp`;
}

/** Full URL for a talent tree background texture. */
export function talentBackgroundUrl(name: string, baseUrl?: string): string {
  if (!name) return "";
  const base = baseUrl || ICON_BASE_URL;
  return `${base}/talent-backgrounds/${name.toLowerCase()}.webp`;
}

/** URL for the icon list manifest. */
export function iconListUrl(baseUrl?: string): string {
  const base = baseUrl || ICON_BASE_URL;
  return `${base}/icon-list.json`;
}

export const ICON_LIST_URL = iconListUrl();
