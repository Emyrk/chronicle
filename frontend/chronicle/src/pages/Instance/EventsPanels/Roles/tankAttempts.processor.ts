/**
 * Tank attempts processor — counts incoming Auto Attack attempts per
 * encounter / source / player.  Consumes the "damage" stream.
 *
 * An Auto Attack is identified by spell ID 6603 or the normalized
 * sourceName "Auto Attack". All hit outcomes count, including amount === 0
 * and avoided outcomes (miss, dodge, parry, etc.).
 *
 * Only events where:
 *   - target is a player (isPlayerGuidFast)
 *   - source is NOT a player and NOT player-owned (pet)
 * are counted, so player-vs-player and pet swings are excluded.
 *
 * Worker-safe: no React, no DOM.
 */

import type {
  DamageProcessorEvent,
  PanelProcessor,
} from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";
import { isPlayerGuidFast, isPlayerOrPetGuidFast } from "../processors/guidCache";
import {
  type TankAttemptCounts,
  createTankAttemptCounts,
} from "./tankInference";

const AutoAttackSpellId = 6603;

export const tankAttemptsProcessor: PanelProcessor<
  TankAttemptCounts,
  DamageProcessorEvent
> = {
  id: "tank_attempts",
  streams: ["damage"] as StreamType[],

  createState: createTankAttemptCounts,

  processEvent(
    state: TankAttemptCounts,
    event: DamageProcessorEvent,
    encounterID: string,
    _firstTimestamp,
    _streamType,
    context,
  ): void {
    // Auto Attack is serialized with the normalized source name and, when
    // SpellData is available, spell ID 6603.
    if (event.spellId !== AutoAttackSpellId && event.sourceName !== "Auto Attack") return;

    // Target must be a player.
    if (!isPlayerGuidFast(event.target)) return;

    // Source must not be a player or player-owned unit.
    if (isPlayerOrPetGuidFast(event.caster) || context.units?.[event.caster]?.owner) return;

    // Accumulate.
    let sources = state.counts.get(encounterID);
    if (!sources) {
      sources = new Map();
      state.counts.set(encounterID, sources);
    }

    let players = sources.get(event.caster);
    if (!players) {
      players = new Map();
      sources.set(event.caster, players);
    }

    players.set(event.target, (players.get(event.target) ?? 0) + 1);

    // Cache readable source name — we'll use the caster's GUID as source key,
    // but we still want a display name for the debug UI.  The damage event
    // doesn't carry the *caster* display name directly, but the unit context
    // will be resolved later.  For now we just record the GUID; the inference
    // layer resolves names via context.units.
  },
};
