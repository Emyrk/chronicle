import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { WoWSpell } from "@/api/wowdb";
import { getSpellIconUrl } from "@/api/wowdb";
import { iconUrl } from "@/config/iconUrl";
import { useDatasetId, useIconBaseUrl } from "@/hooks/useDatasetId";
import { AUTO_ATTACK_SPELL_ID } from "./rotationTimeline.processor";
import { DEFAULT_GCD_MS, type GcdLookup } from "./derive";

export interface SpellMeta {
  spell: WoWSpell | null;
  icon: string;
  /** Lowercase school name for --color-school-* tokens, e.g. "fire". */
  school: string;
}

const FALLBACK_ICON = "inv_misc_questionmark";

/**
 * Spell metadata for a set of spell IDs. Uses the same query key as useSpell,
 * so the cache is shared with tooltips elsewhere on the page.
 */
export function useSpellMeta(spellIds: readonly number[]) {
  const datasetId = useDatasetId();
  const iconBaseUrl = useIconBaseUrl();
  const ids = useMemo(() => Array.from(new Set(spellIds)).filter((id) => id > 0).sort((a, b) => a - b), [spellIds]);

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["wowdb", "spell", String(id), datasetId ?? "default"],
      queryFn: async (): Promise<WoWSpell> => {
        const ds = datasetId ? `?dataset_id=${datasetId}` : "";
        const response = await fetch(`/api/v1/wowdb/spell/${id}${ds}`);
        if (!response.ok) throw new Error("Spell not found");
        return response.json() as Promise<WoWSpell>;
      },
      staleTime: 24 * 60 * 60 * 1000,
      retry: false,
    })),
  });

  const dataKey = results.map((r) => (r.data ? 1 : 0)).join("");
  return useMemo(() => {
    const byId = new Map<number, SpellMeta>();
    ids.forEach((id, i) => {
      const spell = results[i]?.data ?? null;
      const icon = spell ? getSpellIconUrl(spell.spell_icon, iconBaseUrl) : "";
      byId.set(id, {
        spell,
        icon: icon || iconUrl(id === AUTO_ATTACK_SPELL_ID ? "inv_sword_04" : FALLBACK_ICON, iconBaseUrl),
        school: spell?.school?.string?.toLowerCase() || "physical",
      });
    });

    const meta = (id: number | null): SpellMeta =>
      (id != null ? byId.get(id) : undefined) ?? {
        spell: null,
        icon: iconUrl(id === AUTO_ATTACK_SPELL_ID ? "inv_sword_04" : FALLBACK_ICON, iconBaseUrl),
        school: "physical",
      };

    const gcd: GcdLookup = (id) => {
      const spell = byId.get(id)?.spell;
      if (!spell) return DEFAULT_GCD_MS;
      return Math.round((spell.start_recovery_time ?? 0) / 1e6);
    };

    return { meta, gcd, loading: results.some((r) => r.isLoading) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, dataKey, iconBaseUrl]);
}
