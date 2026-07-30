import type { StreamType } from "@/hooks/instanceEvents";
import type {
  PanelProcessor,
  ProcessorContext,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
  SpellStartProcessorEvent,
} from "../../processorTypes";

export type PlayerActionEventType = "spell_start" | "spell_go" | "spell_fail";

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

export interface PlayerActionTimelineResult {
  playerGuid: string | null;
  events: PlayerActionEvent[];
}

export type PlayerActionTimelineEvent =
  | SpellGoProcessorEvent
  | SpellStartProcessorEvent
  | SpellFailProcessorEvent;

export const playerActionTimelineProcessor: PanelProcessor<
  PlayerActionTimelineResult,
  PlayerActionTimelineEvent
> = {
  id: "player_action_timeline_strip",
  streams: ["spell_go", "spell_start", "spell_fail"] as StreamType[],

  createState: (): PlayerActionTimelineResult => ({
    playerGuid: null,
    events: [],
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
