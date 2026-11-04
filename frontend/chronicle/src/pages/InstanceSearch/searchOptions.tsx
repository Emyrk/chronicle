import type { SupportedInstance, WoWServerRealm } from "@/api/typesGenerated";
import { getInstanceBackground, getInstanceConfig } from "@/pages/Logs/utils/instanceImages";
import {
  compareByRaidProgression,
  getRaidLevel,
} from "@/pages/Logs/utils/instanceProgressionOrder";
import type { ComboOption } from "./comboOptions";

/*
 * Combobox options for search fields. To give another field a picker, build
 * its options here and map the field to them in BlockEditor's optionsFor and
 * the form.
 */

const NIGHTMARE_OF_URSOL = "nightmare-of-ursol";
const TOWER_OF_KARAZHAN = "Tower of Karazhan";
const NIGHTMARE_TOWER_NAMES = ["Upper Tower of Karazhan", "Lower Tower of Karazhan"] as const;

const CATEGORY_LABELS: Record<string, string> = { raid: "Raids", dungeon: "Dungeons" };

function zoneGroup(instance: SupportedInstance): string {
  if (instance.category !== "raid") return CATEGORY_LABELS[instance.category] ?? "Other";
  const level = getRaidLevel(instance.name, [instance]);
  return level ? `Level ${level} raids` : "Raids";
}

/** Highest-level raids first in progression order, then dungeons and other zones alphabetically. */
function byProgression(a: SupportedInstance, b: SupportedInstance): number {
  const cat = (i: SupportedInstance) => (i.category === "raid" ? 0 : i.category === "dungeon" ? 1 : 2);
  const categoryDifference = cat(a) - cat(b);
  if (categoryDifference !== 0) return categoryDifference;
  if (a.category === "raid" && b.category === "raid") {
    return compareByRaidProgression(a.name, b.name, [a, b]);
  }
  return a.name.localeCompare(b.name);
}

/** Supported instances with their art and boss count, grouped by raid level or category. */
export function zoneOptions(instances: readonly SupportedInstance[], flavor: readonly string[] = []): ComboOption[] {
  const nightmareOfUrsol = flavor.includes(NIGHTMARE_OF_URSOL);

  return [...instances].sort(byProgression).flatMap((instance) => {
    const names = nightmareOfUrsol && instance.name === TOWER_OF_KARAZHAN
      ? NIGHTMARE_TOWER_NAMES
      : [instance.name];

    return names.map((name) => {
      const optionInstance = name === instance.name ? instance : { ...instance, name };
      const bossCount = name === instance.name ? instance.boss_count : getInstanceConfig(name)?.bossCount;
      return {
        value: name,
        group: zoneGroup(optionInstance),
        hint: bossCount ? `${bossCount} ${bossCount === 1 ? "boss" : "bosses"}` : undefined,
        icon: (
          <span
            className="h-4 w-6 shrink-0 rounded-sm bg-cover bg-center ring-1 ring-white/10"
            style={{ backgroundImage: `url(${getInstanceBackground(name)})` }}
            aria-hidden="true"
          />
        ),
      };
    });
  });
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
