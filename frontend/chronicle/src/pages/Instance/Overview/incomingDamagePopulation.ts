import type {
  SpeedrunCohortIncomingDamageAbility,
  SpeedrunCohortOverviewMetrics,
} from "@/api/typesGenerated";

export interface IncomingDamageComparisonRow {
  key: string;
  name: string;
  spellId?: number;
  environmentType?: string;
  primary?: SpeedrunCohortIncomingDamageAbility;
  comparison?: SpeedrunCohortIncomingDamageAbility;
  primaryDamagePerRun: number | null;
  comparisonDamagePerRun: number | null;
}

function abilityKey(ability: SpeedrunCohortIncomingDamageAbility): string {
  return `${ability.spell_id ?? "environment"}:${ability.environment_type ?? ""}:${ability.name}`;
}

function damagePerRun(
  ability: SpeedrunCohortIncomingDamageAbility | undefined,
  runs: number,
): number | null {
  if (!ability || runs <= 0) return null;
  return ability.damage / runs;
}

export function buildIncomingDamageComparisonRows(
  primary: SpeedrunCohortOverviewMetrics | undefined,
  comparison: SpeedrunCohortOverviewMetrics | undefined,
  limit = 10,
): IncomingDamageComparisonRow[] {
  const abilities = new Map<string, IncomingDamageComparisonRow>();

  for (const ability of primary?.top_incoming_damage_abilities ?? []) {
    const key = abilityKey(ability);
    abilities.set(key, {
      key,
      name: ability.name,
      spellId: ability.spell_id,
      environmentType: ability.environment_type,
      primary: ability,
      primaryDamagePerRun: damagePerRun(ability, primary?.runs ?? 0),
      comparisonDamagePerRun: null,
    });
  }

  for (const ability of comparison?.top_incoming_damage_abilities ?? []) {
    const key = abilityKey(ability);
    const existing = abilities.get(key);
    if (existing) {
      existing.comparison = ability;
      existing.comparisonDamagePerRun = damagePerRun(ability, comparison?.runs ?? 0);
      continue;
    }
    abilities.set(key, {
      key,
      name: ability.name,
      spellId: ability.spell_id,
      environmentType: ability.environment_type,
      comparison: ability,
      primaryDamagePerRun: null,
      comparisonDamagePerRun: damagePerRun(ability, comparison?.runs ?? 0),
    });
  }

  return [...abilities.values()]
    .sort((left, right) => {
      const leftDamage = Math.max(left.primaryDamagePerRun ?? 0, left.comparisonDamagePerRun ?? 0);
      const rightDamage = Math.max(right.primaryDamagePerRun ?? 0, right.comparisonDamagePerRun ?? 0);
      if (leftDamage !== rightDamage) return rightDamage - leftDamage;
      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}
