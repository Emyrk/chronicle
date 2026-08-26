import type {
  PlayerActionEffect,
  PlayerActionEvent,
} from "./playerActionTimeline.processor";

const TERMINAL_MATCH_GRACE_MILLI = 1_500;
const IMPACT_MATCH_WINDOW_MILLI = 5_000;

export type PlayerActionOutcome = "completed" | "failed" | "unknown";

export interface PlayerAction {
  id: string;
  spellId: number;
  spellName: string;
  target: string;
  startMilli: number;
  /** SPELL_GO timestamp, or the best known cast completion time. */
  launchMilli: number;
  /** First matching non-periodic damage/heal timestamp after SPELL_GO. */
  impactMilli: number | null;
  impactTarget: string;
  durationMilli: number;
  channeling: boolean;
  outcome: PlayerActionOutcome;
}

export interface PlayerActionWindow {
  activeAction: PlayerAction | null;
  inFlightAction: PlayerAction | null;
  nextAction: PlayerAction | null;
  focusAction: PlayerAction | null;
  visibleActions: PlayerAction[];
}

function compareEvents(a: PlayerActionEvent, b: PlayerActionEvent): number {
  return a.offsetMilli - b.offsetMilli || a.eventIndex - b.eventIndex || a.eventType.localeCompare(b.eventType);
}

function terminalOutcome(event: PlayerActionEvent): PlayerActionOutcome {
  return event.eventType === "spell_fail" ? "failed" : "completed";
}

function effectMatchesAction(effect: PlayerActionEffect, action: PlayerAction): boolean {
  if (effect.periodic || action.outcome !== "completed") return false;
  if (effect.offsetMilli < action.launchMilli) return false;
  if (effect.offsetMilli > action.launchMilli + IMPACT_MATCH_WINDOW_MILLI) return false;
  const abilityMatches = effect.spellId !== null
    ? effect.spellId === action.spellId
    : effect.spellName === action.spellName;
  if (!abilityMatches) return false;
  return !action.target || !effect.target || action.target === effect.target;
}

export function buildPlayerActions(
  events: readonly PlayerActionEvent[],
  effects: readonly PlayerActionEffect[] = [],
): PlayerAction[] {
  const ordered = [...events].sort(compareEvents);
  const terminals = ordered.filter((event) => event.eventType !== "spell_start");
  const usedTerminals = new Set<number>();
  const actions: PlayerAction[] = [];

  for (const start of ordered) {
    if (start.eventType !== "spell_start") continue;

    const expectedDuration = Math.max(start.castTimeMilli, start.channelTimeMilli, 0);
    const latestTerminal = start.offsetMilli + expectedDuration + TERMINAL_MATCH_GRACE_MILLI;
    const terminalIndex = terminals.findIndex((terminal, index) => (
      !usedTerminals.has(index)
      && terminal.spellId === start.spellId
      && terminal.offsetMilli >= start.offsetMilli
      && terminal.offsetMilli <= latestTerminal
    ));
    const terminal = terminalIndex >= 0 ? terminals[terminalIndex] : null;
    if (terminalIndex >= 0) usedTerminals.add(terminalIndex);

    const fallbackLaunch = start.offsetMilli + expectedDuration;
    const launchMilli = Math.max(start.offsetMilli, terminal?.offsetMilli ?? fallbackLaunch);
    actions.push({
      id: `start:${start.eventIndex}`,
      spellId: start.spellId,
      spellName: start.spellName,
      target: terminal?.target || start.target,
      startMilli: start.offsetMilli,
      launchMilli,
      impactMilli: null,
      impactTarget: "",
      durationMilli: Math.max(0, launchMilli - start.offsetMilli),
      channeling: start.channelTimeMilli > 0,
      outcome: terminal ? terminalOutcome(terminal) : "unknown",
    });
  }

  terminals.forEach((terminal, index) => {
    if (usedTerminals.has(index)) return;
    actions.push({
      id: `${terminal.eventType}:${terminal.eventIndex}`,
      spellId: terminal.spellId,
      spellName: terminal.spellName,
      target: terminal.target,
      startMilli: terminal.offsetMilli,
      launchMilli: terminal.offsetMilli,
      impactMilli: null,
      impactTarget: "",
      durationMilli: 0,
      channeling: false,
      outcome: terminalOutcome(terminal),
    });
  });

  const orderedActions = actions.sort(
    (a, b) => a.startMilli - b.startMilli || a.launchMilli - b.launchMilli || a.id.localeCompare(b.id),
  );
  const orderedEffects = [...effects].sort(
    (a, b) => a.offsetMilli - b.offsetMilli || a.eventIndex - b.eventIndex,
  );
  const usedEffects = new Set<number>();

  for (const action of orderedActions) {
    const effectIndex = orderedEffects.findIndex((effect, index) => (
      !usedEffects.has(index) && effectMatchesAction(effect, action)
    ));
    if (effectIndex < 0) continue;
    const effect = orderedEffects[effectIndex];
    usedEffects.add(effectIndex);
    action.impactMilli = effect.offsetMilli;
    action.impactTarget = effect.target;
  }

  return orderedActions;
}

export function selectPlayerActionWindow(
  actions: readonly PlayerAction[],
  cursorMilli: number,
  historyMilli = 8_000,
  futureMilli = 8_000,
): PlayerActionWindow {
  const activeAction = [...actions].reverse().find((action) => (
    action.durationMilli > 0
    && action.startMilli <= cursorMilli
    && action.launchMilli > cursorMilli
  )) ?? null;
  const inFlightAction = [...actions].reverse().find((action) => (
    action.impactMilli !== null
    && action.launchMilli <= cursorMilli
    && action.impactMilli > cursorMilli
  )) ?? null;
  const nextAction = actions.find((action) => action.startMilli > cursorMilli) ?? null;
  const previousAction = [...actions].reverse().find((action) => (
    (action.impactMilli ?? action.launchMilli) <= cursorMilli
  )) ?? null;
  const windowStart = cursorMilli - historyMilli;
  const windowEnd = cursorMilli + futureMilli;

  return {
    activeAction,
    inFlightAction,
    nextAction,
    focusAction: activeAction ?? inFlightAction ?? nextAction ?? previousAction,
    visibleActions: actions.filter((action) => (
      (action.impactMilli ?? action.launchMilli) >= windowStart && action.startMilli <= windowEnd
    )),
  };
}
