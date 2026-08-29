/**
 * Registry of all panel processors (worker-safe).
 */

import type { PanelProcessor } from "../processorTypes";
import { damageDoneProcessor, vulnerabilityEffectProcessor, enemyDamageDoneProcessor, petDamageDoneProcessor, friendlyFireProcessor } from "../DamageDone/damageDone.processor";
import { damageTakenProcessor, enemyDamageTakenProcessor } from "../DamageTaken/damageTaken.processor";
import { extraAttacksProcessor } from "../ExtraAttacks/extraAttacks.processor";
import { deathsProcessor } from "../Deaths/deaths.processor";
import { allActivityProcessor } from "./allActivityDebug.processor";
import { unifiedHealingProcessor } from "./healing.processor";
import { mitigationProcessor } from "./mitigation.processor";
import { avoidanceProcessor } from "./avoidance.processor";
import { emptyProcessor } from "../Empty/empty.processor";
import { leaderboardProcessor } from "../LeaderboardPanel/leaderboard.processor";
import { loggingMetadataProcessor } from "../LoggingMetadata/loggingMetadata.processor";

import { resourceRegenProcessor } from "../ResourceRegen/resourceRegen.processor";
import { innervateProcessor } from "../Innervate/innervate.processor";
import { sunderProcessor } from "../Sunder/sunder.processor";
import { judgementProcessor } from "../Judgement/judgement.processor";
import { metricsProcessor } from "../Metrics/metrics.processor";
import { auraUptimeProcessor } from "../AuraUptime/auraUptime.processor";
import { comparisonProcessor } from "../ComparisonPanel/comparison.processor";
import { timelineProcessor } from "../Timeline/timeline.processor";
import { rotationsProcessor } from "../Rotations/rotations.processor";
import { statusProcessor } from "../Status/status.processor";
import { healerCastsProcessor } from "../HealerCasts/healerCasts.processor";
import { spellCountProcessor } from "../SpellCount/spellCount.processor";
import { possessionProcessor } from "../PossessionPanel/possession.processor";
import { vehicleProcessor } from "../VehiclePanel/vehicle.processor";
import { unitLookupProcessor } from "../UnitLookup/unitLookup.processor";
import { dispelProcessor } from "../Dispel/dispel.processor";
import { interruptProcessor } from "../Interrupt/interrupt.processor";
import { equipmentProcessor } from "../Equipment/equipment.processor";
import { lootProcessor } from "../LootPanel/loot.processor";
import { absorbedDamageProcessor } from "../AbsorbedDamage/absorbedDamage.processor";
import { consumablesProcessor, consumablesTotalProcessor, consumablesLedgerProcessor } from "../Consumables/consumables.processor";
import { resistsProcessor } from "../ResistsPanel/resists.processor";
import { guildsProcessor } from "../Guilds/guilds.processor";
import { companionStatsProcessor } from "../CompanionStats/companionStats.processor";
import { playerLifeStateProcessor } from "./playerLifeState.processor";
import { pullsAndCleanupProcessor } from "../PullsAndCleanup/pullsAndCleanup.processor";
import { tankAttemptsProcessor } from "../Roles/tankAttempts.processor";

// Export individual processors
export { damageDoneProcessor, vulnerabilityEffectProcessor, enemyDamageDoneProcessor, petDamageDoneProcessor, friendlyFireProcessor } from "../DamageDone/damageDone.processor";
export { damageTakenProcessor, enemyDamageTakenProcessor } from "../DamageTaken/damageTaken.processor";
export { extraAttacksProcessor } from "../ExtraAttacks/extraAttacks.processor";
export { deathsProcessor } from "../Deaths/deaths.processor";
export { allActivityProcessor } from "./allActivityDebug.processor";
export { unifiedHealingProcessor } from "./healing.processor";
export { mitigationProcessor } from "./mitigation.processor";
export { avoidanceProcessor } from "./avoidance.processor";
export { emptyProcessor } from "../Empty/empty.processor";
export { leaderboardProcessor } from "../LeaderboardPanel/leaderboard.processor";
export { loggingMetadataProcessor } from "../LoggingMetadata/loggingMetadata.processor";

export { resourceRegenProcessor } from "../ResourceRegen/resourceRegen.processor";
export { innervateProcessor } from "../Innervate/innervate.processor";
export { sunderProcessor } from "../Sunder/sunder.processor";
export { judgementProcessor } from "../Judgement/judgement.processor";
export { metricsProcessor } from "../Metrics/metrics.processor";
export { auraUptimeProcessor } from "../AuraUptime/auraUptime.processor";
export { comparisonProcessor } from "../ComparisonPanel/comparison.processor";
export { timelineProcessor } from "../Timeline/timeline.processor";
export { rotationsProcessor } from "../Rotations/rotations.processor";
export { statusProcessor } from "../Status/status.processor";
export { healerCastsProcessor } from "../HealerCasts/healerCasts.processor";
export { spellCountProcessor } from "../SpellCount/spellCount.processor";
export { possessionProcessor } from "../PossessionPanel/possession.processor";
export { vehicleProcessor } from "../VehiclePanel/vehicle.processor";
export { unitLookupProcessor } from "../UnitLookup/unitLookup.processor";
export { dispelProcessor } from "../Dispel/dispel.processor";
export { interruptProcessor } from "../Interrupt/interrupt.processor";
export { equipmentProcessor } from "../Equipment/equipment.processor";
export { consumablesProcessor, consumablesTotalProcessor, consumablesLedgerProcessor } from "../Consumables/consumables.processor";
export type { ConsumablesResult, ConsumableUse } from "../Consumables/consumables.processor";
export { lootProcessor } from "../LootPanel/loot.processor";
export { absorbedDamageProcessor } from "../AbsorbedDamage/absorbedDamage.processor";
export { resistsProcessor } from "../ResistsPanel/resists.processor";
export { guildsProcessor } from "../Guilds/guilds.processor";
export { pullsAndCleanupProcessor } from "../PullsAndCleanup/pullsAndCleanup.processor";

// Export state types
export type { DamageDoneResult as DamageDoneState, DamageDoneData, DamageSourceType } from "../DamageDone/damageDone.processor";
export type { DamageTakenResult as DamageTakenState, DamageTakenData, DamageTargetType } from "../DamageTaken/damageTaken.processor";
export type { UnifiedHealingResult, HealerData, HealingReceiverData, HealingTargetData, HealingSourceData } from "./healing.processor";
export type { ExtraAttacksResult as ExtraAttacksState, ExtraAttacksData } from "../ExtraAttacks/extraAttacks.processor";
export type { DeathsResult as DeathsState, DeathEvent, DeathRecapEntry, PlayerDeathsData } from "../Deaths/deaths.processor";
export type { AllActivityDebugState as AllActivityState, RawDebugEvent, EncounterMeta, ResourceType } from "./allActivityDebug.processor";
export type { MitigationResult, MitigationData, EncounterMitigation } from "./mitigation.processor";
export type { AvoidanceResult, AvoidanceData, EncounterAvoidance } from "./avoidance.processor";
export type { EmptyResult } from "../Empty/empty.processor";
export type { MetricsResult } from "../Metrics/metrics.processor";
export type { ResourceRegenResult, PlayerResourceData, ResourceAbilityData } from "../ResourceRegen/resourceRegen.processor";
export type { InnervateResult, InnervateCast } from "../Innervate/innervate.processor";
export type { SunderResult, WarriorSunderStats, TargetSunderStats, ConfirmedSunder, SunderDebugEvent } from "../Sunder/sunder.processor";
export type { JudgementResult, TargetJudgementStats, JudgementApplication, JudgementType, JudgementOfLightBenefit } from "../Judgement/judgement.processor";
export type { AuraUptimeResult, AuraData, TargetUptimeData, UptimeSegment } from "../AuraUptime/auraUptime.processor";
export type { TimelineResult, TimelineSeriesMeta } from "../Timeline/timeline.processor";
export type { TimelineSeriesConfig, AggregationType, TimelineSettings } from "../Timeline/timelineTypes";
export type { RotationsResult, CastEntry, AuraSegment } from "../Rotations/rotations.processor";
export type { StatusResult, StatusEncounter, StatusUnitTimeline, StatusTimelineEvent } from "../Status/status.processor";
export type { HealerCastsResult, HealerCastsEncounter, HealerCastEntry } from "../HealerCasts/healerCasts.processor";
export type { SpellCountResult, SpellCountData } from "../SpellCount/spellCount.processor";
export type { DispelResult, DispelEntityData, DispelSpellData, DispelCategory, DispelLogEvent } from "../Dispel/dispel.processor";
export type { InterruptResult, InterruptEntityData, InterruptSpellData, InterruptLogEvent } from "../Interrupt/interrupt.processor";
export type { EquipmentResult, PlayerSnapshot } from "../Equipment/equipment.processor";
export type { LootResult } from "../LootPanel/loot.processor";
export type { AbsorbedDamageResult, AbsorbedDamageData } from "../AbsorbedDamage/absorbedDamage.processor";
export type { ResistsResult, PlayerResistData, AbilityResistBreakout } from "../ResistsPanel/resists.processor";
export type { GuildsResult, GuildEntry, GuildPlayerInfo } from "../Guilds/guilds.processor";
export type { PullsAndCleanupResult } from "../PullsAndCleanup/pullsAndCleanup.processor";
// Note: ResourceType is exported from allActivityDebug.processor above
export type { PlayerRoleData, InferredRole, RoleSummary, RoleDetectionDebug, InferRolesResult } from "../Roles/roles.processor";
export { inferRoles, getRoleSummary } from "../Roles/roles.processor";
export { tankAttemptsProcessor } from "../Roles/tankAttempts.processor";
export type { TankAttemptCounts, TankInferenceResult, PlayerTankEvidence, SourceEvidence } from "../Roles/tankInference";
export { inferTanks, AlgorithmVersion, TankThreshold, EvidenceAttempts, createTankAttemptCounts } from "../Roles/tankInference";

// Export shared utilities
export { accumulateAbilityBreakout, createEmptyAbilityBreakout, updateAbilityBreakout, type DamageAbilityBreakout } from "./abilityBreakout";
export { createAuraProcessorState, applyAuraEvent, applySlainEvent, hasAura, getAuraStacks, type AuraProcessorState, type AuraRef } from "./auraProcessor";

export {
  playerLifeStateProcessor,
  PlayerLifeStateIndex,
  type PlayerLifeStateResult,
  type PlayerLifeTransition,
} from "./playerLifeState.processor";

export { isResourceChangeEvent, isHealingEvent, isDamageEvent } from "./events";

/**
 * Registry of all processors by panel ID.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const processorRegistry: Record<string, PanelProcessor<any, any>> = {
  player_life_state: playerLifeStateProcessor,
  damage_done: damageDoneProcessor,
  vulnerability_effect: vulnerabilityEffectProcessor,
  damage_done_enemies: enemyDamageDoneProcessor,
  damage_done_pets: petDamageDoneProcessor,
  damage_done_friendly_fire: friendlyFireProcessor,
  damage_taken: damageTakenProcessor,
  damage_taken_enemies: enemyDamageTakenProcessor,
  // Unified healing processor for both healing_done and healing_taken
  healing_done: unifiedHealingProcessor,
  healing_taken: unifiedHealingProcessor, // Same processor, different view
  extra_attacks: extraAttacksProcessor,
  consumables: consumablesProcessor,
  consumables_total: consumablesTotalProcessor,
  consumables_ledger: consumablesLedgerProcessor,
  deaths: deathsProcessor,
  death_log: deathsProcessor, // Same processor, different view
  all_activity: allActivityProcessor,
  mitigation: mitigationProcessor,
  avoidance: avoidanceProcessor,
  empty: emptyProcessor,
  leaderboard: leaderboardProcessor,
  logging_metadata: loggingMetadataProcessor,

  resource_regen: resourceRegenProcessor,
  // Tank attempts processor for role inference
  tank_attempts: tankAttemptsProcessor,
  // Note: roles panel doesn't have its own processor - it reuses damage_taken and healing_done
  // Class: Druid
  innervate: innervateProcessor,
  // Class: Warrior
  sunder: sunderProcessor,
  // Class: Paladin
  judgement: judgementProcessor,
  // Aura tracking
  aura_uptime: auraUptimeProcessor,
  // Debug/analysis
  metrics: metricsProcessor,
  // Cross-panel comparison
  comparison: comparisonProcessor,
  // Charts
  timeline: timelineProcessor,
  // Replay
  status: statusProcessor,
  healer_casts: healerCastsProcessor,
  spell_count: spellCountProcessor,
  replay_strip: { ...emptyProcessor, id: "replay_strip" },
  raid_durability_strip: { ...statusProcessor, id: "raid_durability_strip" },
  // Rotations
  rotations: rotationsProcessor,
  // Control timelines
  possession: possessionProcessor,
  vehicle: vehicleProcessor,
  // Unit lookup
  unit_lookup: unitLookupProcessor,
  // Dispels
  dispels_done: dispelProcessor,
  dispels_received: dispelProcessor,
  dispel_log: dispelProcessor,
  // Interrupts
  interrupts: interruptProcessor,
  interrupt_log: interruptProcessor,
  // Equipment
  equipment: equipmentProcessor,
  // Loot
  loot: lootProcessor,
  absorbed_damage: absorbedDamageProcessor,
  resists: resistsProcessor,
  guilds: guildsProcessor,
  companion_stats: companionStatsProcessor,
  pulls_and_cleanup: pullsAndCleanupProcessor,
};
