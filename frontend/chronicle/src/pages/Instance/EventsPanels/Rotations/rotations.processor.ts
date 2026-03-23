/**
 * Rotations processor - tracks spell cast timelines per entity (pure TS, worker-safe).
 *
 * Uses spell_go (completed casts) as the primary stream, with spell_start for
 * cast-bar duration and spell_fail for failed casts.
 *
 * Default view: all casts on one row per entity.
 * Focus view (single entity selected): one row per spell ability.
 */

import type {
  PanelProcessor,
  ProcessorContext,
  AuraCastProcessorEvent,
  AuraProcessorEvent,
  DamageProcessorEvent,
  SpellGoProcessorEvent,
  SpellStartProcessorEvent,
  SpellFailProcessorEvent,
} from "../processorTypes";
import { AuraState } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";
import { createGuidCache, type GuidCache } from "../processors/guidCache";

// ── Result types ──────────────────────────────────────────────

export interface CastEntry {
  offsetMilli: number;
  spellId: number;
  spellName: string;
  target: string;
  eventType: "spell_go" | "spell_start" | "spell_fail" | "auto_attack";
  /** Cast time in ms (spell_start only) */
  castTimeMilli?: number;
  /** Channel time in ms (spell_start only) */
  channelTimeMilli?: number;
  /** True when this auto attack is an off-hand swing */
  isOffHand?: boolean;
}

export interface AuraSegment {
  spellId: number;
  spellName: string;
  startMilli: number;
  /** null = still active at encounter end (capped at durationMs in render) */
  endMilli: number | null;
}

export interface RotationsResult {
  /** sourceGuid → CastEntry[] (time-ordered within each entity) */
  castsByEntity: Map<string, CastEntry[]>;
  /** spellId → spell name */
  spellNames: Map<number, string>;
  /** targetGuid → finalized aura segments */
  aurasByEntity: Map<string, AuraSegment[]>;
  /** GUID resolution cache */
  GuidCache: GuidCache;
  /** Transient: targetGuid → spellId → active aura start info (not serialized) */
  _activeAuras: Map<string, Map<number, { startMilli: number; spellName: string; estimatedEndMilli: number | null; segmentIndex: number }>>;
}

// ── Processor ─────────────────────────────────────────────────

/** Sentinel spell ID for auto attacks (swing damage with no spellId). */
export const AUTO_ATTACK_SPELL_ID = -1;

function getOrCreateSegs(state: RotationsResult, targetGuid: string): AuraSegment[] {
  let segs = state.aurasByEntity.get(targetGuid);
  if (!segs) {
    segs = [];
    state.aurasByEntity.set(targetGuid, segs);
  }
  return segs;
}

export type RotationsEvent = SpellGoProcessorEvent | SpellStartProcessorEvent | SpellFailProcessorEvent | DamageProcessorEvent | AuraCastProcessorEvent | AuraProcessorEvent;

export const rotationsProcessor: PanelProcessor<RotationsResult, RotationsEvent> = {
  id: "rotations",
  streams: ["spell_go", "spell_start", "spell_fail", "damage", "aura_cast", "aura"] as StreamType[],

  createState: (): RotationsResult => ({
    castsByEntity: new Map(),
    spellNames: new Map(),
    aurasByEntity: new Map(),
    GuidCache: createGuidCache(),
    _activeAuras: new Map(),
  }),

  processEvent(
    state: RotationsResult,
    event: RotationsEvent,
    encounterID: string,
    _firstTimestamp: Date,
    _streamType: StreamType,
    context: ProcessorContext,
  ): void {
    if (!encounterID) return;
    if (context.selectedEncounterIds.size > 1) return;
    if (!context.selectedEncounterIds.has(encounterID)) return;

    // Handle aura_cast events — starts an aura segment with known duration
    // Has caster, target, spell.id, and durationMS
    if (event.type === "aura_cast") {
      // For self-buffs, target may be null — use caster as target
      const targetGuid = event.target || event.caster;
      if (!targetGuid) return;

      // Filter by entity selection on target
      const { playerIds, enemyIds } = context.entitySelection;
      if (playerIds.size > 0 || enemyIds.size > 0) {
        if (!playerIds.has(targetGuid) && !enemyIds.has(targetGuid)) return;
      }

      const spellId = event.spell.id;
      const spellName = event.spell.name;
      if (!spellId) return;

      // Track spell name
      if (!state.spellNames.has(spellId)) {
        state.spellNames.set(spellId, spellName);
      }

      // Get or create active aura map for this target
      let targetAuras = state._activeAuras.get(targetGuid);
      if (!targetAuras) {
        targetAuras = new Map();
        state._activeAuras.set(targetGuid, targetAuras);
      }

      // If already active, finalize the old segment at this time (refresh/overwrite)
      const existing = targetAuras.get(spellId);
      if (existing && existing.segmentIndex != null) {
        const segs = getOrCreateSegs(state, targetGuid);
        // Update the existing segment's endMilli to the refresh time
        segs[existing.segmentIndex].endMilli = event.offsetMilli;
      }

      // Push a new segment immediately with estimated end
      const segs = getOrCreateSegs(state, targetGuid);
      const estimatedEnd = event.durationMS > 0 ? event.offsetMilli + event.durationMS : null;
      const segIndex = segs.length;
      segs.push({
        spellId,
        spellName,
        startMilli: event.offsetMilli,
        endMilli: estimatedEnd,
      });

      // Track active aura so Removed events can update endMilli
      targetAuras.set(spellId, {
        startMilli: event.offsetMilli,
        spellName,
        estimatedEndMilli: estimatedEnd,
        segmentIndex: segIndex,
      });
      return;
    }

    // Handle aura state changes — used to detect early removal (dispel, death, overwrite)
    if (event.type === "aura") {
      if (event.state !== AuraState.Removed && event.amount !== 0) return;

      const targetGuid = event.target;
      if (!targetGuid) return;

      const spellId = event.spellId;
      if (spellId == null) return;

      // Check if we have an active segment for this target+spell
      const targetAuras = state._activeAuras.get(targetGuid);
      if (!targetAuras) return;

      const active = targetAuras.get(spellId);
      if (!active || active.segmentIndex == null) return;

      // Update the segment's endMilli to actual removal time
      const segs = state.aurasByEntity.get(targetGuid);
      if (segs && segs[active.segmentIndex]) {
        segs[active.segmentIndex].endMilli = event.offsetMilli;
      }
      targetAuras.delete(spellId);
      return;
    }

    // All other event types require caster
    const casterGuid = (event as { caster?: string }).caster;
    if (!casterGuid) return;

    // Entity selection filtering
    const { playerIds, enemyIds } = context.entitySelection;
    if (playerIds.size > 0 || enemyIds.size > 0) {
      if (!playerIds.has(casterGuid) && !enemyIds.has(casterGuid)) return;
    }

    // Handle auto attacks from the damage stream
    if (event.type === "damage") {
      // Spell ID 6603 is "Auto Attack" (swing damage)
      if (event.spellId !== 6603) return;

      if (!state.spellNames.has(AUTO_ATTACK_SPELL_ID)) {
        state.spellNames.set(AUTO_ATTACK_SPELL_ID, "Auto Attack");
      }

      const isOffHand = (event.hitType & 0x1) !== 0;
      const entry: CastEntry = {
        offsetMilli: event.offsetMilli,
        spellId: AUTO_ATTACK_SPELL_ID,
        spellName: isOffHand ? "Auto Attack (OH)" : "Auto Attack",
        target: event.target || "",
        eventType: "auto_attack",
        isOffHand,
      };

      let list = state.castsByEntity.get(casterGuid);
      if (!list) {
        list = [];
        state.castsByEntity.set(casterGuid, list);
      }
      list.push(entry);
      return;
    }

    const spellId = event.spell.id;
    const spellName = event.spell.name;

    // Track spell name
    if (!state.spellNames.has(spellId)) {
      state.spellNames.set(spellId, spellName);
    }
    // Build cast entry
    const entry: CastEntry = {
      offsetMilli: event.offsetMilli,
      spellId,
      spellName,
      target: "",
      eventType: event.type,
    };

    if (event.type === "spell_go") {
      entry.target = event.target || "";
    } else if (event.type === "spell_start") {
      entry.target = event.target || "";
      entry.castTimeMilli = event.castTimeMilli;
      entry.channelTimeMilli = event.channelTimeMilli;
    }

    // Append to entity's list
    let list = state.castsByEntity.get(casterGuid);
    if (!list) {
      list = [];
      state.castsByEntity.set(casterGuid, list);
    }
    list.push(entry);
  },
};
