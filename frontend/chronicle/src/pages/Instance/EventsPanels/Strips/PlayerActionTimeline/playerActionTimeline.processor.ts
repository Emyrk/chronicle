import type { StreamType } from "@/hooks/instanceEvents";
import { HitTypePeriodic, hasHitType } from "@/lib/hittype/hittype";
import type {
  DamageProcessorEvent,
  HealProcessorEvent,
  PanelProcessor,
  ProcessorContext,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
  SpellStartProcessorEvent,
} from "../../processorTypes";

export type PlayerActionEventType = "spell_start" | "spell_go" | "spell_fail";
export type PlayerActionEffectType = "damage" | "heal";

export interface PlayerActionEvent {
  eventIndex: number;
  offsetMilli: number;
  spellId: number;
  spellName: string;
  target: string;
  eventType: PlayerActionEventType;
  castTimeMilli: number;
  channelTimeMilli: number;
}

export interface PlayerActionEffect {
  eventIndex: number;
  offsetMilli: number;
  spellId: number | null;
  spellName: string;
  target: string;
  effectType: PlayerActionEffectType;
  amount: number;
  periodic: boolean;
}

export interface PlayerActionTimelineResult {
  playerGuid: string | null;
  events: PlayerActionEvent[];
  effects: PlayerActionEffect[];
}

export type PlayerActionTimelineEvent =
  | SpellGoProcessorEvent
  | SpellStartProcessorEvent
  | SpellFailProcessorEvent
  | DamageProcessorEvent
  | HealProcessorEvent;

export const playerActionTimelineProcessor: PanelProcessor<
  PlayerActionTimelineResult,
  PlayerActionTimelineEvent
> = {
  id: "player_action_timeline_strip",
  streams: ["spell_go", "spell_start", "spell_fail", "damage", "heal"] as StreamType[],

  createState: (): PlayerActionTimelineResult => ({
    playerGuid: null,
    events: [],
    effects: [],
  }),

  processEvent(
    state: PlayerActionTimelineResult,
    event: PlayerActionTimelineEvent,
    encounterID: string,
    _firstTimestamp: Date,
    _streamType: StreamType,
    context: ProcessorContext,
  ): void {
    if (!encounterID || context.selectedEncounterIds.size !== 1) return;
    if (!context.selectedEncounterIds.has(encounterID)) return;
    if (context.entitySelection.playerIds.size !== 1) return;

    const playerGuid = context.entitySelection.playerIds.values().next().value;
    if (!playerGuid || event.caster !== playerGuid) return;

    state.playerGuid = playerGuid;

    if (event.type === "damage" || event.type === "heal") {
      state.effects.push({
        eventIndex: event.index,
        offsetMilli: event.offsetMilli,
        spellId: event.spellId,
        spellName: event.sourceName,
        target: event.target,
        effectType: event.type,
        amount: event.amount,
        periodic: hasHitType(event.hitType, HitTypePeriodic),
      });
      return;
    }

    state.events.push({
      eventIndex: event.index,
      offsetMilli: event.offsetMilli,
      spellId: event.spell.id,
      spellName: event.spell.name,
      target: event.type === "spell_fail" ? "" : event.target || "",
      eventType: event.type,
      castTimeMilli: event.type === "spell_start" ? event.castTimeMilli : 0,
      channelTimeMilli: event.type === "spell_start" ? event.channelTimeMilli : 0,
    });
  },
};
