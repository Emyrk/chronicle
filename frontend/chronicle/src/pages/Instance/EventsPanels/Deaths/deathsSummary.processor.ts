import type { SlainProcessorEvent, PanelProcessor, ProcessorContext } from "../processorTypes";
import { isPlayerGuidFast } from "../processors/guidCache";
import type { KillerData, PlayerDeathsData, UnitDeaths } from "./deaths.processor";
import type { CompactDeathRow } from "./compactDeaths";

export interface DeathsSummaryResult {
  EncounterDeaths: Map<string, UnitDeaths>;
  EncounterEnemyDeaths: Map<string, UnitDeaths>;
  /** Every player death in order, for the compact list. */
  PlayerDeathRows: CompactDeathRow[];
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
    PlayerDeathRows: [],
  }),

  processEvent: (state, event, encounterID, firstTimestamp, _streamType, context) => {
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

    if (isPlayerDeath) {
      state.PlayerDeathRows.push({
        dateMilli: firstTimestamp.getTime() + event.offsetMilli,
        encounterID,
        playerID: victimID,
        playerName: victimName,
        className: victimClass,
        killerName: killerID ? killerName : "Unknown",
      });
    }
  },
};
