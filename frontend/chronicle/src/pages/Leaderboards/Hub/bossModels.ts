import { useEffect, useState } from "react"
import { fetchGameModelUrls } from "@/pages/Instance/EventsPanels/Map/bossMinis"
import { miniatureThumbnail } from "@/pages/Technical/miniatureThumbnail"

/**
 * Creature entry for each boss, matched against the original game models in
 * the replay map's published model manifest (its game_models, not the tabletop
 * miniatures). A boss with no published model falls back to its portrait or
 * initials.
 */
export const BOSS_ENTRIES: Record<string, number> = {
  // Molten Core.
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
  // Blackwing Lair.
  "Razorgore the Untamed": 12435,
  "Vaelastrasz the Corrupt": 13020,
  "Vaelastrasz the Chained": 13020,
  "Broodlord Lashlayer": 12017,
  Firemaw: 11983,
  Ebonroc: 14601,
  Flamegor: 11981,
  Chromaggus: 14020,
  Nefarian: 11583,
}

let published: Promise<ReadonlyMap<number, string>> | undefined

/** A still render of the boss's original game model, or undefined when none is published. */
export async function bossModelImage(boss: string): Promise<string | undefined> {
  const entry = BOSS_ENTRIES[boss]
  if (entry === undefined) return undefined
  published ??= fetchGameModelUrls()
  const url = (await published).get(entry)
  return url ? miniatureThumbnail(url) : undefined
}

/**
 * A still render of the boss's model, or undefined while it loads or when no
 * model exists. Every card shares one offscreen WebGL renderer, and results
 * are cached per model, so a grid of bosses costs one context.
 */
export function useBossModelImage(boss: string): string | undefined {
  const [image, setImage] = useState<string>()
  useEffect(() => {
    let live = true
    bossModelImage(boss)
      .then((src) => live && setImage(src))
      .catch(() => live && setImage(undefined))
    return () => {
      live = false
    }
  }, [boss])
  return image
}
