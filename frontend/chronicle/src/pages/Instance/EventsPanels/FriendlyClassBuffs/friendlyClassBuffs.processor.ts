import type { AuraProcessorEvent, PanelProcessor, ProcessorContext } from "../processorTypes";
import { AuraState, AuraTransition } from "../processorTypes";

export const UNKNOWN_CASTER_ID = "unknown";

export interface FriendlyBuffPlayer {
  playerID: string;
  playerName: string;
  className: string;
  applications: number;
}

export interface FriendlyBuffSpellUsage {
  spellId: number;
  spellName: string;
  applications: number;
  otherPlayers: Map<string, FriendlyBuffPlayer>;
}

export interface FriendlyBuffEntityUsage {
  entityID: string;
  entityName: string;
  className: string;
  applications: number;
  bySpell: Map<number, FriendlyBuffSpellUsage>;
}

export interface FriendlyClassBuffsResult {
  byCaster: Map<string, FriendlyBuffEntityUsage>;
  byTarget: Map<string, FriendlyBuffEntityUsage>;
  unattributedApplications: number;
}

function isApplication(event: AuraProcessorEvent): boolean {
  if (event.amount <= 0 || event.state === AuraState.Removed) return false;
  return event.transition === AuraTransition.Applied
    || event.transition === AuraTransition.Refreshed
    || (event.transition === AuraTransition.Unknown && event.state === AuraState.Added);
}

function playerIdentity(
  context: ProcessorContext,
  playerID: string,
  fallbackName: string,
): FriendlyBuffPlayer {
  const player = context.players[playerID];
  return {
    playerID,
    playerName: player?.name ?? fallbackName,
    className: player?.class ?? "",
    applications: 0,
  };
}

function accumulate(
  entities: Map<string, FriendlyBuffEntityUsage>,
  entity: FriendlyBuffPlayer,
  other: FriendlyBuffPlayer,
  spellId: number,
  spellName: string,
): void {
  let entityUsage = entities.get(entity.playerID);
  if (!entityUsage) {
    entityUsage = {
      entityID: entity.playerID,
      entityName: entity.playerName,
      className: entity.className,
      applications: 0,
      bySpell: new Map(),
    };
    entities.set(entity.playerID, entityUsage);
  }
  entityUsage.applications++;

  let spellUsage = entityUsage.bySpell.get(spellId);
  if (!spellUsage) {
    spellUsage = {
      spellId,
      spellName,
      applications: 0,
      otherPlayers: new Map(),
    };
    entityUsage.bySpell.set(spellId, spellUsage);
  }
  spellUsage.applications++;

  let otherUsage = spellUsage.otherPlayers.get(other.playerID);
  if (!otherUsage) {
    otherUsage = { ...other };
    spellUsage.otherPlayers.set(other.playerID, otherUsage);
  }
  otherUsage.applications++;
}

export const friendlyClassBuffsProcessor: PanelProcessor<FriendlyClassBuffsResult, AuraProcessorEvent> = {
  id: "friendly_class_buffs",
  streams: ["aura"],

  createState: (): FriendlyClassBuffsResult => ({
    byCaster: new Map(),
    byTarget: new Map(),
    unattributedApplications: 0,
  }),

  processEvent: (state, event, encounterID, _firstTimestamp, _streamType, context) => {
    if (!context.selectedEncounterIds.has(encounterID)) return;
    if (!event.isBuff || event.spellId == null || !isApplication(event)) return;

    const target = context.players[event.target];
    if (!target) return;

    const targetIdentity = playerIdentity(context, event.target, event.target);
    if (!event.caster) {
      const unknownCaster: FriendlyBuffPlayer = {
        playerID: UNKNOWN_CASTER_ID,
        playerName: "Unknown",
        className: "",
        applications: 0,
      };
      accumulate(state.byTarget, targetIdentity, unknownCaster, event.spellId, event.spellName);
      state.unattributedApplications++;
      return;
    }

    const caster = context.players[event.caster];
    if (!caster || event.caster === event.target) return;

    const casterIdentity = playerIdentity(context, event.caster, event.caster);
    accumulate(state.byCaster, casterIdentity, targetIdentity, event.spellId, event.spellName);
    accumulate(state.byTarget, targetIdentity, casterIdentity, event.spellId, event.spellName);
  },
};
