/**
 * Boss face icons, keyed by encounter name. Empty until the portrait set lands;
 * BossPortrait falls back to the boss's initials in a laurel.
 */
const BOSS_PORTRAITS: Record<string, string> = {
  // "Ragnaros": "/c/images/bosses/ragnaros.webp",
}

export function getBossPortrait(boss: string): string | undefined {
  return BOSS_PORTRAITS[boss]
}
