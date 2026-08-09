import type { PanelProcessor, CombatantInfoProcessorEvent, ProcessorContext } from "../processorTypes";

export interface PlayerSnapshot {
  guid: string;
  name: string;
  heroClass: string;
  race: string;
  gender: number;
  guildName: string | null;
  gear: { itemId: number; enchantId: number | null; temporaryEnchantId: number | null; gemIds: number[] }[];
  gearCount: number;
  talents: { summary: number[]; trees: string[] } | null;
}

export interface EquipmentResult {
  /** guid → latest combatant_info snapshot */
  players: Map<string, PlayerSnapshot>;
}

export const equipmentProcessor: PanelProcessor<EquipmentResult, CombatantInfoProcessorEvent> = {
  id: "equipment",
  streams: ["combatant_info"],
  createState: () => ({ players: new Map() }),
  processEvent: (state, event, encounterID: string, _firstTimestamp: Date, _streamType: string, context: ProcessorContext) => {
    if (!context.selectedEncounterIds.has(encounterID)) return;
    state.players.set(event.guid, {
      guid: event.guid,
      name: event.name,
      heroClass: event.heroClass,
      race: event.race,
      gender: event.gender,
      guildName: event.guildName,
      gear: event.gear.slice(0, event.gearCount).map(g => ({
        itemId: g.itemId,
        enchantId: g.enchantId,
        temporaryEnchantId: g.temporaryEnchantId,
        gemIds: g.gemIds.slice(),
      })),
      gearCount: event.gearCount,
      talents: event.talents,
    });
  },
};
