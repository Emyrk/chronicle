/**
 * Parity with the server-side deaths and consumables summaries that chat agents
 * read (internal/services/serviceexternalapi/summary_test.go). Both tests run
 * the same fixture and check the same expectations, so the panels and the
 * server summaries cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import type { StreamType } from "@/hooks/instanceEvents";
import fixture from "./agentSummaryParity.fixture.json";
import type { ConsumableDisambiguation } from "@/api/typesGenerated";
import type { ConsumeProcessorEvent, ProcessorContext, ProcessorEvent } from "./processorTypes";
import { createDeathsProcessor, type DeathEvent } from "./Deaths/deaths.processor";
import { getSortedDeathLogEvents, isResurrectionEvent } from "./Deaths/deathLogEvents";
import { consumablesProcessor } from "./Consumables/consumables.processor";
import { aggregateConsumablesTotal } from "./Consumables/consumablesTotalLogic";
import { buildConsumableDisambiguationMap, resolveConsumableUse } from "./Consumables/consumableDisambiguation";

/** The server keeps the last 8 incoming damage events and landed heals in the 10 s before death. */
const RECAP_WINDOW_MS = 10_000;
const RECAP_ENTRIES = 8;

type FixtureEvent = Record<string, unknown> & { index: number; offsetMilli: number };
const streams = fixture.streams as unknown as Record<string, Record<string, FixtureEvent[]>>;

function meta(event: FixtureEvent) {
  return { index: event.index, offsetMilli: event.offsetMilli, activity: [], activityCount: 0, isSynthetic: false };
}

function damageEvent(event: FixtureEvent) {
  const tailers = (event.tailers as { amount: number; hitType: number }[] | undefined) ?? [];
  return {
    ...meta(event),
    type: "damage" as const,
    caster: (event.caster as string) ?? "",
    sourceName: (event.sourceName as string) ?? "",
    target: (event.target as string) ?? "",
    hitType: 0,
    amount: (event.amount as number) ?? 0,
    schools: [0],
    tailers,
    tailerCount: tailers.length,
    spellId: (event.spellId as number | undefined) ?? null,
    spellAttackOutcome: null,
    overkill: (event.overkill as number) ?? 0,
  };
}

function toProcessorEvent(stream: string, event: FixtureEvent): ProcessorEvent {
  switch (stream) {
    case "slain": {
      const attribution = event.attribution as FixtureEvent | undefined;
      return {
        ...meta(event),
        type: "slain",
        target: event.target as string,
        caster: (event.caster as string) ?? "",
        attribution: attribution ? damageEvent({ ...attribution, index: 0, offsetMilli: 0 }) : null,
      };
    }
    case "damage":
      return damageEvent(event);
    case "heal":
      return {
        ...meta(event),
        type: "heal",
        caster: event.caster as string,
        sourceName: event.sourceName as string,
        target: event.target as string,
        hitType: 0,
        amount: (event.amount as number) ?? 0,
        overheal: (event.overheal as number) ?? 0,
        absorbed: 0,
        schools: [0],
        spellId: null,
        spellAttackOutcome: null,
      };
    default: {
      const candidates = (event.candidateItemIds as number[] | undefined) ?? [];
      const consume: ConsumeProcessorEvent = {
        ...meta(event),
        type: "consume",
        consumeId: event.consumeId as string,
        evidenceId: event.evidenceId as string,
        player: event.player as string,
        itemId: (event.itemId as number | undefined) ?? null,
        itemName: (event.itemName as string | undefined) ?? null,
        candidateItemIds: candidates,
        candidateItemIdsCount: candidates.length,
        spell: { id: (event.spellId as number) ?? 0, name: (event.spellName as string) ?? "" },
        kind: event.kind as ConsumeProcessorEvent["kind"],
        confidence: event.confidence as ConsumeProcessorEvent["confidence"],
        consumedAtUnixMilli: null,
        observedAtUnixMilli: event.observedAtUnixMilli as number,
        amount: null,
        resourceType: null,
        isProjection: (event.isProjection as boolean | undefined) ?? false,
      };
      return consume;
    }
  }
}

function context(selected: string[]): ProcessorContext {
  return {
    players: fixture.players,
    units: Object.fromEntries(Object.entries(fixture.units).map(([id, name]) => [id, { name, owner: null, entry: 0 }])),
    selectedEncounterIds: new Set(selected),
    entitySelection: { enemyIds: new Set(), playerIds: new Set() },
  };
}

/** Feed streams like the worker: encounter by encounter, interleaved by event index. */
function run<T>(
  processor: { createState: () => T; processEvent: (...args: never[]) => void },
  streamNames: StreamType[],
  ctx: ProcessorContext,
): T {
  const state = processor.createState();
  const processEvent = processor.processEvent as unknown as (
    state: T, event: ProcessorEvent, encounterID: string, first: Date, stream: StreamType, ctx: ProcessorContext,
  ) => void;
  for (const encounter of fixture.encounters) {
    const events = streamNames.flatMap((stream) =>
      (streams[stream]?.[encounter.id] ?? []).map((event) => ({ stream, event })),
    );
    events.sort((a, b) => a.event.index - b.event.index);
    for (const { stream, event } of events) {
      processEvent(state, toProcessorEvent(stream, event), encounter.id, new Date(encounter.startUnixMilli), stream, ctx);
    }
  }
  return state;
}

function serverRecap(death: DeathEvent) {
  return death.recap
    .filter((entry) => entry.offsetMilli >= death.offsetMilli - RECAP_WINDOW_MS)
    .filter((entry) => entry.type === "damage" || (entry.type === "heal" && entry.amount > 0))
    .slice(-RECAP_ENTRIES)
    .map((entry) => ({ offsetMilli: entry.offsetMilli, type: entry.type, ability: entry.sourceName, amount: entry.amount }));
}

describe("agent summary parity fixture", () => {
  it("matches the Deaths panel per pull: order, killer, killing blow and recap", () => {
    const allEncounters = fixture.encounters.map((encounter) => encounter.id);
    const result = run(createDeathsProcessor(), ["slain", "damage", "heal"], context(allEncounters));

    for (const [encounterID, expected] of Object.entries(fixture.expected.deaths)) {
      const deaths = getSortedDeathLogEvents([encounterID], result, "players")
        .filter((event): event is DeathEvent => !isResurrectionEvent(event))
        .map((death) => ({
          player: death.playerName,
          offsetMilli: death.offsetMilli,
          killer: death.killerName,
          killingBlow: death.attribution?.sourceName ?? null,
          amount: death.attribution?.amount ?? 0,
          recap: serverRecap(death),
        }));
      expect(deaths, encounterID).toEqual(expected);
    }
  });

  it("matches the Consumables panel per-player counts for each pull and the whole instance", () => {
    const disambiguations = buildConsumableDisambiguationMap(fixture.disambiguations as ConsumableDisambiguation[]);
    const scopes: Record<string, string[]> = { all: fixture.encounters.map((encounter) => encounter.id) };
    for (const encounter of fixture.encounters) {
      if (encounter.boss) scopes[encounter.id] = [encounter.id];
    }

    for (const [scope, selected] of Object.entries(scopes)) {
      const state = run(consumablesProcessor, ["consume"], context(selected));
      const rows = aggregateConsumablesTotal([...state.uses.values()].map((use) => resolveConsumableUse(use, disambiguations)));
      const byPlayer = Object.fromEntries(rows.map((row) => [
        fixture.players[row.playerId as keyof typeof fixture.players].name,
        Object.fromEntries(row.consumes.map((consume) => [consume.key, consume.count])),
      ]));
      expect(byPlayer, scope).toEqual((fixture.expected.consumables as Record<string, unknown>)[scope]);
    }
  });
});
