import { hasHitType, HitTypePeriodic } from "@/lib/hittype/hittype";
import type {
  DamageProcessorEvent,
  HealProcessorEvent,
  PanelProcessor,
  ProcessorContext,
  ProcessorEvent,
  ResurrectionProcessorEvent,
  SlainProcessorEvent,
} from "../processorTypes";

export const PLAYER_REVIVAL_ACTIVITY_DELAY_MILLI = 1_000;

export type PlayerLifeTransitionReason = "slain" | "ressurection" | "direct_damage" | "direct_heal";

export interface PlayerLifeTransition {
  encounterId: string;
  playerId: string;
  timestampMilli: number;
  offsetMilli: number;
  eventIndex: number;
  alive: boolean;
  reason: PlayerLifeTransitionReason;
}

export interface PlayerLifeStateResult {
  transitions: PlayerLifeTransition[];
  _deadSince: Map<string, Map<string, number>>;
}

function encounterDeadSince(state: PlayerLifeStateResult, encounterId: string): Map<string, number> {
  let deadSince = state._deadSince.get(encounterId);
  if (!deadSince) {
    deadSince = new Map();
    state._deadSince.set(encounterId, deadSince);
  }
  return deadSince;
}

function appendTransition(
  state: PlayerLifeStateResult,
  encounterId: string,
  playerId: string,
  firstTimestamp: Date,
  event: ProcessorEvent,
  alive: boolean,
  reason: PlayerLifeTransitionReason,
): void {
  state.transitions.push({
    encounterId,
    playerId,
    timestampMilli: firstTimestamp.getTime() + event.offsetMilli,
    offsetMilli: event.offsetMilli,
    eventIndex: event.index,
    alive,
    reason,
  });
}

function inferActivePlayer(
  state: PlayerLifeStateResult,
  encounterId: string,
  firstTimestamp: Date,
  playerId: string,
  event: DamageProcessorEvent | HealProcessorEvent,
  reason: "direct_damage" | "direct_heal",
): void {
  const deadSince = encounterDeadSince(state, encounterId);
  const deathMilli = deadSince.get(playerId);
  if (deathMilli === undefined) return;
  const timestampMilli = firstTimestamp.getTime() + event.offsetMilli;
  if (timestampMilli - deathMilli <= PLAYER_REVIVAL_ACTIVITY_DELAY_MILLI) return;
  if (event.amount <= 0 || hasHitType(event.hitType, HitTypePeriodic)) return;
  deadSince.delete(playerId);
  appendTransition(state, encounterId, playerId, firstTimestamp, event, true, reason);
}

export const playerLifeStateProcessor: PanelProcessor<PlayerLifeStateResult> = {
  id: "player_life_state",
  streams: ["slain", "ressurection", "damage", "heal"],
  createState: () => ({ transitions: [], _deadSince: new Map() }),
  processEvent(state, event, encounterId, firstTimestamp, _streamType, context: ProcessorContext) {
    if (event.type === "slain") {
      const slain = event as SlainProcessorEvent;
      if (!context.players[slain.target]) return;
      const deadSince = encounterDeadSince(state, encounterId);
      const timestampMilli = firstTimestamp.getTime() + event.offsetMilli;
      deadSince.set(slain.target, timestampMilli);
      appendTransition(state, encounterId, slain.target, firstTimestamp, event, false, "slain");
      return;
    }

    if (event.type === "ressurection") {
      const resurrection = event as ResurrectionProcessorEvent;
      if (!context.players[resurrection.target]) return;
      const deadSince = encounterDeadSince(state, encounterId);
      if (!deadSince.has(resurrection.target)) return;
      deadSince.delete(resurrection.target);
      appendTransition(state, encounterId, resurrection.target, firstTimestamp, event, true, "ressurection");
      return;
    }

    if (event.type === "damage") {
      const damage = event as DamageProcessorEvent;
      if (!context.players[damage.caster]) return;
      inferActivePlayer(state, encounterId, firstTimestamp, damage.caster, damage, "direct_damage");
      return;
    }

    if (event.type === "heal") {
      const heal = event as HealProcessorEvent;
      if (!context.players[heal.caster]) return;
      inferActivePlayer(state, encounterId, firstTimestamp, heal.caster, heal, "direct_heal");
    }
  },
};

function compareTransitions(a: PlayerLifeTransition, b: PlayerLifeTransition): number {
  return a.timestampMilli - b.timestampMilli || a.eventIndex - b.eventIndex;
}

export class PlayerLifeStateIndex {
  private readonly byEncounterPlayer = new Map<string, Map<string, PlayerLifeTransition[]>>();

  constructor(transitions: PlayerLifeTransition[]) {
    for (const transition of [...transitions].sort(compareTransitions)) {
      let encounter = this.byEncounterPlayer.get(transition.encounterId);
      if (!encounter) {
        encounter = new Map();
        this.byEncounterPlayer.set(transition.encounterId, encounter);
      }
      let playerTransitions = encounter.get(transition.playerId);
      if (!playerTransitions) {
        playerTransitions = [];
        encounter.set(transition.playerId, playerTransitions);
      }
      playerTransitions.push(transition);
    }
  }

  transitions(encounterId: string, playerId: string): readonly PlayerLifeTransition[] {
    return this.byEncounterPlayer.get(encounterId)?.get(playerId) ?? [];
  }

  deadSince(encounterId: string, playerId: string, cursorMilli: number): number | null {
    const transitions = this.transitions(encounterId, playerId);
    let low = 0;
    let high = transitions.length - 1;
    let match: PlayerLifeTransition | null = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const transition = transitions[middle];
      if (transition.timestampMilli <= cursorMilli) {
        match = transition;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return match && !match.alive ? match.timestampMilli : null;
  }

  isDead(encounterId: string, playerId: string, cursorMilli: number): boolean {
    return this.deadSince(encounterId, playerId, cursorMilli) !== null;
  }
}
