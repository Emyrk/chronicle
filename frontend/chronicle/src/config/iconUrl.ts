const SERVER_NAME = import.meta.env.VITE_SERVER_NAME ?? "turtle";
const ICON_CDN = "https://icons.chronicleclassic.com";

/** Base URL for icon assets (includes server prefix, e.g. ".../turtle") */
export const ICON_BASE_URL = `${ICON_CDN}/${SERVER_NAME}`;

/** Full URL for a named icon (e.g. "spell_fire_fire" → ".../turtle/spell_fire_fire.webp") */
export function iconUrl(name: string): string {
  if (!name) return "";
  return `${ICON_BASE_URL}/${name.toLowerCase()}.webp`;
}

/** Full URL for a talent tree background texture (e.g. "WarriorArms" → ".../turtle/talent-backgrounds/warriorarms.webp") */
export function talentBackgroundUrl(name: string): string {
  if (!name) return "";
  return `${ICON_CDN}/${SERVER_NAME}/talent-backgrounds/${name.toLowerCase()}.webp`;
}

/** URL for the icon list manifest */
export const ICON_LIST_URL = `${ICON_BASE_URL}/icon-list.json`;
