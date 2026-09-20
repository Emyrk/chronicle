/**
 * Resists processor - aggregates spell resistance data per target (pure TS, worker-safe)
 *
 * Only considers spells whose AttackOutcome includes Resist (0x10).
 * Tracks partial resist buckets (25% / 50% / 75%) and full resists (100%).
 */

import type { DamageProcessorEvent, PanelProcessor, ProcessorContext } from "../processorTypes";
import { hasHitType, HitTypeFullResist, HitTypePartialResist } from "@/lib/hittype/hittype";
import { AttackOutcomeResist } from "@/lib/spellOutcome";
import { createGuidCache, getCachedGuid, isPlayerGuidFast, type GuidCache } from "../processors/guidCache";
import { resolveEntity, extractGroupingFromPanelOption, extractPetModeFromPanelOption } from "../processors/resolveEntity";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PlayerResistData {
  unitID: string;
  unitName: string;
  className: string;
  specialization: string;
  /** All resistable spell damage that would have landed (dealt + resisted). */
  totalIncoming: number;
  /** Sum of resisted amounts (from partial resist tailers). */
  totalResisted: number;
  /** Total resistable events (hits + full resists). */
  count: number;
  /** Events with a partial resist tailer. */
  partialResistCount: number;
  /** Events with HitTypeFullResist. */
  fullResistCount: number;
}

export interface AbilityResistBreakout {
  totalIncoming: number;
  totalResisted: number;
  school: number;
  /** Total resistable events (hits + full resists). */
  count: number;
  partialResistCount: number;
  fullResistCount: number;
  /** Resist bucket counts (Classic WoW 25% increments). */
  resist25: number;
  resist50: number;
  resist75: number;
  resist100: number;
}

export interface ResistsResult {
  /** Per-encounter, per-unit totals. encounter → unit → PlayerResistData */
  EncounterResists: Map<string, Map<string, PlayerResistData>>;
  /** Per-unit, per-ability breakouts (populated for selected encounters). */
  ByAbility: Map<string, Map<string, AbilityResistBreakout>>;
  GuidCache: GuidCache;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getResistBucket(resistFraction: number): 25 | 50 | 75 {
  // Classic WoW resist table: damage is resisted in 25% increments.
  // Use midpoints: 0–37.5% → 25%, 37.5–62.5% → 50%, 62.5%+ → 75%.
  if (resistFraction <= 0.375) return 25;
  if (resistFraction <= 0.625) return 50;
  return 75;
}

function createEmptyBreakout(): AbilityResistBreakout {
  return {
    totalIncoming: 0,
    totalResisted: 0,
    school: 0,
    count: 0,
    partialResistCount: 0,
    fullResistCount: 0,
    resist25: 0,
    resist50: 0,
    resist75: 0,
    resist100: 0,
  };
}

// ── Processor ──────────────────────────────────────────────────────────────

export const resistsProcessor: PanelProcessor<ResistsResult, DamageProcessorEvent> = {
  id: "resists",
  streams: ["damage"],

  createState: (): ResistsResult => ({
    EncounterResists: new Map(),
    ByAbility: new Map(),
    GuidCache: createGuidCache(),
  }),

  processEvent: (
    state: ResistsResult,
    event: DamageProcessorEvent,
    encounterID: string,
    _firstTimestamp: Date,
    _streamType: string,
    context: ProcessorContext,
  ) => {
    // Only consider spells that can be resisted (AttackOutcome flag).
    if (
      event.spellAttackOutcome == null ||
      (event.spellAttackOutcome & AttackOutcomeResist) === 0
    ) {
      return;
    }

    if (!event.target) return;

    const guidCache = state.GuidCache;

    // Only track damage received by players / pets.
    const isPlayer =
      isPlayerGuidFast(event.target) ||
      getCachedGuid(guidCache, event.target).isPlayer();
    const targetInfo = context.units?.[event.target];
    const isPet =
      !isPlayer &&
      !!targetInfo?.owner &&
      (isPlayerGuidFast(targetInfo.owner) ||
        getCachedGuid(guidCache, targetInfo.owner).isPlayer());

    if (!isPlayer && !isPet) return;

    // Determine resist amounts.
    // Full resists are indicated by the event hitType flag.
    const isFullResist = hasHitType(event.hitType, HitTypeFullResist);

    // Partial resists are carried in the tailers — the event hitType may NOT
    // have HitTypePartialResist set (the hit is still a "hit", the resist is
    // additional info on the tailer).  Scan tailers to find the resisted amount.
    let resistedAmount = 0;
    if (!isFullResist) {
      for (let i = 0; i < event.tailerCount; i++) {
        const t = event.tailers[i];
        if (t && hasHitType(t.hitType, HitTypePartialResist)) {
          resistedAmount = t.amount;
          break;
        }
      }
    }
    const isPartialResist = resistedAmount > 0;

    // totalIncoming = damage dealt + resisted portion.
    // For full resists event.amount is 0 so we only count events, not damage.
    const incomingDamage = isFullResist ? 0 : event.amount + resistedAmount;

    // ── Encounter-level aggregation ──────────────────────────────────────
    const grouping = extractGroupingFromPanelOption(context.panelOption, "default");
    const petMode = extractPetModeFromPanelOption(context.panelOption, "individual");
    const entity = resolveEntity(event.target, context, grouping, petMode);
    const unitId = entity.id;

    if (!state.EncounterResists.has(encounterID)) {
      state.EncounterResists.set(encounterID, new Map());
    }
    const encounterMap = state.EncounterResists.get(encounterID)!;
    let player = encounterMap.get(unitId);
    if (!player) {
      player = {
        unitID: unitId,
        unitName: entity.name,
        className: entity.class,
        specialization: "",
        totalIncoming: 0,
        totalResisted: 0,
        count: 0,
        partialResistCount: 0,
        fullResistCount: 0,
      };
      encounterMap.set(unitId, player);
    }

    player.totalIncoming += incomingDamage;
    player.totalResisted += resistedAmount;
    player.count += 1;

    if (isFullResist) {
      player.fullResistCount += 1;
    } else if (isPartialResist) {
      player.partialResistCount += 1;
    }

    // ── Ability breakout (only for selected encounters) ──────────────────
    if (context.selectedEncounterIds.has(encounterID)) {
      const abilityName = event.sourceName || "Auto Attack";

      if (!state.ByAbility.has(unitId)) {
        state.ByAbility.set(unitId, new Map());
      }
      const abilities = state.ByAbility.get(unitId)!;
      let ab = abilities.get(abilityName);
      if (!ab) {
        ab = createEmptyBreakout();
        ab.school = event.schools[0];
        abilities.set(abilityName, ab);
      }

      ab.totalIncoming += incomingDamage;
      ab.totalResisted += resistedAmount;

      ab.count += 1;

      if (isFullResist) {
        ab.fullResistCount += 1;
        ab.resist100 += 1;
      } else if (isPartialResist) {
        ab.partialResistCount += 1;
        // Bucket by fraction resisted.
        const unmitigated = event.amount + resistedAmount;
        if (unmitigated > 0) {
          const bucket = getResistBucket(resistedAmount / unmitigated);
          if (bucket === 25) ab.resist25 += 1;
          else if (bucket === 50) ab.resist50 += 1;
          else ab.resist75 += 1;
        }
      }
    }
  },
};
