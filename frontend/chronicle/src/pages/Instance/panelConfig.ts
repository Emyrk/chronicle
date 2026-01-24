import type { Ability, EncounterDamageSummary, InstancePlayer } from "@/api/typesGenerated";
import type { AbilityBreakdown, PlayerMetricChartData, RawAbilities } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { GUID } from "@/lib/guid/guid";

export type PanelType = 'damage_done' | 'damage_taken' | 'enemy_damage_done' | 'enemy_damage_taken';

export interface PanelConfig {
  label: string;
  chartType: 'damage' | 'healing';
  /** Transform raw damage summary into chart data */
  transform: (
    panelType : PanelType,
    data: EncounterDamageSummary[],
    players: Record<string, InstancePlayer>,
    enemies: Map<string, string>,
    selectedPlayerIds: Set<string>,
    selectedEnemyIds: Set<string>
  ) => PlayerMetricChartData[];
}

// ============================================================================
// Data transformation helpers
// ============================================================================

function filterAbilities(targetFilter: Set<string>, records: Record<string, Record<string, Ability>>): ({
  total: number;
  filtered: Record<string, Record<string, Ability>>
}) {
  const result: Record<string, Record<string, Ability>> = {};
  let total = 0;

  for (const key in records) {
    if (!Object.prototype.hasOwnProperty.call(records, key))
      continue;

    if (targetFilter.size === 0 || targetFilter.has(key)) {
      result[key] = records[key];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      total += Object.entries(records[key]).reduce((sum, [_, ability]) => sum + ability.total, 0);
    }
  }
  return { total, filtered: result };
}

type AggregatedDamageSummary = {
    damageDoneTotal: number;
  damageTakenTotal: number;
  damageDoneAbilities: RawAbilities;
  damageTakenAbilities: RawAbilities;
  isPlayer: boolean;
  name: string;
  ownerGuid: GUID | null;
}

/**
 * Aggregate damage summary records by unit GUID.
 * Returns a map of GUID -> aggregated totals and abilities.
 */
function aggregateByUnit(targetFilter: Set<string>, records: EncounterDamageSummary[]): Map<string, AggregatedDamageSummary> {
  const result = new Map<string, AggregatedDamageSummary>();

  for (const record of records) {
    const guid = String(record.unit_guid);
    const existing = result.get(guid);

    if (existing) {
      // Merge abilities - for simplicity, later records override earlier ones
      // A more sophisticated merge would sum ability values
      existing.damageDoneTotal += mergeAbilities(targetFilter, existing.damageDoneAbilities, record.damage_done_abilities);
      existing.damageTakenTotal += mergeAbilities(targetFilter, existing.damageTakenAbilities, record.damage_taken_abilities);
      continue;
    } 

    const {total: totalDamage, filtered: damageDone} = filterAbilities(targetFilter, record.damage_done_abilities);
    const {total: totalTaken, filtered: damageTaken} = filterAbilities(targetFilter, record.damage_taken_abilities);

    result.set(guid, {
      damageDoneTotal: totalDamage,
      damageTakenTotal: totalTaken,
      damageDoneAbilities: damageDone,
      damageTakenAbilities: damageTaken,
      isPlayer: record.is_player,
      ownerGuid: record.owner_guid,
      name: record.unit_name,
    });
  }

  return result;
}

/**
 * Merge source abilities into target (mutates target).
 */
function mergeAbilities(targetFilter: Set<string>, target: RawAbilities, source: RawAbilities): number {
  let total = 0;
  for (const [targetGuid, abilities] of Object.entries(source)) {
    if (targetFilter.size > 0 && !targetFilter.has(targetGuid)) {
      continue;
    }
    if (!target[targetGuid]) {
      target[targetGuid] = {};
    }
    for (const [abilityName, ability] of Object.entries(abilities)) {
      const existing = target[targetGuid][abilityName];
      if (existing) {
        target[targetGuid][abilityName] = mergeAbility(existing, ability);
      } else {
        target[targetGuid][abilityName] = { ...ability };
      }
      total += ability.total;
    }
  }
  return total
}

function mergeAbility(target: Ability, source: Ability): Ability {
  return {
    total: target.total + source.total,
    hit_count: target.hit_count + source.hit_count,
    crit_count: target.crit_count + source.crit_count,
    miss_count: target.miss_count + source.miss_count,
    dodge_count: target.dodge_count + source.dodge_count,
    immune_count: target.immune_count + source.immune_count,
    parry_count: target.parry_count + source.parry_count,
    other_count: target.other_count + source.other_count,
  };
}

/**
 * Convert rawAbilities (nested by target GUID, then ability name) into a flat
 * AbilityBreakdown[] aggregated across all targets.
 */
function computeAbilityBreakdown(rawAbilities: RawAbilities | undefined): AbilityBreakdown[] {
  if (!rawAbilities) return [];
  
  // Aggregate abilities across all targets
  const byAbilityName = new Map<string, Ability>();
  
  for (const targetAbilities of Object.values(rawAbilities)) {
    for (const [abilityName, ability] of Object.entries(targetAbilities)) {
      const existing = byAbilityName.get(abilityName);
      if (existing) {
        byAbilityName.set(abilityName, mergeAbility(existing, ability));
      } else {
        byAbilityName.set(abilityName, { ...ability });
      }
    }
  }
  
  // Convert to AbilityBreakdown[] and sort by total damage descending
  return Array.from(byAbilityName.entries())
    .map(([name, ability]) => ({
      name,
      totalDamage: ability.total,
      hitCount: ability.hit_count,
      critCount: ability.crit_count,
      missCount: ability.miss_count,
      dodgeCount: ability.dodge_count,
      immuneCount: ability.immune_count,
      parryCount: ability.parry_count,
      otherCount: ability.other_count,
    }))
    .sort((a, b) => b.totalDamage - a.totalDamage);
}

// ============================================================================
// Panel-specific transformations
// ============================================================================

function terraformGeneral(
  panelType : PanelType,
  data: EncounterDamageSummary[],
  players: Record<string, InstancePlayer>,
  enemies: Map<string, string>,
  selectedPlayerIds: Set<string>,
  selectedEnemyIds: Set<string>
) : PlayerMetricChartData[] {
  // Filter data based on panel type and selections
  switch (panelType) {
    case 'damage_done':
    case 'damage_taken':
      data = data.filter(record => {
        // This is jank
        return record.is_player || (record.owner_guid != null && GUID.fromString(record.owner_guid.toString()).isPlayer());
      });
      break
    case 'enemy_damage_done':
    case 'enemy_damage_taken':
      data = data.filter(record => {
        return !record.is_player
      });
      break;
    default:
      throw new Error(`Unknown panel type: ${panelType}`);
  }

  let creatureType = "CREATURE";
  let targetFilter = selectedPlayerIds
  switch (panelType) {
    case 'damage_done':
    case 'damage_taken':
      targetFilter = selectedEnemyIds
      break
    case 'enemy_damage_done':
    case 'enemy_damage_taken':
      targetFilter = selectedPlayerIds
      creatureType = "ENEMY";
      break;
    default:
      throw new Error(`Unknown panel type: ${panelType}`);
  }

  const aggregated = aggregateByUnit(targetFilter, data);
  const result: Record<string, PlayerMetricChartData> = {};

  const isPlayerPanel = panelType === 'damage_done' || panelType === 'damage_taken';
  const isDonePanel = panelType === 'damage_done' || panelType === 'enemy_damage_done';
  let pets = new Map<string, AggregatedDamageSummary>();


  for (const [guid, stats] of aggregated) {
    if(stats.ownerGuid != null) {
      pets.set(guid, stats);
      continue;
    }

    // Skip mismatched entity types
    if (isPlayerPanel !== stats.isPlayer) continue;

    const player = players[guid];
    if (isPlayerPanel && !player) continue;

    const enemyName = stats.name || enemies.get(guid);
    const selectionSet = isPlayerPanel ? selectedPlayerIds : selectedEnemyIds;

    result[guid] = {
      playerID: guid,
      playerName: isPlayerPanel ? player.name : (enemyName || `Enemy ${guid.slice(-8)}`),
      className: isPlayerPanel ? player.class : creatureType,
      specialization: "",
      value: isDonePanel ? stats.damageDoneTotal : stats.damageTakenTotal,
      rawAbilities: isDonePanel ? stats.damageDoneAbilities : stats.damageTakenAbilities,
      dimmed: selectedPlayerIds.size > 0 && !selectionSet.has(guid),
    };
  }

  for (const [petGuid, petStats] of pets) {
    const ownerGuid = petStats.ownerGuid;
    if (!ownerGuid) continue;
    
    const owner = result[ownerGuid.toString()];
    if (!owner) continue;

    const value = isDonePanel ? petStats.damageDoneTotal : petStats.damageTakenTotal;
    const abilities = isDonePanel ? petStats.damageDoneAbilities : petStats.damageTakenAbilities;

    if (owner.rawAbilities == null) {
      owner.rawAbilities = {};
    }

    owner.value = (owner.value || 0) + value;
    const asOneAbility = Object.values(abilities).reduce((acc, abilityMap) => {
      for (const [key, value] of Object.entries(abilityMap)) {
        acc = mergeAbility(acc, value);
      }
      return acc;
    }, {
      total: 0,
      hit_count: 0,
      crit_count: 0,
      miss_count: 0,
      dodge_count: 0,
      immune_count: 0,
      parry_count: 0,
      other_count: 0,
    } as Ability);
    for(const target of Object.keys(abilities)) {
      if (!owner.rawAbilities[target]) {
        owner.rawAbilities[target] = {};
      }

      owner.rawAbilities[target]["Pet: " + petStats.name] = asOneAbility;
    }
    
    result[ownerGuid.toString()] = owner;
  }
  
  // Compute abilityBreakdown for each player from their rawAbilities
  for (const entry of Object.values(result)) {
    entry.abilityBreakdown = computeAbilityBreakdown(entry.rawAbilities);
  }
  
  return Object.values(result)
}

// ============================================================================
// Panel configuration
// ============================================================================

export const PANEL_CONFIGS: Record<PanelType, PanelConfig> = {
  damage_done: {
    label: 'Damage Done',
    chartType: 'damage',
    transform: terraformGeneral,
  },
  damage_taken: {
    label: 'Damage Taken',
    chartType: 'damage',
    transform: terraformGeneral,
  },
  enemy_damage_done: {
    label: 'Enemy Damage Done',
    chartType: 'damage',
    transform: terraformGeneral,
  },
  enemy_damage_taken: {
    label: 'Enemy Damage Taken',
    chartType: 'damage',
    transform: terraformGeneral,
  },
};

export const PANEL_OPTIONS: { value: PanelType; label: string }[] = Object.entries(PANEL_CONFIGS).map(
  ([value, config]) => ({ value: value as PanelType, label: config.label })
);
