import type {
  PanelProcessor,
  ProcessorContext,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
} from "../processorTypes";

export type SpellCountEvent = SpellGoProcessorEvent | SpellFailProcessorEvent;

export interface SpellCountSpellData {
  spellId: number;
  spellName: string;
  successful: number;
  failed: number;
}

export interface SpellCountData {
  playerID: string;
  playerName: string;
  className: string;
  successful: number;
  failed: number;
  spells: Map<string, SpellCountSpellData>;
}

export interface SpellCountResult {
  EncounterSpellCounts: Map<string, Map<string, SpellCountData>>;
}

export function aggregateSpellCountsForPlayer(
  result: SpellCountResult,
  playerID: string,
  selectedEncounterIds: string[],
): SpellCountData | null {
  const aggregated: SpellCountData = {
    playerID,
    playerName: "",
    className: "",
    successful: 0,
    failed: 0,
    spells: new Map(),
  };

  for (const encounterID of selectedEncounterIds) {
    const playerData = result.EncounterSpellCounts.get(encounterID)?.get(playerID);
    if (!playerData) continue;

    aggregated.playerName = playerData.playerName;
    aggregated.className = playerData.className;
    aggregated.successful += playerData.successful;
    aggregated.failed += playerData.failed;

    for (const [spellKey, spell] of playerData.spells) {
      const existing = aggregated.spells.get(spellKey);
      if (existing) {
        existing.successful += spell.successful;
        existing.failed += spell.failed;
      } else {
        aggregated.spells.set(spellKey, { ...spell });
      }
    }
  }

  return aggregated.successful + aggregated.failed > 0 ? aggregated : null;
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
      spells: new Map<string, SpellCountSpellData>(),
    };
    const spellKey = `${event.spell.id}:${event.spell.name}`;
    const spellCount = count.spells.get(spellKey) ?? {
      spellId: event.spell.id,
      spellName: event.spell.name,
      successful: 0,
      failed: 0,
    };

    if (event.type === "spell_go") {
      count.successful++;
      spellCount.successful++;
    } else {
      count.failed++;
      spellCount.failed++;
    }

    count.spells.set(spellKey, spellCount);
    encounterCounts.set(event.caster, count);
  },
};
