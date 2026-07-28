/**
 * Deaths processor - aggregates player and enemy deaths from slain events (pure TS, worker-safe)
 */

import type { SlainProcessorEvent, DamageProcessorEvent, HealProcessorEvent, ResourceChangeProcessorEvent, AbsorbedProcessorEvent, PanelProcessor, ProcessorContext, ProcessorEvent } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";
import { createGuidCache, getCachedGuid, isPlayerGuidFast, type GuidCache } from "../processors/guidCache";
import { hasHitType, HitTypePartialResist, HitTypeFullResist, HitTypePartialAbsorb, HitTypeFullAbsorb, HitTypePartialBlock, HitTypeFullBlock } from "@/lib/hittype/hittype";

/**
 * Attribution info for a death - the damage that caused the kill
 */
export interface DeathAttribution {
  sourceName: string;      // Spell/ability name
  amount: number;          // Damage amount
  school: number;          // Damage school (physical, fire, etc.)
  hitType: number;         // Hit type flags (crit, etc.)
}

/**
 * A single entry in the death recap (last 10s of incoming activity before death)
 */
export interface DeathRecapEntry {
  offsetMilli: number;       // encounter-relative timestamp
  eventIndex: number;        // stable combat-log ordering for equal timestamps
  sourceName: string;        // ability name
  casterName: string;        // who did it
  casterID: string;
  targetName: string;        // who received it
  targetID: string;
  targetClass: string | null; // WoW class name if target is a player, null if hostile/unknown
  amount: number;
  school: number;
  hitType: number;
  spellId: number | null;    // spell ID for icon/tooltip lookup
  type: "damage" | "heal" | "absorbed" | "resource_change";
  casterClass: string | null; // WoW class name if caster is a player, null if hostile/unknown
  overheal?: number;
  overkill?: number;
  absorbSpellName?: string;  // for absorbed events
  absorbSpellId?: number | null; // spell ID of the absorb shield
  // Mitigation amounts extracted from tailers
  resisted?: number;
  blocked?: number;
  absorbed?: number;          // damage absorbed (from tailer, not the "absorbed" stream)
}

/**
 * Data for a single death event
 */
export interface DeathEvent {
  dateMilli: number;  // Absolute timestamp 
  offsetMilli: number;     // Time offset from encounter start
  playerID: string;        // GUID of the player who died
  playerName: string;
  className: string;
  killerID: string;        // GUID of the killer (may be empty)
  killerName: string;      // Name of the killer
  encounterID: string;
  attribution: DeathAttribution | null;  // The damage that killed the player
  recap: DeathRecapEntry[];  // Incoming activity retained for the configurable pre-death window
}

/**
 * Killer data for breakout display
 */
export interface KillerData {
  killerID: string;
  killerName: string;
  count: number;
}

/**
 * Player death summary data
 */
export interface PlayerDeathsData {
  playerID: string;
  playerName: string;
  className: string;
  deathCount: number;
  // Track which enemies killed this player
  killers: Map<string, KillerData>;
}

// UnitDeaths is unit guid -> PlayerDeathsData
export type UnitDeaths = Map<string, PlayerDeathsData>;

export type DeathsResult = {
  // Per-encounter death counts by player
  EncounterDeaths: Map<string, UnitDeaths>;
  // Per-encounter death counts by enemy (non-player units)
  EncounterEnemyDeaths: Map<string, UnitDeaths>;
  // Breakout by killer: playerID -> killerID -> count
  ByKiller: Map<string, Map<string, number>>;
  // Breakout by killer for enemies: enemyID -> killerID -> count
  EnemyByKiller: Map<string, Map<string, number>>;
  // Chronological list of all death events for all encounters
  DeathEvents: DeathEvent[];
  // Chronological list of enemy death events
  EnemyDeathEvents: DeathEvent[];
  // GUID cache for performance (avoids repeated parsing)
  GuidCache: GuidCache;
  // Transient: buffer of incoming events per target per encounter for death recap
  _incomingBuffer: Map<string, Map<string, DeathRecapEntry[]>>;
}

/** Retain enough history for the configurable recap window (up to 120 seconds). */
const RECAP_WINDOW_MS = 120_000;

/** Helper to resolve a caster's class (returns class name for players, null for hostiles) */
function resolveCasterClass(guid: string, context: ProcessorContext, guidCache: GuidCache): string | null {
  if (!guid) return null;
  if (isPlayerGuidFast(guid) || getCachedGuid(guidCache, guid).isPlayer()) {
    return context.players[guid]?.class || null;
  }
  return null;
}

/** Helper to resolve a unit name from context */
function resolveUnitName(guid: string, context: ProcessorContext, guidCache: GuidCache): string {
  if (!guid) return "Unknown";
  if (isPlayerGuidFast(guid) || getCachedGuid(guidCache, guid).isPlayer()) {
    return context.players[guid]?.name || guid;
  }
  return context.units?.[guid]?.name || guid;
}

/** Push an entry into a buffer map (encounterID → guid → entries[]) */
function pushToBuffer(bufferMap: Map<string, Map<string, DeathRecapEntry[]>>, encounterID: string, guid: string, entry: DeathRecapEntry) {
  let encMap = bufferMap.get(encounterID);
  if (!encMap) {
    encMap = new Map();
    bufferMap.set(encounterID, encMap);
  }
  let arr = encMap.get(guid);
  if (!arr) {
    arr = [];
    encMap.set(guid, arr);
  }
  arr.push(entry);
}

/** Extract recap entries from a buffer within RECAP_WINDOW_MS before death */
function buildRecapFromBuffer(bufferMap: Map<string, Map<string, DeathRecapEntry[]>>, encounterID: string, guid: string, deathOffsetMilli: number): DeathRecapEntry[] {
  const encMap = bufferMap.get(encounterID);
  if (!encMap) return [];
  const entries = encMap.get(guid);
  if (!entries) return [];
  const cutoff = deathOffsetMilli - RECAP_WINDOW_MS;
  const recap: DeathRecapEntry[] = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.offsetMilli < cutoff) break;
    if (e.offsetMilli <= deathOffsetMilli) recap.push(e);
  }
  recap.reverse(); // chronological order
  return recap;
}

/**
 * Create a deaths processor.
 */
export function createDeathsProcessor(): PanelProcessor<DeathsResult, ProcessorEvent> {
  return {
    id: "deaths",
    streams: ["slain", "damage", "heal", "resource_change", "absorbed"],

    createState: () => ({
      EncounterDeaths: new Map<string, UnitDeaths>(),
      EncounterEnemyDeaths: new Map<string, UnitDeaths>(),
      ByKiller: new Map<string, Map<string, number>>(),
      EnemyByKiller: new Map<string, Map<string, number>>(),
      DeathEvents: [],
      EnemyDeathEvents: [],
      GuidCache: createGuidCache(),
      _incomingBuffer: new Map(),
    }),

    processEvent: (
      state: DeathsResult,
      event: ProcessorEvent,
      encounterID: string,
      firstTimestamp: Date,
      streamType: StreamType,
      context: ProcessorContext
    ) => {
      const guidCache = state.GuidCache;

      // Buffer damage events targeting any unit
      if (streamType === "damage") {
        const dmg = event as DamageProcessorEvent;
        if (!dmg.target) return;

        // Extract mitigation amounts from tailers
        let resisted = 0;
        let blocked = 0;
        let absorbed = 0;
        for (let i = 0; i < dmg.tailerCount; i++) {
          const t = dmg.tailers[i];
          if (!t) continue;
          if (hasHitType(t.hitType, HitTypePartialResist) || hasHitType(t.hitType, HitTypeFullResist)) {
            resisted += t.amount;
          }
          if (hasHitType(t.hitType, HitTypePartialBlock) || hasHitType(t.hitType, HitTypeFullBlock)) {
            blocked += t.amount;
          }
          if (hasHitType(t.hitType, HitTypePartialAbsorb) || hasHitType(t.hitType, HitTypeFullAbsorb)) {
            absorbed += t.amount;
          }
        }

        // Skip 0-damage events with no mitigation
        if (dmg.amount === 0 && resisted === 0 && blocked === 0 && absorbed === 0) return;

        pushToBuffer(state._incomingBuffer, encounterID, dmg.target, {
          offsetMilli: dmg.offsetMilli,
          eventIndex: dmg.index,
          sourceName: dmg.sourceName,
          casterName: resolveUnitName(dmg.caster, context, guidCache),
          casterID: dmg.caster,
          targetName: resolveUnitName(dmg.target, context, guidCache),
          targetID: dmg.target,
          targetClass: resolveCasterClass(dmg.target, context, guidCache),
          amount: dmg.amount,
          school: dmg.school,
          hitType: dmg.hitType,
          spellId: dmg.spellId,
          type: "damage",
          casterClass: resolveCasterClass(dmg.caster, context, guidCache),
          overkill: dmg.overkill || undefined,
          resisted: resisted || undefined,
          blocked: blocked || undefined,
          absorbed: absorbed || undefined,
        });
        return;
      }

      // Buffer heal events
      if (streamType === "heal") {
        const heal = event as HealProcessorEvent;
        if (!heal.target) return;
        pushToBuffer(state._incomingBuffer, encounterID, heal.target, {
          offsetMilli: heal.offsetMilli,
          eventIndex: heal.index,
          sourceName: heal.sourceName,
          casterName: resolveUnitName(heal.caster, context, guidCache),
          casterID: heal.caster,
          targetName: resolveUnitName(heal.target, context, guidCache),
          targetID: heal.target,
          targetClass: resolveCasterClass(heal.target, context, guidCache),
          amount: heal.amount,
          school: heal.school,
          hitType: heal.hitType,
          spellId: heal.spellId,
          type: "heal",
          casterClass: resolveCasterClass(heal.caster, context, guidCache),
          overheal: heal.overheal || undefined,
        });
        return;
      }

      // Buffer absorb events
      if (streamType === "absorbed") {
        const abs = event as AbsorbedProcessorEvent;
        if (!abs.target) return;
        pushToBuffer(state._incomingBuffer, encounterID, abs.target, {
          offsetMilli: abs.offsetMilli,
          eventIndex: abs.index,
          sourceName: abs.damageSpellName || "Melee",
          casterName: resolveUnitName(abs.caster, context, guidCache),
          casterID: abs.caster,
          targetName: resolveUnitName(abs.target, context, guidCache),
          targetID: abs.target,
          targetClass: resolveCasterClass(abs.target, context, guidCache),
          amount: abs.amount,
          school: abs.absorbSchool,
          hitType: 0,
          spellId: abs.damageSpellId,
          type: "absorbed",
          casterClass: resolveCasterClass(abs.caster, context, guidCache),
          absorbSpellName: abs.absorbSpellName || undefined,
          absorbSpellId: abs.absorbSpellId,
        });
        return;
      }

      // Buffer health resource_change events (HoT ticks appear here)
      if (streamType === "resource_change") {
        const rc = event as ResourceChangeProcessorEvent;
        if (!rc.target || rc.resourceType.toLowerCase() !== "health") return;
        if (rc.amount === 0) return;
        pushToBuffer(state._incomingBuffer, encounterID, rc.target, {
          offsetMilli: rc.offsetMilli,
          eventIndex: rc.index,
          sourceName: rc.sourceName,
          casterName: resolveUnitName(rc.caster, context, guidCache),
          casterID: rc.caster,
          targetName: resolveUnitName(rc.target, context, guidCache),
          targetID: rc.target,
          targetClass: resolveCasterClass(rc.target, context, guidCache),
          amount: rc.amount,
          school: 0,
          hitType: 0,
          spellId: null,
          type: "resource_change",
          casterClass: resolveCasterClass(rc.caster, context, guidCache),
        });
        return;
      }

      // --- slain stream: process death ---
      if (streamType !== "slain") return;
      const slain = event as SlainProcessorEvent;
      if (!slain.target) return;

      const isPlayerDeath = isPlayerGuidFast(slain.target);
      
      // Get victim info
      const victimID = slain.target;
      let victimName: string;
      let victimClass: string;
      
      if (isPlayerDeath) {
        victimName = context.players[victimID]?.name || victimID;
        victimClass = context.players[victimID]?.class || "UNKNOWN";
      } else {
        victimName = context.units?.[victimID]?.name || victimID;
        victimClass = "ENEMY";
      }

      // Determine killer info
      const killerID = slain.caster || "";
      const killerName = resolveUnitName(killerID, context, guidCache);

      // Choose appropriate data structures based on whether it's a player or enemy death
      const encounterDeathsMap = isPlayerDeath ? state.EncounterDeaths : state.EncounterEnemyDeaths;
      const byKillerMap = isPlayerDeath ? state.ByKiller : state.EnemyByKiller;
      const deathEventsList = isPlayerDeath ? state.DeathEvents : state.EnemyDeathEvents;

      // Initialize encounter map if needed
      if (!encounterDeathsMap.has(encounterID)) {
        encounterDeathsMap.set(encounterID, new Map<string, PlayerDeathsData>());
      }

      const encounterData = encounterDeathsMap.get(encounterID)!;
      const existing = encounterData.get(victimID) || {
        playerID: victimID,
        playerName: victimName,
        className: victimClass,
        deathCount: 0,
        killers: new Map<string, KillerData>(),
      };

      existing.deathCount++;
      
      // Track killer breakdown
      const killerKey = killerID || "unknown";
      const existingKiller = existing.killers.get(killerKey) || {
        killerID: killerKey,
        killerName,
        count: 0,
      };
      existingKiller.count++;
      existing.killers.set(killerKey, existingKiller);
      
      encounterData.set(victimID, existing);

      // Build attribution if available
      let attribution: DeathAttribution | null = null;
      if (slain.attribution) {
        attribution = {
          sourceName: slain.attribution.sourceName,
          amount: slain.attribution.amount,
          school: slain.attribution.school,
          hitType: slain.attribution.hitType,
        };
      }

      // Build death recap from buffered events
      const recap = buildRecapFromBuffer(state._incomingBuffer, encounterID, victimID, slain.offsetMilli);

      deathEventsList.push({
        dateMilli: firstTimestamp.getTime() + slain.offsetMilli,
        offsetMilli: slain.offsetMilli,
        playerID: victimID,
        playerName: victimName,
        className: victimClass,
        killerID,
        killerName,
        encounterID,
        attribution,
        recap,
      });
        
      if (context.selectedEncounterIds.size == 0 || context.selectedEncounterIds.has(encounterID)) {
        // Breakout by killer
        const killerBreakout = byKillerMap.get(victimID) || new Map<string, number>();
        killerBreakout.set(killerKey, (killerBreakout.get(killerKey) || 0) + 1);
        byKillerMap.set(victimID, killerBreakout);
      }
    },
  };
}

// Pre-created processor for registry
export const deathsProcessor = createDeathsProcessor();
