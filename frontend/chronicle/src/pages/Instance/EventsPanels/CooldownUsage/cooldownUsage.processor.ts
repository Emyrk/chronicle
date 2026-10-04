import type { PanelProcessor, ProcessorContext, SpellGoProcessorEvent } from "../processorTypes";

export interface CooldownUsageCaster {
  playerID: string;
  playerName: string;
  className: string;
  /** spell id -> absolute cast timestamps (ms) */
  casts: Map<number, number[]>;
}

export interface CooldownUsageResult {
  Casters: Map<string, CooldownUsageCaster>;
}

// The worker cannot fetch the dataset's cooldown list, so every player cast is
// kept and matched against cooldown spells React-side.
export const cooldownUsageProcessor: PanelProcessor<CooldownUsageResult, SpellGoProcessorEvent> = {
  id: "cooldown_usage",
  streams: ["spell_go"],
  createState: () => ({ Casters: new Map() }),
  processEvent: (
    state: CooldownUsageResult,
    event: SpellGoProcessorEvent,
    encounterID: string,
    firstTimestamp: Date,
    _streamType: string,
    context: ProcessorContext,
  ) => {
    if (!context.selectedEncounterIds.has(encounterID)) return;
    const player = event.caster ? context.players[event.caster] : undefined;
    if (!player) return;

    let caster = state.Casters.get(event.caster);
    if (!caster) {
      caster = {
        playerID: event.caster,
        playerName: player.name,
        className: player.class,
        casts: new Map(),
      };
      state.Casters.set(event.caster, caster);
    }

    const at = firstTimestamp.getTime() + event.offsetMilli;
    const times = caster.casts.get(event.spell.id);
    if (times) times.push(at);
    else caster.casts.set(event.spell.id, [at]);
  },
};
