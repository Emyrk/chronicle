import type { SupportedInstance, WoWServerRealm } from "@/api/typesGenerated";
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages";
import type { ComboOption } from "./comboOptions";

/*
 * Combobox options for search fields. To give another field a picker, build
 * its options here and map the field to them in BlockEditor's optionsFor and
 * the form.
 */

const CATEGORY_LABELS: Record<string, string> = { raid: "Raids", dungeon: "Dungeons" };

/** Raids first in progression order, then dungeons, each alphabetical after that. */
function byProgression(a: SupportedInstance, b: SupportedInstance): number {
  const cat = (i: SupportedInstance) => (i.category === "raid" ? 0 : i.category === "dungeon" ? 1 : 2);
  return cat(a) - cat(b) || (a.raid_progression_order ?? 999) - (b.raid_progression_order ?? 999) || a.name.localeCompare(b.name);
}

/** Supported instances with their art and boss count, grouped Raids / Dungeons. */
export function zoneOptions(instances: readonly SupportedInstance[]): ComboOption[] {
  return [...instances].sort(byProgression).map((i) => ({
    value: i.name,
    group: CATEGORY_LABELS[i.category] ?? "Other",
    hint: i.boss_count ? `${i.boss_count} ${i.boss_count === 1 ? "boss" : "bosses"}` : undefined,
    icon: (
      <span
        className="h-4 w-6 shrink-0 rounded-sm bg-cover bg-center ring-1 ring-white/10"
        style={{ backgroundImage: `url(${getInstanceBackground(i.name)})` }}
        aria-hidden="true"
      />
    ),
  }));
}

/** Bosses grouped under their zone, in kill order. A boss listed in two zones appears once. */
export function bossOptions(instances: readonly SupportedInstance[]): ComboOption[] {
  const seen = new Set<string>();
  const out: ComboOption[] = [];
  for (const i of [...instances].sort(byProgression)) {
    for (const b of i.bosses ?? []) {
      if (seen.has(b.name)) continue;
      seen.add(b.name);
      out.push({ value: b.name, group: i.name });
    }
  }
  return out;
}

/** Realm names, alphabetical. */
export function realmOptions(realms: readonly WoWServerRealm[]): ComboOption[] {
  return [...new Set(realms.map((r) => r.name))].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name }));
}
