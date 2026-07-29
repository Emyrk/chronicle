/**
 * All Activity Debug processor - stores raw events for debugging stream interleaving
 */

import type { DamageProcessorEvent, HealProcessorEvent, PanelProcessor, ProcessorContext, ResourceChangeProcessorEvent, CastProcessorEvent, CastAction, AuraProcessorEvent, AuraApplication, SlainProcessorEvent, SpellGoProcessorEvent, AuraCastProcessorEvent, ExtraAttackProcessorEvent, UnitClassificationProcessorEvent, CombatantInfoProcessorEvent, DispelProcessorEvent } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";
import { hitTypeNames } from "@/lib/hittype/hittype";

/**
 * A raw event with metadata for debugging
 */
/**
 * Resource types from WoW combat log
 */
export type ResourceType = "Health" | "Mana" | "Rage" | "Happiness" | "Energy" | "Focus";

/**
 * Activity event types from debug parser annotations.
 * These indicate when units become "active" during encounters.
 */
export type ActivityEventTypeValue = "start" | "end" | "slain" | "bump";

export interface ActivityEventInfo {
  type: ActivityEventTypeValue;
  guid: string;
  name: string;
}

export interface DamageTrailerInfo {
  amount: number;
  hitType: number;
  labels: string[];
}

export interface RawDebugEvent {
  index: number;
  offsetMilli: number;
  dateMilli: number;  // Absolute timestamp for display toggle
  encounterID: string;
  streamType: StreamType;
  caster: string;
  casterName: string;
  sourceName: string;
  target: string | null;
  targetName: string;
  amount: number;
  resourceType?: ResourceType; // For resource_change events
  extra?: string; // school/hitType info
  // Damage mitigation and outcome trailers, such as absorbed, blocked, and resisted.
  damageTrailers?: DamageTrailerInfo[];
  // Cast-specific fields
  castAction?: CastAction;
  spellId?: number;
  spellRank?: number | null;
  // Aura-specific fields
  auraApplication?: AuraApplication;
  // Classification-specific fields
  affiliation?: number; // 0=Unknown, 1=Friendly, 2=Hostile, 3=Neutral
  // Debug annotations (when WithDebug is enabled during reparse)
  // Can have multiple activity entries per event
  activityEvents?: ActivityEventInfo[];
  // Combatant info gear (for hover tooltip)
  gear?: { itemId: number; enchantId: number | null; temporaryEnchantId: number | null }[];
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

// This processor handles damage, heal, resource_change, cast, aura, slain, spell_go, and aura_cast events
type AllActivityEvent = DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent | CastProcessorEvent | AuraProcessorEvent | SlainProcessorEvent | SpellGoProcessorEvent | AuraCastProcessorEvent | ExtraAttackProcessorEvent | UnitClassificationProcessorEvent | CombatantInfoProcessorEvent | DispelProcessorEvent;

// Default page size if no pagination specified
const DEFAULT_PAGE_SIZE = 100;

export const allActivityProcessor: PanelProcessor<AllActivityDebugState, AllActivityEvent> = {
  id: "all_activity",
  streams: ["damage", "heal", "resource_change", "aura", "slain", "spell_go", "spell_start", "aura_cast", "extra_attack", "unit_classification", "combatant_info", "dispel"],
  
  createState: () => ({
    counts: new Map<string, number>(),
    rawEventsByStream: {
      damage: [],
      heal: [],
      resource_change: [],
      extra_attack: [],
      slain: [],
      ressurection: [],
      cast: [],
      aura: [],
      spell_go: [],
      aura_cast: [], spell_start: [], spell_fail: [], unit_classification: [], combatant_info: [], dispel: [], interrupt: [], absorbed: [], companion_stats: [],
    },
    streamCounts: {
      damage: 0,
      heal: 0,
      resource_change: 0,
      extra_attack: 0,
      slain: 0,
      ressurection: 0,
      cast: 0,
      aura: 0,
      spell_go: 0,
      aura_cast: 0, spell_start: 0, spell_fail: 0, unit_classification: 0, combatant_info: 0, dispel: 0, interrupt: 0, absorbed: 0, companion_stats: 0,
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
    // Aura events only have target, cast events have caster but may not have target.
    // Combatant info events use "guid" instead of caster/target.
    const eventCaster = "caster" in event ? event.caster : ("guid" in event ? event.guid : "");
    const eventTarget = "target" in event ? event.target : ("guid" in event ? event.guid : "");
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
    
    // Filter by ability name if specified
    const abilityFilter = context.pagination?.abilityFilter?.toLowerCase().trim();
    if (abilityFilter) {
      // Get the ability/source name based on event type
      let abilityName = "";
      if (streamType === "cast") {
        const castEvent = event as CastProcessorEvent;
        abilityName = castEvent.spell.name;
      } else if (streamType === "aura") {
        const auraEvent = event as AuraProcessorEvent;
        abilityName = auraEvent.spellName;
      } else if (streamType === "slain") {
        const slainEvent = event as SlainProcessorEvent;
        abilityName = slainEvent.attribution?.sourceName ?? "";
      } else if (streamType === "spell_go") {
        const spellGoEvent = event as SpellGoProcessorEvent;
        abilityName = spellGoEvent.spell.name;
      } else if (streamType === "aura_cast") {
        const auraCastEvent = event as AuraCastProcessorEvent;
        abilityName = auraCastEvent.spell.name;
      } else if (streamType === "extra_attack") {
        const extraEvent = event as ExtraAttackProcessorEvent;
        abilityName = extraEvent.sourceName;
      } else if (streamType === "unit_classification") {
        abilityName = "Classification";
      } else if (streamType === "combatant_info") {
        abilityName = "Combatant Info";
      } else if (streamType === "dispel") {
        abilityName = "Dispel";
      } else {
        const regularEvent = event as DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent;
        abilityName = regularEvent.sourceName;
      }
      
      // Check if the ability name contains the filter string (case-insensitive)
      if (!abilityName.toLowerCase().includes(abilityFilter)) {
        return;
      }
    }
    
    // Filter by source/caster name or GUID if specified
    const sourceFilter = context.pagination?.sourceFilter?.toLowerCase().trim();
    if (sourceFilter) {
      // Look up caster name from players or units
      const casterName = eventCaster
        ? (context.players[eventCaster]?.name ?? 
           context.units?.[eventCaster]?.name ?? 
           eventCaster)
        : "";
      
      // Check if the caster name OR GUID contains the filter string (case-insensitive)
      const casterGuid = eventCaster?.toLowerCase() ?? "";
      if (!casterName.toLowerCase().includes(sourceFilter) && !casterGuid.includes(sourceFilter)) {
        return;
      }
    }
    
    // Filter by target name or GUID if specified
    const targetFilter = context.pagination?.targetFilter?.toLowerCase().trim();
    if (targetFilter) {
      // Look up target name from players or units
      const targetName = eventTarget
        ? (context.players[eventTarget]?.name ?? 
           context.units?.[eventTarget]?.name ?? 
           eventTarget)
        : "";
      
      // Check if the target name OR GUID contains the filter string (case-insensitive)
      const targetGuid = eventTarget?.toLowerCase() ?? "";
      if (!targetName.toLowerCase().includes(targetFilter) && !targetGuid.includes(targetFilter)) {
        return;
      }
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
    
    // Look up caster name from players or units
    const casterName = eventCaster
      ? (context.players[eventCaster]?.name ?? 
         context.units?.[eventCaster]?.name ?? 
         eventCaster)
      : "";
    
    // Get sourceName - cast/spell_go events use spell.name, aura events use spellName, slain events use attribution
    let sourceName = "";
    let amount = 0;
    if (streamType === "cast") {
      const castEvent = event as CastProcessorEvent;
      sourceName = castEvent.spell.name;
      amount = 0; // Casts don't have an amount
    } else if (streamType === "spell_go") {
      const spellGoEvent = event as SpellGoProcessorEvent;
      sourceName = spellGoEvent.spell.name;
      amount = spellGoEvent.numHits + spellGoEvent.numMisses; // Total targets affected
    } else if (streamType === "aura") {
      const auraEvent = event as AuraProcessorEvent;
      sourceName = auraEvent.spellName;
      amount = auraEvent.amount;
    } else if (streamType === "slain") {
      const slainEvent = event as SlainProcessorEvent;
      sourceName = slainEvent.attribution?.sourceName ?? "Slain";
      amount = slainEvent.attribution?.amount ?? 0;
    } else if (streamType === "aura_cast") {
      const auraCastEvent = event as AuraCastProcessorEvent;
      sourceName = auraCastEvent.spell.name;
      amount = auraCastEvent.durationMS; // Show duration as the "amount"
    } else if (streamType === "extra_attack") {
      const extraEvent = event as ExtraAttackProcessorEvent;
      sourceName = extraEvent.sourceName;
      amount = extraEvent.amount;
    } else if (streamType === "unit_classification") {
      sourceName = "Classification";
      amount = 0;
    } else if (streamType === "combatant_info") {
      const ciEvent = event as CombatantInfoProcessorEvent;
      sourceName = "Combatant Info";
      amount = ciEvent.gearCount;
    } else if (streamType === "dispel") {
      sourceName = "Dispel";
      amount = 0;
    } else {
      const regularEvent = event as DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent;
      sourceName = regularEvent.sourceName;
      amount = regularEvent.amount;
    }
    
    // Extract all activity events if present (from debug reparse)
    // Activity tracks when a GUID becomes active/inactive in encounter period detection
    let activityEvents: ActivityEventInfo[] | undefined = undefined;
    if (event.activityCount > 0) {
      activityEvents = [];
      for (let i = 0; i < event.activityCount; i++) {
        const entry = event.activity[i];
        // Look up entity name from context
        const entityName = context.players[entry.guid]?.name 
          ?? context.units?.[entry.guid]?.name 
          ?? entry.guid;
        activityEvents.push({
          type: entry.eventType as ActivityEventTypeValue,
          guid: entry.guid,
          name: entityName,
        });
      }
    }
    
    const rawEvent: RawDebugEvent = {
      index: event.index,
      offsetMilli: event.offsetMilli,
      dateMilli: firstTimestamp.getTime() + event.offsetMilli,
      encounterID,
      streamType,
      caster: eventCaster,
      casterName,
      sourceName,
      target: eventTarget,
      targetName,
      amount,
      activityEvents,
    };
    
    // Add stream-specific info based on streamType
    if (streamType === "resource_change") {
      const rcEvent = event as ResourceChangeProcessorEvent;
      rawEvent.resourceType = rcEvent.resourceType as ResourceType;
      rawEvent.extra = rcEvent.direction;
    } else if (streamType === "damage") {
      const damageEvent = event as DamageProcessorEvent;
      rawEvent.extra = `school=${damageEvent.school} hit=${damageEvent.hitType}`;
      if (damageEvent.tailerCount > 0) {
        rawEvent.damageTrailers = damageEvent.tailers
          .slice(0, damageEvent.tailerCount)
          .map((tailer) => ({
            amount: tailer.amount,
            hitType: tailer.hitType,
            labels: hitTypeNames(tailer.hitType),
          }));
      }
    } else if (streamType === "heal") {
      const healEvent = event as HealProcessorEvent;
      rawEvent.extra = `school=${healEvent.school} hit=${healEvent.hitType}`;
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
      // Show aura state in extra field (state is the preferred field)
      const stateNames = ["Unknown", "Added", "Removed", "Modified"];
      const stateName = stateNames[auraEvent.state] || "Unknown";
      rawEvent.extra = `${stateName} (stacks=${auraEvent.amount})`;
    } else if (streamType === "slain") {
      const slainEvent = event as SlainProcessorEvent;
      // Show death info in extra field
      if (slainEvent.attribution) {
        rawEvent.extra = `killed by ${slainEvent.attribution.sourceName} (${slainEvent.attribution.amount})`;
      } else {
        rawEvent.extra = "died";
      }
    } else if (streamType === "spell_go") {
      const spellGoEvent = event as SpellGoProcessorEvent;
      rawEvent.spellId = spellGoEvent.spell.id;
      // Show hit/miss info in extra field
      rawEvent.extra = `hits=${spellGoEvent.numHits} misses=${spellGoEvent.numMisses}`;
    } else if (streamType === "aura_cast") {
      const auraCastEvent = event as AuraCastProcessorEvent;
      rawEvent.spellId = auraCastEvent.spell.id;
      // Show duration and tick amplitude in extra field
      const durationSec = (auraCastEvent.durationMS / 1000).toFixed(1);
      const ampSec = auraCastEvent.amplitude > 0 ? (auraCastEvent.amplitude / 1000).toFixed(1) : null;
      rawEvent.extra = ampSec 
        ? `dur=${durationSec}s tick=${ampSec}s` 
        : `dur=${durationSec}s`;
    } else if (streamType === "extra_attack") {
      const extraEvent = event as ExtraAttackProcessorEvent;
      rawEvent.extra = `extra attacks=${extraEvent.amount}`;
    } else if (streamType === "dispel") {
      const dispelEvent = event as DispelProcessorEvent;
      const dispelTypeNames = ["None", "Magic", "Curse", "Disease", "Poison", "Stealth", "Invisibility"];
      rawEvent.extra = `type=${dispelTypeNames[dispelEvent.dispelType] || "Unknown"}`;
      if (dispelEvent.spellId) rawEvent.spellId = dispelEvent.spellId;
    } else if (streamType === "unit_classification") {
      const ucEvent = event as UnitClassificationProcessorEvent;
      rawEvent.affiliation = ucEvent.affiliation;
      // Show controller as the "caster" (the unit doing the possessing)
      if (ucEvent.controller) {
        rawEvent.caster = ucEvent.controller;
        rawEvent.casterName = context.players[ucEvent.controller]?.name
          ?? context.units?.[ucEvent.controller]?.name
          ?? ucEvent.controller;
      }
      const affiliationNames = ["Unknown", "Friendly", "Hostile", "Neutral"];
      const unitTypeNames = ["Unknown", "Player", "Creature", "Object", "Vehicle"];
      const parts = [`${affiliationNames[ucEvent.affiliation] || "Unknown"} ${unitTypeNames[ucEvent.unitType] || "Unknown"}`];
      if (ucEvent.owner) parts.push(`owner=${ucEvent.owner.slice(-6)}`);
      if (ucEvent.spellId) parts.push(`spell=${ucEvent.spellId}`);
      rawEvent.extra = parts.join(" ");
    } else if (streamType === "combatant_info") {
      const ciEvent = event as CombatantInfoProcessorEvent;
      rawEvent.caster = ciEvent.guid;
      rawEvent.casterName = ciEvent.name;
      rawEvent.target = ciEvent.guid;
      rawEvent.targetName = ciEvent.name;
      const parts = [`${ciEvent.heroClass} ${ciEvent.race}`];
      if (ciEvent.talents) parts.push(`talents=${ciEvent.talents.summary.join("/")}`);
      parts.push(`gear=${ciEvent.gearCount} slots`);
      if (ciEvent.guildName) parts.push(`guild=${ciEvent.guildName}`);
      rawEvent.extra = parts.join(" ");
      rawEvent.gear = ciEvent.gear.slice(0, ciEvent.gearCount).map(g => ({
        itemId: g.itemId,
        enchantId: g.enchantId,
        temporaryEnchantId: g.temporaryEnchantId,
      }));
    }
    
    // Store in appropriate stream bucket
    state.rawEventsByStream[streamType].push(rawEvent);
  },
};
