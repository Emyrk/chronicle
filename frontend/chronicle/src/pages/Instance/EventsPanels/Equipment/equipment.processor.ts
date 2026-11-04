import type { PanelProcessor, CombatantInfoProcessorEvent, ProcessorContext } from "../processorTypes";

export interface PlayerSnapshot {
  guid: string;
  name: string;
  heroClass: string;
  /** Milliseconds from the start of the first selected encounter. */
  offsetMilli: number;
  /** Last identical combatant snapshot observation, used to extend timeline bars. */
  endOffsetMilli?: number;
  race: string;
  gender: number;
  guildName: string | null;
  gear: {
    itemId: number;
    enchantId: number | null;
    temporaryEnchantId: number | null;
    gemEnchantIds: number[];
    itemLevel: number | null;
    bonusIds: number[];
    gems: { itemId: number; itemLevel: number }[];
  }[];
  gearCount: number;
  talents: { summary: number[]; trees: string[] } | null;
}

export interface EquipmentResult {
  /** guid → latest combatant_info snapshot */
  players: Map<string, PlayerSnapshot>;
  /** guid → every combatant_info snapshot, oldest first */
  history: Map<string, PlayerSnapshot[]>;
}

function cloneSnapshot(event: CombatantInfoProcessorEvent): PlayerSnapshot {
  return {
    guid: event.guid,
    name: event.name,
    heroClass: event.heroClass,
    offsetMilli: event.globalOffsetMilli ?? event.offsetMilli,
    endOffsetMilli: event.globalOffsetMilli ?? event.offsetMilli,
    race: event.race,
    gender: event.gender,
    guildName: event.guildName,
    gear: event.gear.slice(0, event.gearCount).map(g => ({
      itemId: g.itemId,
      enchantId: g.enchantId,
      temporaryEnchantId: g.temporaryEnchantId,
      gemEnchantIds: g.gemEnchantIds.slice(),
      itemLevel: g.itemLevel,
      bonusIds: g.bonusIds.slice(),
      gems: g.gems.map(gem => ({ ...gem })),
    })),
    gearCount: event.gearCount,
    talents: event.talents ? {
      summary: event.talents.summary.slice(),
      trees: event.talents.trees.slice(),
    } : null,
  };
}

function snapshotStateKey(snapshot: PlayerSnapshot): string {
  return JSON.stringify([snapshot.gear, snapshot.talents]);
}

export const equipmentProcessor: PanelProcessor<EquipmentResult, CombatantInfoProcessorEvent> = {
  id: "equipment",
  streams: ["combatant_info"],
  createState: () => ({ players: new Map(), history: new Map() }),
  processEvent: (state, event, encounterID: string, _firstTimestamp: Date, _streamType: string, context: ProcessorContext) => {
    if (!context.selectedEncounterIds.has(encounterID)) return;
    const snapshot = cloneSnapshot(event);
    state.players.set(event.guid, snapshot);
    const history = state.history.get(event.guid);
    const previous = history?.at(-1);
    if (previous && snapshotStateKey(previous) === snapshotStateKey(snapshot)) {
      previous.endOffsetMilli = snapshot.offsetMilli;
    } else if (history) {
      history.push(snapshot);
    } else {
      state.history.set(event.guid, [snapshot]);
    }
  },
};
