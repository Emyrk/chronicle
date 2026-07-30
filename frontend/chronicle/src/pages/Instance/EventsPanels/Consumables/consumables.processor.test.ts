import { describe, expect, it } from "vitest";
import type { ConsumeProcessorEvent, ProcessorContext } from "../processorTypes";
import { consumableDisplayName, consumablesProcessor, consumablesTotalProcessor } from "./consumables.processor";
import { aggregateConsumablesTotal, filterConsumablesTotal, fuzzyConsumableMatch } from "./consumablesTotal";

function createContext(overrides?: Partial<ProcessorContext>): ProcessorContext {
  return {
    players: {
      p1: { name: "Sathite", class: "SHAMAN" },
      p2: { name: "Emyrk", class: "MAGE" },
    },
    selectedEncounterIds: new Set(["enc1", "enc2", "enc3"]),
    entitySelection: {
      enemyIds: new Set(),
      playerIds: new Set(),
    },
    ...overrides,
  };
}

let nextIndex = 0;
function consumeEvent(overrides: Partial<ConsumeProcessorEvent>): ConsumeProcessorEvent {
  return {
    type: "consume",
    index: nextIndex++,
    offsetMilli: 0,
    consumeId: "use-1",
    evidenceId: "ev-1",
    player: "p1",
    itemId: null,
    candidateItemIds: [],
    candidateItemIdsCount: 0,
    spell: { id: 0, name: "" },
    kind: 1,
    confidence: 1,
    consumedAtUnixMilli: null,
    observedAtUnixMilli: 1700000000000,
    amount: null,
    resourceType: null,
    isProjection: false,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    ...overrides,
  };
}

function process(events: ConsumeProcessorEvent[], context = createContext()) {
  const state = consumablesProcessor.createState();
  for (const ev of events) {
    const encounter = (ev as unknown as { encounterID?: string }).encounterID ?? "enc1";
    consumablesProcessor.processEvent(state, ev, encounter, new Date(0), "consume", context);
  }
  return state;
}

describe("consumablesProcessor", () => {
  it("counts one use from a single direct observation", () => {
    const state = process([
      consumeEvent({ itemId: 13444, spell: { id: 17531, name: "Major Mana Potion" } }),
    ]);
    expect(state.uses.size).toBe(1);
    const use = state.uses.get("use-1")!;
    expect(use.itemId).toBe(13444);
    expect(use.spellName).toBe("Major Mana Potion");
    expect(use.bestConfidence).toBe(1);
  });

  it("merges direct and aura evidence for one consumeId into one use", () => {
    const state = process([
      consumeEvent({ evidenceId: "ev-direct", kind: 1, confidence: 1, itemId: 13444 }),
      consumeEvent({
        evidenceId: "ev-aura",
        kind: 3,
        confidence: 2,
        spell: { id: 17531, name: "Mana Potion Buff" },
      }),
    ]);
    expect(state.uses.size).toBe(1);
    const use = state.uses.get("use-1")!;
    expect(use.itemId).toBe(13444);
    expect(use.spellName).toBe("Mana Potion Buff");
    expect(use.bestConfidence).toBe(1);
    expect(use.kinds.sort()).toEqual([1, 3]);
  });

  it("deduplicates projected copies by evidenceId across encounters", () => {
    // Two pre-pots projected into 3 + 6 encounters: nine observations, two uses.
    const events: ConsumeProcessorEvent[] = [];
    for (let i = 0; i < 3; i++) {
      events.push(Object.assign(
        consumeEvent({ consumeId: "pot-1", evidenceId: "pot-1-pull", kind: 7, confidence: 2, isProjection: true, candidateItemIds: [13444], candidateItemIdsCount: 1 }),
        { encounterID: `enc${i + 1}` },
      ));
    }
    for (let i = 0; i < 6; i++) {
      events.push(Object.assign(
        consumeEvent({ consumeId: "pot-2", evidenceId: "pot-2-pull", kind: 7, confidence: 2, isProjection: true, candidateItemIds: [13444], candidateItemIdsCount: 1 }),
        { encounterID: `enc${(i % 3) + 1}` },
      ));
    }
    const state = process(events);
    expect(state.seenEvidence.size).toBe(2);
    expect(state.uses.size).toBe(2);
  });

  it("counts separate uses separately", () => {
    const state = process([
      consumeEvent({ consumeId: "use-1", evidenceId: "ev-1", itemId: 13444 }),
      consumeEvent({ consumeId: "use-2", evidenceId: "ev-2", itemId: 13444 }),
    ]);
    expect(state.uses.size).toBe(2);
  });

  it("marks active-at-pull-only uses and clears the flag on real evidence", () => {
    const state = process([
      consumeEvent({ consumeId: "u", evidenceId: "e1", kind: 7, confidence: 2 }),
      consumeEvent({ consumeId: "u", evidenceId: "e2", kind: 1, confidence: 1, itemId: 5 }),
    ]);
    expect(state.uses.get("u")!.activeAtPullOnly).toBe(false);

    const pullOnly = process([
      consumeEvent({ consumeId: "v", evidenceId: "e3", kind: 7, confidence: 2 }),
    ]);
    expect(pullOnly.uses.get("v")!.activeAtPullOnly).toBe(true);
  });

  it("respects encounter selection", () => {
    const context = createContext({ selectedEncounterIds: new Set(["enc2"]) });
    const state = process(
      [Object.assign(consumeEvent({}), { encounterID: "enc1" })],
      context,
    );
    expect(state.uses.size).toBe(0);
  });

  it("respects player selection", () => {
    const context = createContext({
      entitySelection: { enemyIds: new Set(), playerIds: new Set(["p2"]) },
    });
    const state = process([consumeEvent({ player: "p1" })], context);
    expect(state.uses.size).toBe(0);
  });

  it("tracks unknown uses for diagnostics and clears them once identified", () => {
    const state = process([
      consumeEvent({ consumeId: "u", evidenceId: "e1", itemId: null }),
    ]);
    expect(state.unknownUseIds.has("u")).toBe(true);

    const identified = process([
      consumeEvent({ consumeId: "u", evidenceId: "e1", itemId: null }),
      consumeEvent({ consumeId: "u", evidenceId: "e2", itemId: 13444 }),
    ]);
    expect(identified.unknownUseIds.has("u")).toBe(false);
  });

  it("respects candidateItemIdsCount over array length", () => {
    const state = process([
      consumeEvent({
        candidateItemIds: [1, 2, 999],
        candidateItemIdsCount: 2,
      }),
    ]);
    expect(state.uses.get("use-1")!.candidateItemIds).toEqual([1, 2]);
  });

  it("records every deduplicated observation for the detail view", () => {
    const state = process([
      consumeEvent({ consumeId: "u", evidenceId: "e1", kind: 1, confidence: 1, itemId: 5 }),
      consumeEvent({ consumeId: "u", evidenceId: "e2", kind: 3, confidence: 2, amount: 1200, resourceType: "Mana" }),
      consumeEvent({ consumeId: "u", evidenceId: "e2", kind: 3, confidence: 2, isProjection: true }),
    ]);
    const use = state.uses.get("u")!;
    expect(use.observations).toHaveLength(2);
    expect(use.observations[1].amount).toBe(1200);
    expect(use.observations[1].resourceType).toBe("Mana");
  });

  it("prefers the consumed timestamp for display time", () => {
    const state = process([
      consumeEvent({ consumeId: "u", evidenceId: "e1", kind: 7, confidence: 2, observedAtUnixMilli: 1700000100000 }),
      consumeEvent({ consumeId: "u", evidenceId: "e2", kind: 1, confidence: 1, itemId: 5, consumedAtUnixMilli: 1699999990000 }),
    ]);
    const use = state.uses.get("u")!;
    expect(use.dateMilli).toBe(1699999990000);
  });

  it("derives display names with sensible fallbacks", () => {
    const base = process([consumeEvent({ spell: { id: 1, name: "Flask of the Titans" } })]).uses.get("use-1")!;
    expect(consumableDisplayName(base)).toBe("Flask of the Titans");

    const itemOnly = process([consumeEvent({ itemId: 13444 })]).uses.get("use-1")!;
    expect(consumableDisplayName(itemOnly)).toBe("Item 13444");

    const unknown = process([consumeEvent({})]).uses.get("use-1")!;
    expect(consumableDisplayName(unknown)).toBe("Unknown Consumable");
  });

  it("exposes the same aggregation under the totals panel ID", () => {
    expect(consumablesTotalProcessor.id).toBe("consumables_total");
    expect(consumablesTotalProcessor.streams).toEqual(["consume"]);
    expect(consumablesTotalProcessor.processEvent).toBe(consumablesProcessor.processEvent);
  });

  it("groups physical uses into per-player item counts", () => {
    const state = process([
      consumeEvent({ consumeId: "flask-1", evidenceId: "flask-1", player: "p1", itemId: 13510, spell: { id: 17626, name: "Flask of the Titans" } }),
      consumeEvent({ consumeId: "flask-2", evidenceId: "flask-2", player: "p1", itemId: 13510, spell: { id: 17626, name: "Flask of the Titans" } }),
      consumeEvent({ consumeId: "pot-1", evidenceId: "pot-1", player: "p1", itemId: 13444, spell: { id: 17531, name: "Major Mana Potion" } }),
      consumeEvent({ consumeId: "flask-3", evidenceId: "flask-3", player: "p2", itemId: 13510, spell: { id: 17626, name: "Flask of the Titans" } }),
    ]);

    expect(aggregateConsumablesTotal(state.uses.values())).toMatchObject([
      {
        playerId: "p1",
        total: 3,
        consumes: [
          { key: "item:13510", count: 2, itemId: 13510, candidateItemIds: [] },
          { key: "item:13444", count: 1, itemId: 13444, candidateItemIds: [] },
        ],
      },
      {
        playerId: "p2",
        total: 1,
        consumes: [
          { key: "item:13510", count: 1, itemId: 13510, candidateItemIds: [] },
        ],
      },
    ]);
  });

  it("sorts possible item groups after definite items regardless of count", () => {
    const state = process([
      consumeEvent({ consumeId: "known", evidenceId: "known", itemId: 13444 }),
      consumeEvent({ consumeId: "possible-1", evidenceId: "possible-1", candidateItemIds: [1, 2], candidateItemIdsCount: 2 }),
      consumeEvent({ consumeId: "possible-2", evidenceId: "possible-2", candidateItemIds: [1, 2], candidateItemIdsCount: 2 }),
    ]);

    const consumes = aggregateConsumablesTotal(state.uses.values())[0].consumes;
    expect(consumes.map((consume) => consume.key)).toEqual(["item:13444", "candidates:1,2"]);
    expect(consumes[1].count).toBe(2);
  });

  it("groups a single candidate with the known item and keeps ambiguous candidates separate", () => {
    const state = process([
      consumeEvent({ consumeId: "item-1", evidenceId: "item-1", candidateItemIds: [13444], candidateItemIdsCount: 1 }),
      consumeEvent({ consumeId: "item-2", evidenceId: "item-2", itemId: 13444 }),
      consumeEvent({
        consumeId: "item-3",
        evidenceId: "item-3",
        candidateItemIds: [2, 1],
        candidateItemIdsCount: 2,
        spell: { id: 17626, name: "Flask of the Titans" },
        kind: 3,
        confidence: 3,
      }),
    ]);

    expect(aggregateConsumablesTotal(state.uses.values())[0].consumes).toMatchObject([
      { key: "item:13444", count: 2, itemId: 13444, candidateItemIds: [] },
      {
        key: "candidates:1,2",
        count: 1,
        itemId: null,
        candidateItemIds: [1, 2],
        sources: [
          {
            consumeId: "item-3",
            spellId: 17626,
            spellName: "Flask of the Titans",
            kinds: [3],
            bestConfidence: 3,
          },
        ],
      },
    ]);
  });

  it("fuzzy matches case-insensitively and allows non-contiguous letters", () => {
    expect(fuzzyConsumableMatch("fOtT", ["Flask of the Titans"])).toBe(true);
    expect(fuzzyConsumableMatch("mana", ["Major Mana Potion"])).toBe(true);
    expect(fuzzyConsumableMatch("rage", ["Major Mana Potion"])).toBe(false);
  });

  it("filters definite and possible consumes by item names and effect names", () => {
    const state = process([
      consumeEvent({
        consumeId: "flask",
        evidenceId: "flask",
        player: "p1",
        itemId: 13510,
        spell: { id: 17626, name: "Flask of the Titans" },
      }),
      consumeEvent({
        consumeId: "food",
        evidenceId: "food",
        player: "p1",
        candidateItemIds: [13724, 20224, 20225],
        candidateItemIdsCount: 3,
        spell: { id: 25695, name: "Food" },
        kind: 7,
        confidence: 3,
      }),
    ]);
    const rows = aggregateConsumablesTotal(state.uses.values());
    const itemNames = new Map([
      [13510, "Flask of the Titans"],
      [13724, "Enriched Manna Biscuit"],
      [20224, "Defiler's Enriched Ration"],
      [20225, "Highlander's Enriched Ration"],
    ]);

    expect(filterConsumablesTotal(rows, "manna", itemNames)[0].consumes.map((consume) => consume.key))
      .toEqual(["candidates:13724,20224,20225"]);
    expect(filterConsumablesTotal(rows, "FOOD", itemNames)[0].consumes.map((consume) => consume.key))
      .toEqual(["candidates:13724,20224,20225"]);
    expect(filterConsumablesTotal(rows, "titan", itemNames)[0]).toMatchObject({
      total: 1,
      consumes: [{ key: "item:13510" }],
    });
    expect(filterConsumablesTotal(rows, "missing", itemNames)).toEqual([]);
  });
});
