/**
 * Pure TypeScript types for panel processors (worker-safe, no React).
 * 
 * These types are used by both the worker and the main thread.
 * Do NOT import React or any JSX in this file.
 */

import type { StreamType } from "@/hooks/instanceEvents";
import type { PanelFilter } from "./processors/filters";
import type { UnitState } from "./processors/unitState";

/**
 * Activity entry from encounter period tracking.
 * Indicates when a unit becomes active, ends activity, is slain, or bumps its activity timer.
 */
export interface ActivityEntry {
  guid: string;
  eventType: string;  // "start" | "end" | "slain" | "bump"
}

/**
 * Common event metadata present in all event types.
 */
interface EventMeta {
  index: number;
  offsetMilli: number;
  /**
   * Global offset in ms from the start of the first selected encounter.
   * Computed in the worker loop: (encounterStart - firstEncounterStart) + offsetMilli.
   * Used by the time_range filter to support cross-encounter time ranges.
   * Optional — only set by the worker loop; defaults to offsetMilli when absent.
   */
  globalOffsetMilli?: number;
  /** Activity tracking entries from encounter period detection */
  activity: ActivityEntry[];
  activityCount: number;
  /** True when this event was synthetically generated (e.g. projected pre-pull aura). */
  isSynthetic: boolean;
}

/**
 * A tailer (trailer) damage entry - additional damage that occurred alongside the main hit.
 * Examples: Seal of Righteousness proc, Fiery Weapon enchant, etc.
 */
export interface TailerEntry {
  amount: number;
  hitType: number;
}

/**
 * Damage event from the "damage" stream.
 */
export interface DamageProcessorEvent extends EventMeta {
  type: "damage";
  caster: string;
  sourceName: string;
  target: string;
  hitType: number;
  amount: number;
  school: number;
  /** Additional damage entries (procs, enchants, etc.) */
  tailers: TailerEntry[];
  tailerCount: number;
  /** Spell ID from SpellData (if available) */
  spellId: number | null;
  /** AttackOutcome bitmask of possible hit table results (from SpellData) */
  spellAttackOutcome: number | null;
  overkill: number;
}

/**
 * Heal event from the "heal" stream.
 */
export interface HealProcessorEvent extends EventMeta {
  type: "heal";
  caster: string;
  sourceName: string;
  target: string;
  hitType: number;
  amount: number;
  overheal: number;
  absorbed: number;
  school: number;
  spellId: number | null;
  /** AttackOutcome bitmask of possible hit table results (from SpellData) */
  spellAttackOutcome: number | null;
}

/**
 * Resource change event from the "resource_change" stream.
 */
export interface ResourceChangeProcessorEvent extends EventMeta {
  type: "resource_change";
  caster: string;
  sourceName: string;
  target: string;
  amount: number;
  overResource: number;
  resourceType: string;
  spellId: number | null;
  spellAttackOutcome: number | null;
  direction: string;
}

/**
 * Extra attack event from the "extra_attack" stream.
 * Triggered by abilities like Windfury, Sword Specialization, etc.
 */
export interface ExtraAttackProcessorEvent extends EventMeta {
  type: "extra_attack";
  target: string;  // The player who gained extra attacks
  amount: number;  // Number of extra attacks granted
  sourceName: string;  // Name of the ability that granted extra attacks
  spellId: number | null;
  spellAttackOutcome: number | null;
}

/**
 * Attribution damage info - the damage event that caused the death.
 * Subset of DamageProcessorEvent without event metadata.
 */
export interface AttributionDamage {
  caster: string;
  sourceName: string;
  hitType: number;
  amount: number;
  school: number;
  spellId?: number | null;
  spellAttackOutcome?: number | null;
}

/**
 * Slain event from the "slain" stream.
 * Indicates a unit was killed.
 */
export interface SlainProcessorEvent extends EventMeta {
  type: "slain";
  target: string;  // The unit that was slain (victim)
  caster: string;  // The unit that killed the target (killer), may be empty
  attribution: AttributionDamage | null;  // The damage that caused the death
}

export interface ResurrectionProcessorEvent extends EventMeta {
  type: "ressurection";
  source: string;
  target: string;
  spell: { id: number; name: string };
}

/**
 * Cast action constants matching CastAction proto
 */
export const CastAction = {
  Unknown: 0,
  Casts: 1,
  BeginsToCast: 2,
  Channels: 3,
  FailsCasting: 4,
} as const;

export type CastAction = typeof CastAction[keyof typeof CastAction];

/**
 * Spell info from Cast event
 */
export interface SpellInfo {
  name: string;
  id: number;
  rank: number | null;
}

/**
 * Cast event from the "casts" stream.
 * Tracks spell casts, channels, and failed casts.
 */
export interface CastProcessorEvent extends EventMeta {
  type: "cast";
  caster: string;  // The unit casting the spell
  action: CastAction;  // What type of cast action (casts, begins to cast, channels, fails)
  target: string;  // The target of the spell (may be empty)
  spell: SpellInfo;  // Information about the spell being cast
}

/**
 * Aura application constants matching AuraApplication proto
 */
export const AuraApplication = {
  Unknown: 0,
  Gains: 1,
  Fades: 2,
  Removed: 3,
} as const;

export type AuraApplication = typeof AuraApplication[keyof typeof AuraApplication];

/**
 * Aura state constants matching AuraState proto (preferred over AuraApplication)
 */
export const AuraState = {
  Unknown: 0,
  Added: 1,
  Removed: 2,
  Modified: 3,
} as const;

export type AuraState = (typeof AuraState)[keyof typeof AuraState];

/**
 * Aura event from the "aura" stream.
 * Tracks buff/debuff gains, fades, and removals.
 */
export interface AuraProcessorEvent extends EventMeta {
  type: "aura";
  target: string;  // The unit affected by the aura
  spellName: string;  // Name of the aura/buff/debuff
  spellId: number | null;  // Spell ID from SpellData (if available)
  /** AttackOutcome bitmask of possible hit table results (from SpellData) */
  spellAttackOutcome: number | null;
  amount: number;  // Stack count (for Modified events, 0 means ended)
  application: AuraApplication;  // Deprecated: use state instead
  state: AuraState;  // Added, Removed, or Modified
}

/**
 * Spell info for SpellGo events (SpellData: id + name)
 */
export interface SpellGoSpellInfo {
  id: number;
  name: string;
}

/**
 * SpellGo event from the "spell_go" stream.
 * Fires when a spell completes (lands or misses on targets).
 */
export interface SpellGoProcessorEvent extends EventMeta {
  type: "spell_go";
  caster: string;  // The unit who cast the spell
  target: string;  // Primary target (may be empty for AoE)
  spell: SpellGoSpellInfo;  // SpellData: id + name
  numHits: number;  // Number of targets hit
  numMisses: number;  // Number of targets missed
  itemId: number | null;  // Item ID if triggered by an item
  corpseOwner: string | null;  // Corpse owner GUID for corpse-targeted spells
}

/**
 * AuraCast event from the "aura_cast" stream.
 * Fires when an aura (buff/debuff) is applied with detailed timing information.
 */
export interface AuraCastProcessorEvent extends EventMeta {
  type: "aura_cast";
  caster: string;           // The unit who cast the aura
  target: string | null;    // The target receiving the aura (optional)
  spell: { id: number; name: string };  // SpellData: id + name
  effect: number;           // Effect type
  amplitude: number;        // Tick interval in ms (for periodic effects)
  effectMiscValue: number;  // Effect-specific data
  durationMS: number;       // Total duration in milliseconds
  capStatus: number;        // 1=buffs full, 2=debuffs full, 3=both
  effectAuraName: number;   // Aura name/type enum value
}

/**
 * SpellStart event from the "spell_start" stream.
 * Fires when a spell cast begins.
 */
export interface SpellStartProcessorEvent extends EventMeta {
  type: "spell_start";
  caster: string;           // The unit who is casting
  target: string;           // Primary target (may be empty)
  spell: { id: number; name: string };  // SpellData: id + name
  itemId: number | null;    // Item ID if triggered by an item
  castFlags: number;        // Cast flags
  castTimeMilli: number;    // Cast time in milliseconds
  channelTimeMilli: number; // Channel duration in milliseconds
  spellType: number;        // Spell type identifier
}

/**
 * Discriminated union of all event types.
 * Use event.type to narrow to a specific type.
 */
/**
 * SpellFail event from the "spell_fail" stream.
 * Fires when a spell cast fails.
 */
export interface SpellFailProcessorEvent extends EventMeta {
  type: "spell_fail";
  caster: string;           // The unit whose cast failed
  spell: { id: number; name: string };  // SpellData: id + name
  failedByServer: boolean;  // Whether the failure was server-side
}
export interface UnitClassificationProcessorEvent extends EventMeta {
  type: "unit_classification";
  target: string;          // The unit whose classification changed
  unitType: number;        // UnitType enum (0=Unknown, 1=Player, 2=Creature, 3=Object, 4=Vehicle)
  affiliation: number;     // Affiliation enum (0=Unknown, 1=Friendly, 2=Hostile, 3=Neutral)
  owner: string | null;    // Permanent owner GUID (pet/totem)
  controller: string | null; // Possession controller GUID
  spellId: number;         // Possession spell ID (0 if not possessed)
}


export interface CombatantInfoProcessorEvent extends EventMeta {
  type: "combatant_info";
  guid: string;              // Player GUID
  name: string;              // Player name
  heroClass: string;         // e.g. "Warrior", "Mage"
  race: string;              // e.g. "Human", "Orc"
  gender: number;
  guildName: string | null;
  gear: { itemId: number; enchantId: number | null; temporaryEnchantId: number | null }[];
  gearCount: number;
  talents: { summary: number[]; trees: string[] } | null;
}

export interface DispelProcessorEvent extends EventMeta {
  type: "dispel";
  caster: string;        // The unit performing the dispel
  target: string;        // The unit whose aura was removed
  spellId: number | null;
  spellName: string;     // Name of the aura that was dispelled
  spellAttackOutcome: number | null;
  dispelType: number;    // 0=None, 1=Magic, 2=Curse, 3=Disease, 4=Poison, 5=Stealth, 6=Invisibility
}
export interface InterruptProcessorEvent extends EventMeta {
  type: "interrupt";
  caster: string;        // The unit performing the interrupt
  target: string;        // The unit being interrupted
  spellName: string;     // Name of the interrupted spell
  extraSpellId: number;  // ID of the interrupted spell
  extraSchool: number;   // 0=Unknown, 1=None, 2=Physical, 3=Holy, 4=Fire, 5=Nature, 6=Frost, 7=Shadow, 8=Arcane
}

export interface AbsorbedProcessorEvent extends EventMeta {
  type: "absorbed";
  attacker: string;              // Unit dealing the initial damage
  target: string;                // Unit whose shield absorbs the damage
  damageSpellId: number | null;  // Spell that dealt the damage (null for melee)
  damageSpellName: string | null;
  caster: string;                // Unit that cast the absorb shield
  absorbSpellId: number | null;  // e.g. Power Word: Shield
  absorbSpellName: string | null;
  absorbSchool: number;          // School of the absorb spell
  amount: number;                // Damage absorbed
  estimated: boolean;            // Attribution was inferred rather than reported directly
}

export interface CompanionStatsProcessorEvent extends EventMeta {
  type: "companion_stats";
  buckets: number[];  // [10] landed chunk counts per minute (index 0 = current minute)
}

/**
 * Evidence kind describing how consume evidence was observed.
 */
export type EvidenceKind =
  | 0  // Unknown
  | 1  // DirectItem (SpellGo with itemID)
  | 2  // Cast
  | 3  // Aura
  | 4  // Heal
  | 5  // Resource
  | 6  // Damage
  | 7  // ActiveAtPull (pre-pull aura projected into encounter)
  | 8; // Cooldown

/**
 * Evidence confidence level.
 */
export type EvidenceConfidence =
  | 0  // Unknown
  | 1  // Direct (authoritative, item ID present)
  | 2  // EffectDerived (from known spell effect)
  | 3  // Ambiguous (multiple possible items)
  | 4; // Inferred (cooldown/timing heuristic)

export interface ConsumeProcessorEvent extends EventMeta {
  type: "consume";
  consumeId: string;
  evidenceId: string;
  player: string;
  itemId: number | null;
  candidateItemIds: number[];
  candidateItemIdsCount: number;
  spell: { id: number; name: string };
  kind: EvidenceKind;
  confidence: EvidenceConfidence;
  consumedAtUnixMilli: number | null;
  observedAtUnixMilli: number;
  amount: number | null;
  resourceType: string | null;
  isProjection: boolean;
}

export type ProcessorEvent = DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent | ExtraAttackProcessorEvent | SlainProcessorEvent | ResurrectionProcessorEvent | CastProcessorEvent | AuraProcessorEvent | SpellGoProcessorEvent | AuraCastProcessorEvent | SpellStartProcessorEvent | SpellFailProcessorEvent | UnitClassificationProcessorEvent | CombatantInfoProcessorEvent | DispelProcessorEvent | InterruptProcessorEvent | AbsorbedProcessorEvent | CompanionStatsProcessorEvent | ConsumeProcessorEvent;

/**
 * Selection state for filtering entities (serializable for worker transport).
 * Arrays are used because Sets don't serialize through postMessage.
 */
export interface SerializableEntitySelection {
  enemyIds: string[];
  playerIds: string[];
}

/**
 * Selection state with Sets for fast lookups in processors.
 */
export interface ProcessorEntitySelection {
  enemyIds: Set<string>;
  playerIds: Set<string>;
}

/**
 * Player info from instance data (subset needed by processors).
 */
export interface ProcessorPlayer {
  name: string;
  class: string;
  level?: number;
}

/**
 * Unit info from instance data (subset needed by processors).
 */
export interface ProcessorUnit {
  name: string;
  owner: string | null;
  entry: number;
}

/**
 * Pagination options for processors that support paging through events.
 */
export interface ProcessorPagination {
  /** Number of events to skip */
  offset: number;
  /** Maximum number of events to capture */
  limit: number;
  /** Which streams to include in pagination (if not set, all streams are included) */
  enabledStreams?: string[];
  /** Filter events by ability/source name (case-insensitive substring match) */
  abilityFilter?: string;
  /** Filter events by caster/source name (case-insensitive substring match) */
  sourceFilter?: string;
  /** Filter events by target name (case-insensitive substring match) */
  targetFilter?: string;
}

/**
 * Serializable context sent to worker via postMessage.
 */
export interface SerializableProcessorContext {
  /** Players map: guid -> player info */
  players: Record<string, ProcessorPlayer>;
  
  /** Units map: guid -> unit info */
  units?: Record<string, ProcessorUnit>;
  
  /** Currently selected encounter IDs */
  selectedEncounterIds: string[];
  
  /** Currently selected entity GUIDs for filtering (arrays for serialization) */
  entitySelection: SerializableEntitySelection;
  
  /** Optional pagination for processors that support paging (e.g., all_activity) */
  pagination?: ProcessorPagination;

  /** Panel-specific option (e.g., selected vulnerability spell ID) */
  panelOption?: string | null;

  /** Optional panel-specific context payload for processor configuration. */
  panelContext?: Record<string, unknown> | null;

  /** Server-computed feature flags for this instance (e.g., "overheal"). */
  capabilities?: readonly string[];

  /** Optional event filters evaluated before processor.processEvent. */
  filters?: PanelFilter[];
}

/**
 * Context available to processors with Sets for fast lookups.
 */
export interface ProcessorContext {
  /** Players map: guid -> player info */
  players: Record<string, ProcessorPlayer>;
  
  /** Units map: guid -> unit info */
  units?: Record<string, ProcessorUnit>;
  
  /** Currently selected encounter IDs */
  selectedEncounterIds: Set<string>;
  
  /** Currently selected entity GUIDs for filtering */
  entitySelection: ProcessorEntitySelection;
  
  /** Optional pagination for processors that support paging */
  pagination?: ProcessorPagination;

  /** Panel-specific option (e.g., selected vulnerability spell ID) */
  panelOption?: string | null;

  /** Optional panel-specific context payload for processor configuration. */
  panelContext?: Record<string, unknown> | null;

  /** Server-computed feature flags for this instance (e.g., "overheal"). */
  capabilities?: readonly string[];

  /** Optional event filters evaluated before processor.processEvent. */
  filters?: PanelFilter[];

  /**
   * Compiled filter predicate from panel filters.
   * Set when processAllEvents is true so the processor can apply filtering selectively.
   * Returns true if the event passes the filter.
   */
  compiledFilter?: (event: ProcessorEvent) => boolean;

  /**
   * Temporal unit ownership state.
   * Populated by the worker from unit_classification events before each
   * processEvent call, so ownership queries reflect the current point in time.
   */
  unitState?: UnitState;
}

/**
 * Pure processor definition (no React, worker-safe).
 * 
 * @typeParam TResult - The aggregated state type returned by this processor
 * @typeParam TEvent - The event types this processor handles (defaults to all ProcessorEvent types)
 */
export interface PanelProcessor<TResult, TEvent extends ProcessorEvent = ProcessorEvent> {
  /** Unique identifier for this panel type */
  id: string;
  
  /** Which streams this panel needs */
  streams: StreamType[];
  
  /**
   * Create the initial state for aggregation.
   * Must return a serializable value (no functions, no circular refs).
   */
  createState: () => TResult;
  
  /**
   * If true, the worker skips pre-filtering and passes ALL events to processEvent.
   * The compiled filter predicate is attached to context.compiledFilter so the
   * processor can apply it selectively (e.g., for aggregation but not deficit tracking).
   */
  processAllEvents?: boolean;

  /**
   * Process a single event and update the state.
   */
  processEvent: (
    state: TResult,
    event: TEvent,
    encounterID: string,
    firstTimestamp: Date,
    streamType: StreamType,
    context: ProcessorContext,
  ) => void;
}

/**
 * Message sent from main thread to worker.
 */
export interface WorkerRequest {
  requestId: number;
  panelId: string;
  context: SerializableProcessorContext;
  streams: {
    type: StreamType;
    data: Uint8Array;
  }[];
}

/**
 * Message sent from worker to main thread.
 */
export interface WorkerResponse {
  requestId: number;
  result: unknown;
  totalEvents: number;
  /** Total worker-side processing time (stream processing + result serialization). */
  processingTimeMs: number;
  /** Time spent iterating streams and running processor logic. */
  streamProcessingTimeMs: number;
  /** Time spent serializing the result payload for postMessage. */
  serializationTimeMs: number;
  /** Time spent waiting for an available worker slot before processing started. */
  queueWaitMs: number;
  error?: string;
}
