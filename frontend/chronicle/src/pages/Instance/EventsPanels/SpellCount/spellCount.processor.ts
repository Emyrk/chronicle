import type {
  PanelProcessor,
  ProcessorContext,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
} from "../processorTypes";

export type SpellCountEvent = SpellGoProcessorEvent | SpellFailProcessorEvent;

export interface SpellCountData {
  playerID: string;
  playerName: string;
  className: string;
  successful: number;
  failed: number;
}

export interface SpellCountResult {
  EncounterSpellCounts: Map<string, Map<string, SpellCountData>>;
}

export const spellCountProcessor: PanelProcessor<SpellCountResult, SpellCountEvent> = {
  id: "spell_count",
  streams: ["spell_go", "spell_fail"],
  createState: () => ({
    EncounterSpellCounts: new Map(),
  }),
  processEvent: (
    state: SpellCountResult,
    event: SpellCountEvent,
    encounterID: string,
    _firstTimestamp: Date,
    _streamType: string,
    context: ProcessorContext,
  ) => {
    if (!context.selectedEncounterIds.has(encounterID)) return;

    const player = context.players[event.caster];
    if (!player) return;

    let encounterCounts = state.EncounterSpellCounts.get(encounterID);
    if (!encounterCounts) {
      encounterCounts = new Map();
      state.EncounterSpellCounts.set(encounterID, encounterCounts);
    }

    const count = encounterCounts.get(event.caster) ?? {
      playerID: event.caster,
      playerName: player.name,
      className: player.class,
      successful: 0,
      failed: 0,
    };

    if (event.type === "spell_go") {
      count.successful++;
    } else {
      count.failed++;
    }

    encounterCounts.set(event.caster, count);
  },
};
