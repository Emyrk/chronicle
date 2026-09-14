import type { SlainProcessorEvent, PanelProcessor, ProcessorContext } from "../processorTypes";
import { isPlayerGuidFast } from "../processors/guidCache";
import type { KillerData, PlayerDeathsData, UnitDeaths } from "./deaths.processor";

export interface DeathsSummaryResult {
  EncounterDeaths: Map<string, UnitDeaths>;
  EncounterEnemyDeaths: Map<string, UnitDeaths>;
}

function resolveUnitName(guid: string, context: ProcessorContext): string {
  if (!guid) return "Unknown";
  if (isPlayerGuidFast(guid)) return context.players[guid]?.name || guid;
  return context.units?.[guid]?.name || guid;
}

export const deathsSummaryProcessor: PanelProcessor<DeathsSummaryResult, SlainProcessorEvent> = {
  id: "deaths",
  streams: ["slain"],

  createState: () => ({
    EncounterDeaths: new Map<string, UnitDeaths>(),
    EncounterEnemyDeaths: new Map<string, UnitDeaths>(),
  }),

  processEvent: (state, event, encounterID, _firstTimestamp, _streamType, context) => {
    if (context.selectedEncounterIds.size > 0 && !context.selectedEncounterIds.has(encounterID)) return;
    if (!event.target) return;

    const isPlayerDeath = isPlayerGuidFast(event.target);
    const victimID = event.target;
    const victimName = resolveUnitName(victimID, context);
    const victimClass = isPlayerDeath ? context.players[victimID]?.class || "UNKNOWN" : "ENEMY";
    const killerID = event.caster || "";
    const killerKey = killerID || "unknown";
    const killerName = resolveUnitName(killerID, context);
    const encounterDeathsMap = isPlayerDeath ? state.EncounterDeaths : state.EncounterEnemyDeaths;

    let encounterData = encounterDeathsMap.get(encounterID);
    if (!encounterData) {
      encounterData = new Map<string, PlayerDeathsData>();
      encounterDeathsMap.set(encounterID, encounterData);
    }

    const victimData = encounterData.get(victimID) || {
      playerID: victimID,
      playerName: victimName,
      className: victimClass,
      deathCount: 0,
      killers: new Map<string, KillerData>(),
    };
    victimData.deathCount++;

    const killerData = victimData.killers.get(killerKey) || {
      killerID: killerKey,
      killerName,
      count: 0,
    };
    killerData.count++;
    victimData.killers.set(killerKey, killerData);
    encounterData.set(victimID, victimData);
  },
};
