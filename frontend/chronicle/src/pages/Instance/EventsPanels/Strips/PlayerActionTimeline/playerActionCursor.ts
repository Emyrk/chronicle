import type { PlayerActionEvent } from "./playerActionTimeline.processor";

const TERMINAL_MATCH_GRACE_MILLI = 1_500;

export type PlayerActionOutcome = "completed" | "failed" | "unknown";

export interface PlayerAction {
  id: string;
  spellId: number;
  spellName: string;
  target: string;
  startMilli: number;
  endMilli: number;
  durationMilli: number;
  channeling: boolean;
  outcome: PlayerActionOutcome;
}

export interface PlayerActionWindow {
  activeAction: PlayerAction | null;
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

export function buildPlayerActions(events: readonly PlayerActionEvent[]): PlayerAction[] {
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

    const fallbackEnd = start.offsetMilli + expectedDuration;
    const endMilli = Math.max(start.offsetMilli, terminal?.offsetMilli ?? fallbackEnd);
    actions.push({
      id: `start:${start.eventIndex}`,
      spellId: start.spellId,
      spellName: start.spellName,
      target: terminal?.target || start.target,
      startMilli: start.offsetMilli,
      endMilli,
      durationMilli: Math.max(0, endMilli - start.offsetMilli),
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
      endMilli: terminal.offsetMilli,
      durationMilli: 0,
      channeling: false,
      outcome: terminalOutcome(terminal),
    });
  });

  return actions.sort((a, b) => a.startMilli - b.startMilli || a.endMilli - b.endMilli || a.id.localeCompare(b.id));
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
    && action.endMilli > cursorMilli
  )) ?? null;
  const nextAction = actions.find((action) => action.startMilli > cursorMilli) ?? null;
  const previousAction = [...actions].reverse().find((action) => action.endMilli <= cursorMilli) ?? null;
  const windowStart = cursorMilli - historyMilli;
  const windowEnd = cursorMilli + futureMilli;

  return {
    activeAction,
    nextAction,
    focusAction: activeAction ?? nextAction ?? previousAction,
    visibleActions: actions.filter((action) => action.endMilli >= windowStart && action.startMilli <= windowEnd),
  };
}
