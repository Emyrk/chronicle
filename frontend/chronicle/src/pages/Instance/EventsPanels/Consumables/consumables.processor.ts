/**
 * Consumables processor - counts physical consumable uses per player (pure TS, worker-safe).
 *
 * The backend consume stream already correlates raw evidence:
 *   - every observation carries a parse-wide stable `evidenceId`;
 *   - observations describing the same physical use share one `consumeId`;
 *   - projected copies (pre-pull buffs replayed into later encounters) keep
 *     their original IDs with `isProjection = true`.
 *
 * Counting therefore reduces to:
 *   1. drop evidence outside the selected encounters / players;
 *   2. deduplicate observations by `evidenceId`;
 *   3. group observations by `consumeId` — one group is one physical use.
 */

import type { ConsumeProcessorEvent, PanelProcessor, ProcessorContext } from "../processorTypes";

/** Confidence rank: lower is stronger. Unknown (0) ranks last. */
export function confidenceRank(confidence: number): number {
  return confidence === 0 ? 5 : confidence;
}

/**
 * One physical consumable use, merged from every evidence observation that
 * shares its consumeId.
 */
export interface ConsumableUse {
  consumeId: string;
  player: string;
  /** Canonical item ID when any observation knew it. */
  itemId: number | null;
  /** Candidate item IDs when the item is ambiguous. */
  candidateItemIds: number[];
  spellId: number | null;
  spellName: string;
  /** Strongest confidence seen across observations (enum value, 1 = direct). */
  bestConfidence: number;
  /** Distinct evidence kinds observed for this use. */
  kinds: number[];
  /** True when the use was only seen as an already-active pre-pull buff. */
  activeAtPullOnly: boolean;
  observedAtUnixMilli: number;
  consumedAtUnixMilli: number | null;
}

export interface ConsumablesResult {
  /** evidenceId -> true; deduplicates projected copies across encounters. */
  seenEvidence: Map<string, boolean>;
  /** consumeId -> merged use record. Each entry is one physical use. */
  uses: Map<string, ConsumableUse>;
  /** Diagnostics: consumeIds with no item ID and no candidates. */
  unknownUseIds: Map<string, boolean>;
}

/** Display name for a use: spell name, else item placeholder. */
export function consumableDisplayName(use: ConsumableUse): string {
  if (use.spellName) return use.spellName;
  if (use.itemId !== null) return `Item ${use.itemId}`;
  if (use.candidateItemIds.length > 0) return `Item ${use.candidateItemIds.join("/")}`;
  return "Unknown Consumable";
}

export const consumablesProcessor: PanelProcessor<ConsumablesResult, ConsumeProcessorEvent> = {
  id: "consumables",
  streams: ["consume"],

  createState: (): ConsumablesResult => ({
    seenEvidence: new Map(),
    uses: new Map(),
    unknownUseIds: new Map(),
  }),

  processEvent: (
    state: ConsumablesResult,
    event: ConsumeProcessorEvent,
    encounterID: string,
    _firstTimestamp: Date,
    _streamType,
    context: ProcessorContext,
  ) => {
    if (!context.selectedEncounterIds.has(encounterID)) return;

    const { playerIds } = context.entitySelection;
    if (playerIds.size > 0 && !playerIds.has(event.player)) return;

    // A projected copy repeats an observation already counted in another
    // encounter; the stable evidenceId makes the duplicate detectable.
    if (state.seenEvidence.has(event.evidenceId)) return;
    state.seenEvidence.set(event.evidenceId, true);

    // Copy values out of the reused event object before storing.
    const kind = event.kind;
    const confidence = event.confidence;
    const itemId = event.itemId;
    const candidateItemIds = event.candidateItemIds.slice(0, event.candidateItemIdsCount);
    const spellId = event.spell.id || null;
    const spellName = event.spell.name;

    let use = state.uses.get(event.consumeId);
    if (!use) {
      use = {
        consumeId: event.consumeId,
        player: event.player,
        itemId: null,
        candidateItemIds: [],
        spellId: null,
        spellName: "",
        bestConfidence: 0,
        kinds: [],
        activeAtPullOnly: true,
        observedAtUnixMilli: event.observedAtUnixMilli,
        consumedAtUnixMilli: null,
      };
      state.uses.set(event.consumeId, use);
    }

    // Merge this observation into the use record, preferring stronger data.
    if (use.itemId === null && itemId !== null) use.itemId = itemId;
    if (use.candidateItemIds.length === 0 && candidateItemIds.length > 0) {
      use.candidateItemIds = candidateItemIds;
    }
    if (use.spellId === null && spellId !== null) use.spellId = spellId;
    if (!use.spellName && spellName) use.spellName = spellName;
    if (confidenceRank(confidence) < confidenceRank(use.bestConfidence)) {
      use.bestConfidence = confidence;
    }
    if (!use.kinds.includes(kind)) use.kinds.push(kind);
    // EvidenceKind 7 = ActiveAtPull. Any other kind proves a real observation.
    if (kind !== 7) use.activeAtPullOnly = false;
    if (use.consumedAtUnixMilli === null && event.consumedAtUnixMilli !== null) {
      use.consumedAtUnixMilli = event.consumedAtUnixMilli;
    }
    if (event.observedAtUnixMilli < use.observedAtUnixMilli) {
      use.observedAtUnixMilli = event.observedAtUnixMilli;
    }

    // Diagnostics: track uses Chronicle could not tie to any item.
    if (use.itemId === null && use.candidateItemIds.length === 0) {
      state.unknownUseIds.set(use.consumeId, true);
    } else {
      state.unknownUseIds.delete(use.consumeId);
    }
  },
};
