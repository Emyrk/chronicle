/**
 * Interrupt processor - aggregates interrupt events by caster (pure TS, worker-safe)
 *
 * Tracks who performed interrupts and which spells were interrupted.
 */

import type { InterruptProcessorEvent, PanelProcessor, ProcessorContext } from "../processorTypes";
import { resolveEntity, extractGroupingFromPanelOption, extractPetModeFromPanelOption } from "../processors/resolveEntity";

// ============================================================================
// Data types
// ============================================================================

export interface InterruptSpellData {
  name: string;
  extraSpellId: number;
  count: number;
}

export interface InterruptEntityData {
  entityID: string;
  entityName: string;
  className: string;
  totalInterrupts: number;
  bySpell: Map<string, InterruptSpellData>;
}

function createEntityData(id: string, name: string, cls: string): InterruptEntityData {
  return { entityID: id, entityName: name, className: cls, totalInterrupts: 0, bySpell: new Map() };
}

/**
 * A single interrupt log entry for chronological display.
 */
export interface InterruptLogEvent {
  dateMilli: number;
  offsetMilli: number;
  encounterID: string;
  casterID: string;
  casterName: string;
  casterClass: string;
  targetID: string;
  targetName: string;
  targetClass: string;
  spellName: string;
  extraSpellId: number;
  extraSchool: number;
}

export interface InterruptResult {
  /** Keyed by encounterID → entityID → data */
  byEntity: Map<string, Map<string, InterruptEntityData>>;
  /** Breakout for focus view (selected encounters only): entityID → spellName → count */
  byAbility: Map<string, Map<string, number>>;
  /** Chronological list of all interrupt events */
  InterruptEvents: InterruptLogEvent[];
}

// ============================================================================
// Processor
// ============================================================================

export const interruptProcessor: PanelProcessor<InterruptResult, InterruptProcessorEvent> = {
  id: "interrupts",
  streams: ["interrupt"],

  createState: (): InterruptResult => ({
    byEntity: new Map(),
    byAbility: new Map(),
    InterruptEvents: [],
  }),

  processEvent: (
    state: InterruptResult,
    event: InterruptProcessorEvent,
    encounterID: string,
    _firstTimestamp: Date,
    _streamType: string,
    context: ProcessorContext,
  ) => {
    if (!event.caster || !event.target) return;

    const spellName = event.spellName || "Unknown";

    const grouping = extractGroupingFromPanelOption(context.panelOption);
    const pets = extractPetModeFromPanelOption(context.panelOption);

    // Resolve caster (who interrupted)
    const casterEntity = resolveEntity(event.caster, context, grouping, pets);
    const casterName = casterEntity.name;
    const casterClass = casterEntity.class;

    // Resolve target (who was interrupted)
    const targetEntity = resolveEntity(event.target, context, grouping, pets);
    const targetName = targetEntity.name;
    const targetClass = targetEntity.class;

    // Accumulate by caster
    let entityMap = state.byEntity.get(encounterID);
    if (!entityMap) {
      entityMap = new Map();
      state.byEntity.set(encounterID, entityMap);
    }
    let data = entityMap.get(casterEntity.id);
    if (!data) {
      data = createEntityData(casterEntity.id, casterName, casterClass);
      entityMap.set(casterEntity.id, data);
    }
    data.totalInterrupts++;

    const spellKey = event.extraSpellId > 0 ? String(event.extraSpellId) : spellName;
    const spell = data.bySpell.get(spellKey);
    if (spell) {
      spell.count++;
    } else {
      data.bySpell.set(spellKey, { name: spellName, extraSpellId: event.extraSpellId, count: 1 });
    }

    // Breakout for selected encounters
    if (context.selectedEncounterIds.has(encounterID)) {
      let abilityMap = state.byAbility.get(casterEntity.id);
      if (!abilityMap) {
        abilityMap = new Map();
        state.byAbility.set(casterEntity.id, abilityMap);
      }
      abilityMap.set(spellName, (abilityMap.get(spellName) || 0) + 1);
    }

    // Chronological log entry
    state.InterruptEvents.push({
      dateMilli: _firstTimestamp.getTime() + event.offsetMilli,
      offsetMilli: event.offsetMilli,
      encounterID,
      casterID: casterEntity.id,
      casterName,
      casterClass,
      targetID: targetEntity.id,
      targetName,
      targetClass,
      spellName,
      extraSpellId: event.extraSpellId,
      extraSchool: event.extraSchools[0],
    });
  },
};
