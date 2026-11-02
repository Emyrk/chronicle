import { useEffect, useState } from "react"
import { fetchMiniatureUrls } from "@/pages/Instance/EventsPanels/Map/bossMinis"
import { miniatureThumbnail } from "@/pages/Technical/miniatureThumbnail"

/**
 * Creature entry for each boss, matched against the replay map's published
 * miniature manifest. A boss with no published model falls back to its
 * portrait or initials.
 */
const BOSS_ENTRIES: Record<string, number> = {
  // Molten Core (no models published yet).
  Lucifron: 12118,
  Magmadar: 11982,
  Gehennas: 12259,
  Garr: 12057,
  Shazzrah: 12264,
  "Baron Geddon": 12056,
  "Golemagg the Incinerator": 11988,
  "Sulfuron Harbinger": 12098,
  "Majordomo Executus": 12018,
  Ragnaros: 11502,
  // Zul'Gurub.
  "High Priest Venoxis": 14507,
  "High Priestess Jeklik": 14517,
  "High Priestess Mar'li": 14510,
  "Bloodlord Mandokir": 11382,
  "Gahz'ranka": 15114,
  "High Priest Thekal": 14509,
  "High Priestess Arlokk": 14515,
  "Jin'do the Hexxer": 11380,
  // Edge of Madness rotates between these four.
  "Gri'lek": 15082,
  "Hazza'rah": 15083,
  Renataki: 15084,
  Wushoolay: 15085,
  Hakkar: 14834,
  // Onyxia's Lair.
  Onyxia: 10184,
}

let published: Promise<ReadonlyMap<number, string>> | undefined

/**
 * A still render of the boss's model, or undefined while it loads or when no
 * model exists. Every card shares one offscreen WebGL renderer, and results
 * are cached per model, so a grid of bosses costs one context.
 */
export function useBossModelImage(boss: string): string | undefined {
  const [image, setImage] = useState<string>()
  useEffect(() => {
    const entry = BOSS_ENTRIES[boss]
    if (entry === undefined) return
    let live = true
    published ??= fetchMiniatureUrls()
    published
      .then((urls) => {
        const url = urls.get(entry)
        return url ? miniatureThumbnail(url) : undefined
      })
      .then((src) => live && setImage(src))
      .catch(() => live && setImage(undefined))
    return () => {
      live = false
    }
  }, [boss])
  return image
}
