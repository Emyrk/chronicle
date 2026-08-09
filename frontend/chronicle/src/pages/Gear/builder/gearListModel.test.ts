import { describe, expect, it } from "vitest";
import {
  addAlternate,
  addStage,
  clearSlot,
  collectItemIds,
  fillStageFromOutfit,
  GEAR_PAYLOAD_VERSION,
  MAX_ALTERNATES,
  MAX_STAGES,
  moveStage,
  parsePayload,
  promoteAlternate,
  removeAlternate,
  removeStage,
  serializePayload,
  setAlternateNote,
  setSlotEnchant,
  setSlotItem,
  setSlotNote,
  SLOT,
  SLOT_COUNT,
  SLOT_INVENTORY_TYPES,
  type GearPayload,
  setStageLevel,
} from "./gearListModel";

const doc = (stages: GearPayload["stages"]): GearPayload => ({
  version: GEAR_PAYLOAD_VERSION,
  stages,
});

describe("parsePayload", () => {
  it("parses a v2 document from a string", () => {
    const parsed = parsePayload(
      JSON.stringify({
        version: 2,
        stages: [
          {
            name: "Pre-Raid",
            slots: {
              "0": { item_id: 16921, enchant_id: 2543, note: "n", alternates: [{ item_id: 5, note: "a" }] },
            },
          },
        ],
      }),
    );
    expect(parsed.stages).toHaveLength(1);
    expect(parsed.stages[0].slots["0"]).toEqual({
      item_id: 16921,
      enchant_id: 2543,
      note: "n",
      alternates: [{ item_id: 5, note: "a" }],
    });
  });

  it("parses an already-decoded object", () => {
    const parsed = parsePayload({ version: 2, stages: [{ name: "s", slots: {} }] });
    expect(parsed.stages).toHaveLength(1);
  });

  it("migrates legacy v1 bare item IDs", () => {
    const parsed = parsePayload({ stages: [{ name: "old", slots: { "0": 16921, "5": 123 } }] });
    expect(parsed.stages[0].slots["0"]).toEqual({ item_id: 16921 });
    expect(parsed.stages[0].slots["5"]).toEqual({ item_id: 123 });
    expect(parsed.version).toBe(GEAR_PAYLOAD_VERSION);
  });

  it.each([
    ["null", null],
    ["number", 42],
    ["bad JSON string", "{nope"],
    ["missing stages", {}],
    ["stages not array", { stages: {} }],
  ])("degrades to empty document for %s", (_label, input) => {
    expect(parsePayload(input)).toEqual({ version: GEAR_PAYLOAD_VERSION, stages: [] });
  });

  it("drops invalid slot keys and invalid entries", () => {
    const parsed = parsePayload({
      version: 2,
      stages: [
        {
          name: "s",
          slots: {
            "19": { item_id: 1 }, // out of range
            head: { item_id: 1 }, // not a number
            "0": { item_id: 0 }, // invalid item
            "1": { item_id: -3 }, // invalid item
            "2": { item_id: 7 },
          },
        },
      ],
    });
    expect(Object.keys(parsed.stages[0].slots)).toEqual(["2"]);
  });

  it("parses a valid stage level and drops invalid ones", () => {
    const doc = parsePayload({
      version: 2,
      stages: [
        { name: "A", slots: {}, level: 39 },
        { name: "B", slots: {}, level: 0 },
        { name: "C", slots: {}, level: 42.5 },
        { name: "D", slots: {}, level: 101 },
        { name: "E", slots: {} },
      ],
    });
    expect(doc.stages.map((s) => s.level)).toEqual([39, undefined, undefined, undefined, undefined]);
  });

  it("round-trips a stage level through serializePayload", () => {
    const doc = parsePayload({ version: 2, stages: [{ name: "A", slots: {}, level: 55 }] });
    expect(parsePayload(serializePayload(doc))).toEqual(doc);
  });

  it("round-trips through serializePayload", () => {
    const payload = doc([{ name: "a", slots: { "0": { item_id: 1 } } }]);
    expect(parsePayload(serializePayload(payload))).toEqual(payload);
  });
});

describe("collectItemIds", () => {
  it("collects unique IDs including alternates across stages", () => {
    const payload = doc([
      { name: "a", slots: { "0": { item_id: 1, alternates: [{ item_id: 2 }, { item_id: 3 }] } } },
      { name: "b", slots: { "0": { item_id: 1 }, "4": { item_id: 3 } } },
    ]);
    expect(collectItemIds(payload).sort()).toEqual([1, 2, 3]);
  });
});

describe("fillStageFromOutfit", () => {
  const equipped: ({ item_id: number; enchant_id?: number } | undefined)[] = [];
  equipped[SLOT.head] = { item_id: 100, enchant_id: 55 };
  equipped[SLOT.chest] = { item_id: 200 };
  equipped[SLOT.mainHand] = { item_id: 300 };

  it("fills empty slots with item and enchant, keeping existing picks", () => {
    const payload = doc([
      { name: "a", slots: { [String(SLOT.chest)]: { item_id: 999, note: "keep" } } },
    ]);
    const next = fillStageFromOutfit(payload, 0, equipped);
    expect(next.stages[0].slots[String(SLOT.head)]).toEqual({ item_id: 100, enchant_id: 55 });
    expect(next.stages[0].slots[String(SLOT.mainHand)]).toEqual({ item_id: 300 });
    // Existing pick untouched without overwrite.
    expect(next.stages[0].slots[String(SLOT.chest)]).toEqual({ item_id: 999, note: "keep" });
  });

  it("overwrite replaces items but preserves notes and alternates", () => {
    const payload = doc([
      {
        name: "a",
        slots: {
          [String(SLOT.chest)]: { item_id: 999, enchant_id: 7, note: "keep", alternates: [{ item_id: 5 }] },
        },
      },
    ]);
    const next = fillStageFromOutfit(payload, 0, equipped, true);
    expect(next.stages[0].slots[String(SLOT.chest)]).toEqual({
      item_id: 200,
      note: "keep",
      alternates: [{ item_id: 5 }],
    });
  });

  it("ignores out-of-range stage index", () => {
    const payload = doc([{ name: "a", slots: {} }]);
    expect(fillStageFromOutfit(payload, 5, equipped)).toBe(payload);
  });
});

describe("stage operations", () => {
  it("addStage copies the previous stage's slots", () => {
    const payload = doc([{ name: "a", slots: { "0": { item_id: 1 } } }]);
    const next = addStage(payload);
    expect(next.stages).toHaveLength(2);
    expect(next.stages[1].name).toBe("Stage 2");
    expect(next.stages[1].slots).toEqual(payload.stages[0].slots);
    // Deep copy, not shared references.
    expect(next.stages[1].slots["0"]).not.toBe(payload.stages[0].slots["0"]);
  });

  it("setStageLevel sets, replaces, and clears a stage's level", () => {
    const doc = parsePayload({ version: 2, stages: [{ name: "A", slots: {} }] });
    const set = setStageLevel(doc, 0, 40);
    expect(set.stages[0].level).toBe(40);
    const replaced = setStageLevel(set, 0, 55);
    expect(replaced.stages[0].level).toBe(55);
    const cleared = setStageLevel(replaced, 0, undefined);
    expect("level" in cleared.stages[0]).toBe(false);
    // Other stages and the input are untouched.
    expect(doc.stages[0].level).toBeUndefined();
  });

  it("addStage on an empty document starts blank", () => {
    const next = addStage(doc([]), "Fresh 60");
    expect(next.stages).toEqual([{ name: "Fresh 60", slots: {} }]);
  });

  it("addStage refuses beyond MAX_STAGES", () => {
    const payload = doc(Array.from({ length: MAX_STAGES }, (_, i) => ({ name: `s${i}`, slots: {} })));
    expect(addStage(payload)).toBe(payload);
  });

  it("removeStage and moveStage", () => {
    const payload = doc([
      { name: "a", slots: {} },
      { name: "b", slots: {} },
      { name: "c", slots: {} },
    ]);
    expect(removeStage(payload, 1).stages.map((s) => s.name)).toEqual(["a", "c"]);
    expect(moveStage(payload, 0, 2).stages.map((s) => s.name)).toEqual(["b", "c", "a"]);
    expect(moveStage(payload, 0, 5)).toBe(payload);
  });
});

describe("slot operations", () => {
  const base = doc([
    {
      name: "a",
      slots: {
        "0": { item_id: 10, enchant_id: 99, note: "keep me", alternates: [{ item_id: 20, note: "alt" }] },
      },
    },
  ]);

  it("setSlotItem replaces the item, drops the enchant, keeps note/alternates", () => {
    const next = setSlotItem(base, 0, 0, 30);
    expect(next.stages[0].slots["0"]).toEqual({
      item_id: 30,
      note: "keep me",
      alternates: [{ item_id: 20, note: "alt" }],
    });
  });

  it("setSlotItem removes the equipped item from alternates", () => {
    const next = setSlotItem(base, 0, 0, 20);
    expect(next.stages[0].slots["0"]).toEqual({ item_id: 20, note: "keep me" });
  });

  it("setSlotItem fills an empty slot", () => {
    const next = setSlotItem(base, 0, SLOT.chest, 55);
    expect(next.stages[0].slots[String(SLOT.chest)]).toEqual({ item_id: 55 });
  });

  it("clearSlot removes the entry entirely", () => {
    expect(clearSlot(base, 0, 0).stages[0].slots["0"]).toBeUndefined();
  });

  it("setSlotEnchant sets and clears", () => {
    const withEnchant = setSlotEnchant(base, 0, 0, 123);
    expect(withEnchant.stages[0].slots["0"]?.enchant_id).toBe(123);
    const cleared = setSlotEnchant(withEnchant, 0, 0, undefined);
    expect(cleared.stages[0].slots["0"]).not.toHaveProperty("enchant_id");
  });

  it("setSlotNote sets and clears", () => {
    const next = setSlotNote(base, 0, 0, "new note");
    expect(next.stages[0].slots["0"]?.note).toBe("new note");
    expect(setSlotNote(next, 0, 0, "").stages[0].slots["0"]).not.toHaveProperty("note");
  });
});

describe("alternates", () => {
  const base = doc([{ name: "a", slots: { "0": { item_id: 10, enchant_id: 5 } } }]);

  it("addAlternate appends; rejects duplicates, the primary, and overflow", () => {
    let next = addAlternate(base, 0, 0, 20);
    expect(next.stages[0].slots["0"]?.alternates).toEqual([{ item_id: 20 }]);
    expect(addAlternate(next, 0, 0, 20)).toEqual(next);
    expect(addAlternate(next, 0, 0, 10)).toEqual(next);
    for (let i = 0; i < MAX_ALTERNATES; i++) next = addAlternate(next, 0, 0, 100 + i);
    expect(next.stages[0].slots["0"]?.alternates).toHaveLength(MAX_ALTERNATES);
  });

  it("removeAlternate drops the array when empty", () => {
    const withAlt = addAlternate(base, 0, 0, 20);
    const next = removeAlternate(withAlt, 0, 0, 20);
    expect(next.stages[0].slots["0"]).not.toHaveProperty("alternates");
  });

  it("setAlternateNote sets and clears", () => {
    const withAlt = addAlternate(base, 0, 0, 20);
    const noted = setAlternateNote(withAlt, 0, 0, 20, "when cheaper");
    expect(noted.stages[0].slots["0"]?.alternates).toEqual([{ item_id: 20, note: "when cheaper" }]);
    const cleared = setAlternateNote(noted, 0, 0, 20, "");
    expect(cleared.stages[0].slots["0"]?.alternates).toEqual([{ item_id: 20 }]);
  });

  it("promoteAlternate swaps primary and alternate, dropping the enchant", () => {
    const withAlts = addAlternate(addAlternate(base, 0, 0, 20), 0, 0, 30);
    const next = promoteAlternate(withAlts, 0, 0, 30);
    const entry = next.stages[0].slots["0"];
    expect(entry?.item_id).toBe(30);
    expect(entry?.alternates).toEqual([{ item_id: 20 }, { item_id: 10 }]);
    expect(entry).not.toHaveProperty("enchant_id");
  });
});

describe("SLOT_INVENTORY_TYPES", () => {
  it("covers every outfit slot", () => {
    for (let i = 0; i < SLOT_COUNT; i++) {
      expect(SLOT_INVENTORY_TYPES[i], `slot ${i}`).toBeDefined();
      expect(SLOT_INVENTORY_TYPES[i].length).toBeGreaterThan(0);
    }
  });

  it("maps weapons and robes correctly", () => {
    expect(SLOT_INVENTORY_TYPES[SLOT.chest]).toContain(20); // robe
    expect(SLOT_INVENTORY_TYPES[SLOT.mainHand]).toContain(17); // two-hand
    expect(SLOT_INVENTORY_TYPES[SLOT.offHand]).toContain(14); // shield
    expect(SLOT_INVENTORY_TYPES[SLOT.ranged]).toContain(26); // guns/wands
  });
});
