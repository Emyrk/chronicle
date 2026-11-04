import type { DamageAbilityBreakout } from "@/pages/Instance/EventsPanels/processors/abilityBreakout";
import type { HeroMeterBreakout } from "./heroMeter";

// Its own module, not heroMeter.ts: only the live replay's chunk reads it, and heroMeter.ts paints with /start.

/**
 * A player's breakout from the run page's per-ability sums (Damage Done's `ByAbility`, Healing Done's
 * `HealerByAbility`) over `elapsedMs`: the top `limit` abilities, crit % from `hitAbilities` (every landed event
 * once: Healing Done's `HealerByAbilityTotal`; damage's own sums otherwise), the targets hit, and overheal %
 * when `overheal` is given. Null without any amount.
 */
export function playerBreakout({ abilities, hitAbilities, raidTotal, elapsedMs, targets, overheal, limit }: {
  abilities: Map<string, DamageAbilityBreakout> | undefined;
  hitAbilities?: Map<string, DamageAbilityBreakout>;
  raidTotal: number;
  elapsedMs: number;
  targets: number;
  overheal?: number;
  limit: number;
}): HeroMeterBreakout | null {
  if (!abilities) return null;
  const seconds = Math.max(1, elapsedMs / 1000);
  const entries = [...abilities].filter(([, ability]) => ability.Total > 0);
  const total = entries.reduce((sum, [, ability]) => sum + ability.Total, 0);
  if (total <= 0) return null;
  // Crits over every event, as the run page's ability breakout reads them.
  let count = 0;
  let crits = 0;
  for (const ability of (hitAbilities ?? abilities).values()) {
    count += ability.Count;
    crits += ability.Crits;
  }
  const facts: { label: string; value: string }[] = [];
  if (count > 0) facts.push({ label: "crit", value: `${Math.round((crits / count) * 100)}%` });
  if (overheal !== undefined && total + overheal > 0) facts.push({ label: "overheal", value: `${Math.round((overheal / (total + overheal)) * 100)}%` });
  if (targets > 0) facts.push({ label: targets === 1 ? "target" : "targets", value: String(targets) });
  return {
    total,
    perSecond: total / seconds,
    raidShare: raidTotal > 0 ? total / raidTotal : 0,
    abilities: entries
      .sort(([, left], [, right]) => right.Total - left.Total)
      .slice(0, limit)
      .map(([name, ability]) => ({ name, perSecond: ability.Total / seconds, share: ability.Total / total })),
    facts,
  };
}
