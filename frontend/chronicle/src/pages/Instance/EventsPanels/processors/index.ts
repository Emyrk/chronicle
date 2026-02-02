/**
 * Registry of all panel processors (worker-safe).
 */

import type { PanelProcessor } from "../processorTypes";
import { damageDoneProcessor, enemyDamageDoneProcessor, petDamageDoneProcessor, friendlyFireProcessor } from "../DamageDone/damageDone.processor";
import { damageTakenProcessor, enemyDamageTakenProcessor } from "../DamageTaken/damageTaken.processor";
import { extraAttacksProcessor } from "../ExtraAttacks/extraAttacks.processor";
import { deathsProcessor } from "../Deaths/deaths.processor";
import { allActivityProcessor } from "./allActivityDebug.processor";
import { unifiedHealingProcessor } from "./healing.processor";
import { mitigationProcessor } from "./mitigation.processor";
import { avoidanceProcessor } from "./avoidance.processor";
import { emptyProcessor } from "../Empty/empty.processor";
import { resourceRegenProcessor } from "../ResourceRegen/resourceRegen.processor";
import { innervateProcessor } from "../Innervate/innervate.processor";
import { sunderProcessor } from "../Sunder/sunder.processor";

// Export individual processors
export { damageDoneProcessor, enemyDamageDoneProcessor, petDamageDoneProcessor, friendlyFireProcessor } from "../DamageDone/damageDone.processor";
export { damageTakenProcessor, enemyDamageTakenProcessor } from "../DamageTaken/damageTaken.processor";
export { extraAttacksProcessor } from "../ExtraAttacks/extraAttacks.processor";
export { deathsProcessor } from "../Deaths/deaths.processor";
export { allActivityProcessor } from "./allActivityDebug.processor";
export { unifiedHealingProcessor } from "./healing.processor";
export { mitigationProcessor } from "./mitigation.processor";
export { avoidanceProcessor } from "./avoidance.processor";
export { emptyProcessor } from "../Empty/empty.processor";
export { resourceRegenProcessor } from "../ResourceRegen/resourceRegen.processor";
export { innervateProcessor } from "../Innervate/innervate.processor";
export { sunderProcessor } from "../Sunder/sunder.processor";

// Export state types
export type { DamageDoneResult as DamageDoneState, DamageDoneData, DamageSourceType } from "../DamageDone/damageDone.processor";
export type { DamageTakenResult as DamageTakenState, DamageTakenData, DamageTargetType } from "../DamageTaken/damageTaken.processor";
export type { UnifiedHealingResult, HealerData, HealingReceiverData, HealingTargetData, HealingSourceData } from "./healing.processor";
export type { ExtraAttacksResult as ExtraAttacksState, ExtraAttacksData } from "../ExtraAttacks/extraAttacks.processor";
export type { DeathsResult as DeathsState, DeathEvent, PlayerDeathsData } from "../Deaths/deaths.processor";
export type { AllActivityDebugState as AllActivityState, RawDebugEvent, EncounterMeta, ResourceType } from "./allActivityDebug.processor";
export type { MitigationResult, MitigationData, EncounterMitigation } from "./mitigation.processor";
export type { AvoidanceResult, AvoidanceData, EncounterAvoidance } from "./avoidance.processor";
export type { EmptyResult } from "../Empty/empty.processor";
export type { ResourceRegenResult, PlayerResourceData, ResourceAbilityData } from "../ResourceRegen/resourceRegen.processor";
export type { InnervateResult, InnervateCast } from "../Innervate/innervate.processor";
export type { SunderResult, WarriorSunderStats, TargetSunderStats, ConfirmedSunder, SunderDebugEvent } from "../Sunder/sunder.processor";
// Note: ResourceType is exported from allActivityDebug.processor above
export type { PlayerRoleData, InferredRole, RoleSummary, RoleDetectionDebug, InferRolesResult } from "../Roles/roles.processor";
export { inferRoles, getRoleSummary } from "../Roles/roles.processor";

// Export shared utilities
export { accumulateAbilityBreakout, createEmptyAbilityBreakout, updateAbilityBreakout, type DamageAbilityBreakout } from "./abilityBreakout";

export { isResourceChangeEvent, isHealingEvent, isDamageEvent } from "./events";

/**
 * Registry of all processors by panel ID.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const processorRegistry: Record<string, PanelProcessor<any, any>> = {
  damage_done: damageDoneProcessor,
  damage_done_enemies: enemyDamageDoneProcessor,
  damage_done_pets: petDamageDoneProcessor,
  damage_done_friendly_fire: friendlyFireProcessor,
  damage_taken: damageTakenProcessor,
  damage_taken_enemies: enemyDamageTakenProcessor,
  // Unified healing processor for both healing_done and healing_taken
  healing_done: unifiedHealingProcessor,
  healing_taken: unifiedHealingProcessor, // Same processor, different view
  extra_attacks: extraAttacksProcessor,
  deaths: deathsProcessor,
  death_log: deathsProcessor, // Same processor, different view
  all_activity: allActivityProcessor,
  mitigation: mitigationProcessor,
  avoidance: avoidanceProcessor,
  empty: emptyProcessor,
  resource_regen: resourceRegenProcessor,
  // Note: roles panel doesn't have its own processor - it reuses damage_taken and healing_done
  // Class: Druid
  innervate: innervateProcessor,
  // Class: Warrior
  sunder: sunderProcessor,
};
