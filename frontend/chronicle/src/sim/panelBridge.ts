/**
 * Bridge between the DPS sim engine and EventsPanels processors.
 *
 * Converts sim StepResults into ProcessorEvents (DamageProcessorEvent,
 * CastProcessorEvent, AuraProcessorEvent) and feeds them directly into
 * processors — no worker or gzip stream round-trip needed.
 */

import { School } from "../api/proto/chronicle_pb";
import {
  HitTypeHit,
  HitTypeCrit,
  HitTypeMiss,
  HitTypeDodge,
  HitTypeParry,
  HitTypeGlancing,
  HitTypeCrushing,
  HitTypePartialResist,
  HitTypePeriodic,
} from "../lib/hittype/hittype";
import type { StepResult } from "./engine";
import { EventType } from "./engine";
import {
  Outcome,
  SchoolMaskPhysical,
  SchoolMaskHoly,
  SchoolMaskFire,
  SchoolMaskNature,
  SchoolMaskFrost,
  SchoolMaskShadow,
  SchoolMaskArcane,
} from "./types";
import type { SpellData } from "./types";

// Fake GUIDs that pass isPlayerGuidFast / creature checks
export const SIM_PLAYER_GUID = "0x0000000000000001";
export const SIM_TARGET_GUID = "0xF130000000000001";

/** Convert WoW school bitmask to chronicleproto.School enum value. */
function schoolMaskToProto(mask: number): number {
  if (mask & SchoolMaskArcane) return School.Arcane;
  if (mask & SchoolMaskShadow) return School.Shadow;
  if (mask & SchoolMaskFrost) return School.Frost;
  if (mask & SchoolMaskNature) return School.Nature;
  if (mask & SchoolMaskFire) return School.Fire;
  if (mask & SchoolMaskHoly) return School.Holy;
  if (mask & SchoolMaskPhysical) return School.Physical;
  return School.Unknown;
}

/** Convert sim Outcome to HitType bitmask. */
function outcomeToHitType(outcome: Outcome, resisted: number): number {
  let ht = 0;
  switch (outcome) {
    case Outcome.Crit:
      ht = HitTypeCrit;
      break;
    case Outcome.Miss:
      return HitTypeMiss;
    case Outcome.Dodge:
      return HitTypeDodge;
    case Outcome.Parry:
      return HitTypeParry;
    case Outcome.Glancing:
      ht = HitTypeGlancing;
      break;
    case Outcome.Crushing:
      ht = HitTypeCrushing;
      break;
    case Outcome.Resist:
      return HitTypeMiss; // full resist treated as miss
    default:
      ht = HitTypeHit;
  }
  if (resisted > 0) ht |= HitTypePartialResist;
  return ht;
}

/**
 * Minimal EventMeta fields. Processors require these but
 * the sim doesn't have real activity tracking.
 */
function meta(offsetMs: number) {
  return {
    index: 0,
    offsetMilli: offsetMs,
    globalOffsetMilli: offsetMs,
    activity: [],
    activityCount: 0,
  };
}

/** Sim encounter ID — a fixed string since there's only one "encounter". */
export const SIM_ENCOUNTER_ID = "sim-encounter-1";

export interface SimProcessorEvent {
  type: "damage" | "cast" | "aura";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any;
  streamType: "damage" | "cast" | "aura";
}

/**
 * Convert a StepResult into zero or more ProcessorEvents.
 * Returns events ready to feed into processor.processEvent().
 */
export function stepResultToEvents(
  step: StepResult,
  spells: Map<number, SpellData>,
  playerName: string,
): SimProcessorEvent[] {
  const events: SimProcessorEvent[] = [];

  // Damage events
  if (step.amount > 0 || step.outcome === Outcome.Miss || step.outcome === Outcome.Dodge || step.outcome === Outcome.Parry) {
    const spell = step.spellID ? spells.get(step.spellID) : undefined;
    const isAutoAttack = step.event === EventType.AutoAttack;
    const isDot = step.event === EventType.DotTick;

    let hitType = outcomeToHitType(step.outcome, step.resisted);
    if (isDot) hitType |= HitTypePeriodic;

    const dmgEvent = {
      ...meta(step.timeMs),
      type: "damage" as const,
      caster: SIM_PLAYER_GUID,
      sourceName: isAutoAttack ? "Auto Attack" : (spell?.name ?? `Spell ${step.spellID}`),
      target: SIM_TARGET_GUID,
      hitType,
      amount: step.amount,
      school: schoolMaskToProto(step.school || SchoolMaskPhysical),
      tailers: [],
      tailerCount: 0,
      spellId: isAutoAttack ? null : (step.spellID || null),
      spellAttackOutcome: null,
    };
    events.push({ type: "damage", event: dmgEvent, streamType: "damage" });
  }

  // Cast events (CastComplete → "Casts" action)
  if (step.event === EventType.CastComplete && step.spellID > 0) {
    const spell = spells.get(step.spellID);
    const castEvent = {
      ...meta(step.timeMs),
      type: "cast" as const,
      caster: SIM_PLAYER_GUID,
      action: 1, // CastAction.Casts
      target: SIM_TARGET_GUID,
      spell: {
        name: spell?.name ?? `Spell ${step.spellID}`,
        id: step.spellID,
        rank: null,
      },
    };
    events.push({ type: "cast", event: castEvent, streamType: "cast" });
  }

  // CastStart → "BeginsToCast" action
  if (step.event === EventType.CastStart && step.spellID > 0) {
    const spell = spells.get(step.spellID);
    const castEvent = {
      ...meta(step.timeMs),
      type: "cast" as const,
      caster: SIM_PLAYER_GUID,
      action: 2, // CastAction.BeginsToCast
      target: SIM_TARGET_GUID,
      spell: {
        name: spell?.name ?? `Spell ${step.spellID}`,
        id: step.spellID,
        rank: null,
      },
    };
    events.push({ type: "cast", event: castEvent, streamType: "cast" });
  }

  // Aura events
  for (const auraId of step.aurasApplied) {
    const spell = spells.get(auraId);
    const auraEvent = {
      ...meta(step.timeMs),
      type: "aura" as const,
      target: SIM_TARGET_GUID,
      spellName: spell?.name ?? `Aura ${auraId}`,
      spellId: auraId,
      spellAttackOutcome: null,
      amount: 1,
      application: 1, // Gains (deprecated but included)
      state: 1, // AuraState.Added
    };
    events.push({ type: "aura", event: auraEvent, streamType: "aura" });
  }

  for (const auraId of step.aurasRemoved) {
    const spell = spells.get(auraId);
    const auraEvent = {
      ...meta(step.timeMs),
      type: "aura" as const,
      target: SIM_TARGET_GUID,
      spellName: spell?.name ?? `Aura ${auraId}`,
      spellId: auraId,
      spellAttackOutcome: null,
      amount: 0,
      application: 2, // Fades (deprecated)
      state: 2, // AuraState.Removed
    };
    events.push({ type: "aura", event: auraEvent, streamType: "aura" });
  }

  return events;
}

/**
 * ProcessorContext for sim results.
 * Provides the minimum context processors need.
 */
export function createSimProcessorContext(
  playerName: string,
  playerClass: string,
): {
  players: Record<string, { name: string; class: string }>;
  units: Record<string, { name: string; owner: null; entry: number }>;
  selectedEncounterIds: Set<string>;
  entitySelection: { enemyIds: Set<string>; playerIds: Set<string> };
  panelOption: null;
  panelContext: null;
} {
  return {
    players: {
      [SIM_PLAYER_GUID]: { name: playerName, class: playerClass },
    },
    units: {
      [SIM_TARGET_GUID]: { name: "Target Dummy", owner: null, entry: 0 },
    },
    selectedEncounterIds: new Set([SIM_ENCOUNTER_ID]),
    entitySelection: {
      enemyIds: new Set([SIM_TARGET_GUID]),
      playerIds: new Set([SIM_PLAYER_GUID]),
    },
    panelOption: null,
    panelContext: null,
  };
}

/**
 * Run a full sim and feed all events through a processor.
 *
 * Usage:
 * ```ts
 * const state = runSimWithProcessor(engine, damageDoneProcessor, "Mage", "mage");
 * // state is the processor's accumulated result (e.g., DamageDoneResult)
 * ```
 */
export function runSimWithProcessor<TResult>(
  engine: { run: (durationMs: number) => unknown; getState: () => { timeMs: number } },
  steps: StepResult[],
  spells: Map<number, SpellData>,
  processor: {
    createState: () => TResult;
    processEvent: (
      state: TResult,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      event: any,
      encounterID: string,
      firstTimestamp: Date,
      streamType: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context: any,
    ) => void;
  },
  playerName: string,
  playerClass: string,
): TResult {
  const context = createSimProcessorContext(playerName, playerClass);
  const firstTimestamp = new Date(0);
  const state = processor.createState();

  for (const step of steps) {
    const simEvents = stepResultToEvents(step, spells, playerName);
    for (const se of simEvents) {
      processor.processEvent(
        state,
        se.event,
        SIM_ENCOUNTER_ID,
        firstTimestamp,
        se.streamType,
        context,
      );
    }
  }

  return state;
}

/**
 * Collect all StepResults from a sim run (for feeding to processors).
 * MUST pass durationMs to prevent infinite loops (ResourceTick reschedules forever).
 */
export function collectSimSteps(
  engine: { step: () => { result: StepResult; ok: boolean } },
  durationMs: number,
): StepResult[] {
  const steps: StepResult[] = [];
  const maxSteps = 1_000_000; // safety limit
  while (steps.length < maxSteps) {
    const { result, ok } = engine.step();
    if (!ok) break;
    if (result.timeMs > durationMs) break;
    steps.push(result);
  }
  return steps;
}
