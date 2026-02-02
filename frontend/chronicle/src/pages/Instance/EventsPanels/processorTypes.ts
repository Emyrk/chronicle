/**
 * Pure TypeScript types for panel processors (worker-safe, no React).
 * 
 * These types are used by both the worker and the main thread.
 * Do NOT import React or any JSX in this file.
 */

import type { StreamType } from "@/hooks/instanceEvents";

/**
 * Common event metadata present in all event types.
 */
interface EventMeta {
  index: number;
  offsetMilli: number;
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
  school: number;
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
  resourceType: string;
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
 * Aura event from the "aura" stream.
 * Tracks buff/debuff gains, fades, and removals.
 */
export interface AuraProcessorEvent extends EventMeta {
  type: "aura";
  target: string;  // The unit affected by the aura
  spellName: string;  // Name of the aura/buff/debuff
  amount: number;  // Stack count or duration
  application: AuraApplication;  // Gains, Fades, or Removed
}

/**
 * Discriminated union of all event types.
 * Use event.type to narrow to a specific type.
 */
export type ProcessorEvent = DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent | ExtraAttackProcessorEvent | SlainProcessorEvent | CastProcessorEvent | AuraProcessorEvent;

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
  processingTimeMs: number;
  error?: string;
}
