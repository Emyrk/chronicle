/**
 * All Activity Debug processor - stores raw events for debugging stream interleaving
 */

import type { DamageProcessorEvent, HealProcessorEvent, PanelProcessor, ProcessorContext, ResourceChangeProcessorEvent, CastProcessorEvent, CastAction, AuraProcessorEvent, AuraApplication } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";

/**
 * A raw event with metadata for debugging
 */
/**
 * Resource types from WoW combat log
 */
export type ResourceType = "Health" | "Mana" | "Rage" | "Happiness" | "Energy" | "Focus";

export interface RawDebugEvent {
  index: number;
  offsetMilli: number;
  encounterID: string;
  streamType: StreamType;
  caster: string;
  sourceName: string;
  target: string;
  targetName: string;
  amount: number;
  resourceType?: ResourceType; // For resource_change events
  extra?: string; // school/hitType info
  // Cast-specific fields
  castAction?: CastAction;
  spellId?: number;
  spellRank?: number | null;
  // Aura-specific fields
  auraApplication?: AuraApplication;
}

/**
 * Encounter metadata for display
 */
export interface EncounterMeta {
  encounterID: string;
  firstTimestamp: number; // ms since epoch
}

export interface AllActivityDebugState {
  /** Counts by entity */
  counts: Map<string, number>;
  /** Raw events captured per stream (to ensure fair representation) */
  rawEventsByStream: Record<StreamType, RawDebugEvent[]>;
  /** Count of events per stream type */
  streamCounts: Record<StreamType, number>;
  /** Encounter metadata: encounterID -> first timestamp */
  encounters: Map<string, EncounterMeta>;
  /** Total events processed (for pagination) */
  totalProcessed: number;
  /** Events skipped due to pagination offset */
  eventsSkipped: number;
  /** Events captured in current page */
  eventsCaptured: number;
}

// This processor handles damage, heal, resource_change, cast, and aura events
type AllActivityEvent = DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent | CastProcessorEvent | AuraProcessorEvent;

// Default page size if no pagination specified
const DEFAULT_PAGE_SIZE = 100;

export const allActivityProcessor: PanelProcessor<AllActivityDebugState, AllActivityEvent> = {
  id: "all_activity",
  streams: ["damage", "heal", "resource_change", "cast", "aura"],
  
  createState: () => ({
    counts: new Map<string, number>(),
    rawEventsByStream: {
      damage: [],
      heal: [],
      resource_change: [],
      extra_attack: [],
      slain: [],
      cast: [],
      aura: [],
    },
    streamCounts: {
      damage: 0,
      heal: 0,
      resource_change: 0,
      extra_attack: 0,
      slain: 0,
      cast: 0,
      aura: 0,
    },
    encounters: new Map<string, EncounterMeta>(),
    totalProcessed: 0,
    eventsSkipped: 0,
    eventsCaptured: 0,
  }),
  
  processEvent: (
    state: AllActivityDebugState,
    event: AllActivityEvent,
    encounterID: string,
    firstTimestamp: Date,
    streamType: StreamType,
    context: ProcessorContext
  ) => {
    if(!context.selectedEncounterIds.has(encounterID)) {
      return;
    }
    // Track encounter metadata
    if (!state.encounters.has(encounterID)) {
      state.encounters.set(encounterID, {
        encounterID,
        firstTimestamp: firstTimestamp.getTime(),
      });
    }
    
    // Filter by selected players if any are selected
    const { entitySelection } = context;
    // Aura events only have target, cast events have caster but may not have target
    const eventCaster = "caster" in event ? event.caster : "";
    const eventTarget = "target" in event ? event.target : "";
    if (entitySelection.playerIds.size > 0) {
      if(!(entitySelection.playerIds.has(eventCaster) || (eventTarget && entitySelection.playerIds.has(eventTarget)))) {
        return;
      }
    }
    
    // Count events per stream (always count for display in stream toggles)
    state.streamCounts[streamType]++;
    
    // Count events by caster (or target for aura events)
    const key = eventCaster || eventTarget || "Unknown";
    state.counts.set(key, (state.counts.get(key) || 0) + 1);
    
    // Check if this stream is enabled for pagination
    // If enabledStreams is set, only count/capture events from those streams
    const enabledStreams = context.pagination?.enabledStreams;
    if (enabledStreams && !enabledStreams.includes(streamType)) {
      // This stream is not enabled - still counted in streamCounts above,
      // but not included in pagination
      return;
    }
    
    // Increment total processed (only for enabled streams)
    state.totalProcessed++;
    
    // Get pagination settings
    const offset = context.pagination?.offset ?? 0;
    const limit = context.pagination?.limit ?? DEFAULT_PAGE_SIZE;
    
    // Skip events before our page offset
    if (state.totalProcessed <= offset) {
      state.eventsSkipped++;
      return;
    }
    
    // Stop capturing if we've reached the page limit
    if (state.eventsCaptured >= limit) {
      return;
    }
    
    // Capture this event
    state.eventsCaptured++;
    
    // Look up target name from players or units
    const targetName = eventTarget
      ? (context.players[eventTarget]?.name ?? 
         context.units?.[eventTarget]?.name ?? 
         eventTarget)
      : "";
    
    // Get sourceName - cast events use spell.name, aura events use spellName
    let sourceName = "";
    let amount = 0;
    if (streamType === "cast") {
      const castEvent = event as CastProcessorEvent;
      sourceName = castEvent.spell.name;
      amount = 0; // Casts don't have an amount
    } else if (streamType === "aura") {
      const auraEvent = event as AuraProcessorEvent;
      sourceName = auraEvent.spellName;
      amount = auraEvent.amount;
    } else {
      const regularEvent = event as DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent;
      sourceName = regularEvent.sourceName;
      amount = regularEvent.amount;
    }
    
    const rawEvent: RawDebugEvent = {
      index: event.index,
      offsetMilli: event.offsetMilli,
      encounterID,
      streamType,
      caster: eventCaster,
      sourceName,
      target: eventTarget,
      targetName,
      amount,
    };
    
    // Add stream-specific info based on streamType
    if (streamType === "resource_change") {
      const rcEvent = event as ResourceChangeProcessorEvent;
      rawEvent.resourceType = rcEvent.resourceType as ResourceType;
      rawEvent.extra = rcEvent.direction;
    } else if (streamType === "damage" || streamType === "heal") {
      const dhEvent = event as DamageProcessorEvent | HealProcessorEvent;
      rawEvent.extra = `school=${dhEvent.school} hit=${dhEvent.hitType}`;
    } else if (streamType === "cast") {
      const castEvent = event as CastProcessorEvent;
      rawEvent.castAction = castEvent.action;
      rawEvent.spellId = castEvent.spell.id;
      rawEvent.spellRank = castEvent.spell.rank;
      // Show cast action in extra field
      const actionNames = ["Unknown", "Casts", "Begins", "Channels", "Fails"];
      rawEvent.extra = actionNames[castEvent.action] || "Unknown";
    } else if (streamType === "aura") {
      const auraEvent = event as AuraProcessorEvent;
      rawEvent.auraApplication = auraEvent.application;
      // Show aura application in extra field
      const applicationNames = ["Unknown", "Gains", "Fades", "Removed"];
      rawEvent.extra = applicationNames[auraEvent.application] || "Unknown";
    }
    
    // Store in appropriate stream bucket
    state.rawEventsByStream[streamType].push(rawEvent);
  },
};
