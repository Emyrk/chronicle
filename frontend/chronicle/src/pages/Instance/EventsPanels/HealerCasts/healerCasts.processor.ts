import type { StreamType } from "@/hooks/instanceEvents";
import type {
  HealProcessorEvent,
  PanelProcessor,
  ProcessorContext,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
  SpellStartProcessorEvent,
} from "../processorTypes";

export type HealerCastEvent =
  | SpellStartProcessorEvent
  | SpellGoProcessorEvent
  | SpellFailProcessorEvent
  | HealProcessorEvent;

export interface HealerCastEntry {
  timestampMilli: number;
  eventIndex: number;
  spellId: number | null;
  spellName: string;
  targetId: string;
  durationMilli: number;
  kind: "start" | "complete" | "fail" | "heal";
  amount: number;
  overheal: number;
  absorbed: number;
}

export interface HealerCastsEncounter {
  encounterId: string;
  startMilli: number;
  endMilli: number;
  castsByPlayer: Map<string, HealerCastEntry[]>;
}

export interface HealerCastsResult {
  encounters: Map<string, HealerCastsEncounter>;
}

export interface HealerCastImpact {
  effective: number;
  overheal: number;
  absorbed: number;
  targetIds: string[];
}

export interface HealerCastComposition {
  effectivePercent: number;
  overhealPercent: number;
}

export function healerCastComposition(impact: HealerCastImpact): HealerCastComposition {
  const effective = Math.max(0, impact.effective);
  const overheal = Math.max(0, impact.overheal);
  const total = effective + overheal;
  if (total <= 0) return { effectivePercent: 100, overhealPercent: 0 };

  const effectivePercent = effective / total * 100;
  return {
    effectivePercent,
    overhealPercent: 100 - effectivePercent,
  };
}

export interface HealerCastState {
  cast: HealerCastEntry | null;
  latest: HealerCastEntry | null;
  progress: number;
  status: "casting" | "completed" | "cancelled" | "idle";
  impact: HealerCastImpact | null;
  opacity: number;
  willCancel: boolean;
}

export interface NormalizedCastStart {
  offsetSeconds: number;
  placement: number;
}

export function normalizedCastStarts(
  states: readonly HealerCastState[],
): Array<NormalizedCastStart | null> {
  const starts = states.flatMap((state) => state.cast ? [state.cast.timestampMilli] : []);
  if (starts.length === 0) return states.map(() => null);
  const orderedStarts = [...new Set(starts)].sort((a, b) => a - b);
  const earliest = orderedStarts[0];
  const placements = new Map(orderedStarts.map((timestamp, index) => [timestamp, index + 1]));

  return states.map((state) => state.cast ? {
    offsetSeconds: (state.cast.timestampMilli - earliest) / 1_000,
    placement: placements.get(state.cast.timestampMilli) ?? orderedStarts.length,
  } : null);
}

export function normalizedCastStartOffsets(
  states: readonly HealerCastState[],
): Array<number | null> {
  return normalizedCastStarts(states).map((start) => start?.offsetSeconds ?? null);
}

export const CAST_FEEDBACK_MILLI = 1_500;
const HEAL_MATCH_MILLI = 300;

function compareCasts(a: HealerCastEntry, b: HealerCastEntry): number {
  return a.timestampMilli - b.timestampMilli || a.eventIndex - b.eventIndex;
}

export function selectHealerCastsEncounter(
  encounters: Map<string, HealerCastsEncounter>,
  selectedEncounterIds: string[],
  cursorMilli: number | null,
): HealerCastsEncounter | null {
  const selected = selectedEncounterIds
    .map((id) => encounters.get(id))
    .filter((encounter): encounter is HealerCastsEncounter => encounter !== undefined)
    .sort((a, b) => a.startMilli - b.startMilli);
  if (selected.length === 0) return null;
  if (cursorMilli === null) return selected[selected.length - 1];
  return [...selected].reverse().find((encounter) => encounter.startMilli <= cursorMilli) ?? selected[0];
}

function matchingStart(
  events: readonly HealerCastEntry[],
  terminal: HealerCastEntry,
): HealerCastEntry | null {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.timestampMilli > terminal.timestampMilli) continue;
    if (event.kind === "start" && event.spellId === terminal.spellId) return event;
  }
  return null;
}

function matchingFailure(
  events: readonly HealerCastEntry[],
  start: HealerCastEntry,
): HealerCastEntry | null {
  const castEndMilli = start.timestampMilli + start.durationMilli;
  const nextStart = events.find((event) =>
    event.kind === "start"
    && (event.timestampMilli > start.timestampMilli
      || (event.timestampMilli === start.timestampMilli && event.eventIndex > start.eventIndex)),
  );
  return events.find((event) =>
    event.kind === "fail"
    && event.spellId === start.spellId
    && event.timestampMilli >= start.timestampMilli
    && event.timestampMilli <= castEndMilli
    && (!nextStart || event.timestampMilli <= nextStart.timestampMilli),
  ) ?? null;
}

function matchingCompletion(
  events: readonly HealerCastEntry[],
  start: HealerCastEntry,
): HealerCastEntry | null {
  const nextStart = events.find((event) =>
    event.kind === "start"
    && (event.timestampMilli > start.timestampMilli
      || (event.timestampMilli === start.timestampMilli && event.eventIndex > start.eventIndex)),
  );
  return events.find((event) =>
    event.kind === "complete"
    && event.spellId === start.spellId
    && event.timestampMilli >= start.timestampMilli
    && (!nextStart || event.timestampMilli <= nextStart.timestampMilli),
  ) ?? null;
}

function castImpact(
  events: readonly HealerCastEntry[],
  completion: HealerCastEntry,
): HealerCastImpact | null {
  const heals = events.filter((event) =>
    event.kind === "heal"
    && event.spellId === completion.spellId
    && Math.abs(event.timestampMilli - completion.timestampMilli) <= HEAL_MATCH_MILLI,
  );
  if (heals.length === 0) return null;

  return {
    effective: heals.reduce((sum, event) => sum + Math.max(0, event.amount - event.overheal), 0),
    overheal: heals.reduce((sum, event) => sum + event.overheal, 0),
    absorbed: heals.reduce((sum, event) => sum + event.absorbed, 0),
    targetIds: [...new Set(heals.map((event) => event.targetId).filter(Boolean))],
  };
}

export function healerCastStateAt(
  events: readonly HealerCastEntry[],
  cursorMilli: number,
): HealerCastState {
  const ordered = [...events].sort(compareCasts);
  const elapsed = ordered.filter((event) => event.timestampMilli <= cursorMilli);
  const castEvents = elapsed.filter((event) => event.kind !== "heal");
  const starts = castEvents.filter((event) => event.kind === "start");
  const latest = castEvents[castEvents.length - 1] ?? null;

  for (let index = starts.length - 1; index >= 0; index--) {
    const start = starts[index];
    if (start.durationMilli <= 0) continue;
    const endMilli = start.timestampMilli + start.durationMilli;
    if (cursorMilli >= endMilli) continue;

    const stopped = castEvents.some((event) =>
      event.timestampMilli >= start.timestampMilli
      && event.timestampMilli <= cursorMilli
      && event.eventIndex > start.eventIndex
      && (
        event.kind === "start"
        || (event.spellId === start.spellId && (event.kind === "complete" || event.kind === "fail"))
      ),
    );
    if (stopped) continue;

    const completion = matchingCompletion(ordered, start);
    return {
      cast: start,
      latest,
      progress: Math.max(0, Math.min(1, (cursorMilli - start.timestampMilli) / start.durationMilli)),
      status: "casting",
      impact: completion ? castImpact(ordered, completion) : null,
      opacity: 1,
      willCancel: matchingFailure(ordered, start) !== null,
    };
  }

  const terminal = [...castEvents].reverse().find((event) => event.kind === "complete" || event.kind === "fail");
  const terminalAgeMilli = terminal ? cursorMilli - terminal.timestampMilli : Number.POSITIVE_INFINITY;
  if (terminal && terminalAgeMilli < CAST_FEEDBACK_MILLI) {
    const start = matchingStart(castEvents, terminal);
    const duration = start?.durationMilli ?? 0;
    const progress = terminal.kind === "complete"
      ? 1
      : duration > 0
        ? Math.max(0, Math.min(1, (terminal.timestampMilli - start!.timestampMilli) / duration))
        : 0;
    return {
      cast: start ?? terminal,
      latest,
      progress,
      status: terminal.kind === "complete" ? "completed" : "cancelled",
      impact: terminal.kind === "complete" ? castImpact(ordered, terminal) : null,
      opacity: Math.max(0, 1 - terminalAgeMilli / CAST_FEEDBACK_MILLI),
      willCancel: terminal.kind === "fail",
    };
  }

  return {
    cast: null,
    latest,
    progress: 0,
    status: "idle",
    impact: null,
    opacity: 0,
    willCancel: false,
  };
}

export function isTransientOffHealer(state: HealerCastState): boolean {
  return state.status !== "idle"
    && state.impact !== null
    && state.impact.effective > 0;
}

function getEncounter(
  state: HealerCastsResult,
  encounterId: string,
  firstTimestamp: Date,
): HealerCastsEncounter {
  let encounter = state.encounters.get(encounterId);
  if (!encounter) {
    encounter = {
      encounterId,
      startMilli: firstTimestamp.getTime(),
      endMilli: firstTimestamp.getTime(),
      castsByPlayer: new Map(),
    };
    state.encounters.set(encounterId, encounter);
  }
  return encounter;
}

export const healerCastsProcessor: PanelProcessor<HealerCastsResult, HealerCastEvent> = {
  id: "healer_casts",
  streams: ["spell_start", "spell_go", "spell_fail", "heal"] as StreamType[],
  createState: () => ({ encounters: new Map() }),
  processEvent(
    state: HealerCastsResult,
    event: HealerCastEvent,
    encounterId: string,
    firstTimestamp: Date,
    _streamType: StreamType,
    context: ProcessorContext,
  ) {
    if (!encounterId || !context.selectedEncounterIds.has(encounterId)) return;
    if (!context.players[event.caster]) return;

    const selectedPlayers = context.entitySelection.playerIds;
    if (selectedPlayers.size > 0 && !selectedPlayers.has(event.caster)) return;

    const encounter = getEncounter(state, encounterId, firstTimestamp);
    const timestampMilli = firstTimestamp.getTime() + event.offsetMilli;
    encounter.endMilli = Math.max(encounter.endMilli, timestampMilli);

    let casts = encounter.castsByPlayer.get(event.caster);
    if (!casts) {
      casts = [];
      encounter.castsByPlayer.set(event.caster, casts);
    }

    if (event.type === "heal") {
      casts.push({
        timestampMilli,
        eventIndex: event.index,
        spellId: event.spellId,
        spellName: event.sourceName || "Healing",
        targetId: event.target,
        durationMilli: 0,
        kind: "heal",
        amount: Math.max(0, event.amount),
        overheal: Math.max(0, event.overheal),
        absorbed: Math.max(0, event.absorbed),
      });
      return;
    }

    const kind = event.type === "spell_start"
      ? "start"
      : event.type === "spell_go"
        ? "complete"
        : "fail";

    // When a cast completes or fails, backfill the duration on a matching
    // zero-duration start.  WotLK logs don't include cast time in
    // SPELL_CAST_START, so the only way to know the actual (talented/hasted)
    // cast duration is by measuring start→go or start→fail.
    //
    // Guard: only backfill if no other "start" event (any spell) sits between
    // the candidate and this event.  An intervening start means the candidate
    // was implicitly cancelled (player began a new cast), so it should stay
    // at duration 0 rather than spanning across unrelated casts.
    if (kind !== "start") {
      for (let i = casts.length - 1; i >= 0; i--) {
        const prev = casts[i];
        // Any intervening start (even a different spell) means the candidate
        // was implicitly cancelled — stop searching.
        if (prev.kind === "start" && prev.spellId !== event.spell.id) break;
        if (prev.kind === "start" && prev.spellId === event.spell.id && prev.durationMilli === 0) {
          prev.durationMilli = timestampMilli - prev.timestampMilli;
          break;
        }
      }
    }

    casts.push({
      timestampMilli,
      eventIndex: event.index,
      spellId: event.spell.id,
      spellName: event.spell.name,
      targetId: event.type === "spell_fail" ? "" : event.target,
      durationMilli: event.type === "spell_start"
        ? Math.max(event.castTimeMilli, event.channelTimeMilli, 0)
        : 0,
      kind,
      amount: 0,
      overheal: 0,
      absorbed: 0,
    });
  },
};
