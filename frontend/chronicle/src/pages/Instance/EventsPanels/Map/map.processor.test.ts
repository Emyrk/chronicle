import { describe, expect, it } from "vitest";
import { HitTypeCrit, HitTypeHit, HitTypeMiss, HitTypePeriodic } from "@/lib/hittype/hittype";
import type { ProcessorContext, UnitPositionProcessorEvent } from "../processorTypes";
import { mapProcessor, type MapProcessorEvent } from "./map.processor";

const context: ProcessorContext = {
  players: {},
  units: {},
  selectedEncounterIds: new Set(["encounter"]),
  entitySelection: { enemyIds: new Set(), playerIds: new Set() },
};

function position(unit: string, offsetMilli: number, x: number, y: number): UnitPositionProcessorEvent {
  return {
    type: "unit_position",
    index: offsetMilli,
    offsetMilli,
    unit,
    x,
    y,
    mapId: 533,
    facing: 1.5,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };
}

describe("mapProcessor", () => {
  it("retains an ordered position timeline for every unit", () => {
    const state = mapProcessor.createState();
    const start = new Date("2026-10-07T20:00:00Z");

    mapProcessor.processEvent(state, position("player", 100, 10, 20), "encounter", start, "unit_position", context);
    mapProcessor.processEvent(state, position("enemy", 150, 30, 40), "encounter", start, "unit_position", context);
    mapProcessor.processEvent(state, position("player", 200, 11, 22), "encounter", start, "unit_position", context);

    const encounter = state.encounters.get("encounter");
    expect(encounter?.startMs).toBe(start.getTime());
    expect(encounter?.endMs).toBe(start.getTime() + 200);
    expect(encounter?.positionsByUnit.get("player")).toEqual([
      { timestampMs: start.getTime() + 100, x: 10, y: 20, mapId: 533, facing: 1.5 },
      { timestampMs: start.getTime() + 200, x: 11, y: 22, mapId: 533, facing: 1.5 },
    ]);
    expect(encounter?.positionsByUnit.get("enemy")).toHaveLength(1);
  });

  it("ignores encounters outside the current selection", () => {
    const state = mapProcessor.createState();
    mapProcessor.processEvent(
      state,
      position("player", 100, 10, 20),
      "other",
      new Date("2026-10-07T20:00:00Z"),
      "unit_position",
      context,
    );
    expect(state.encounters.size).toBe(0);
  });

  describe("effects", () => {
    const start = new Date("2026-10-07T20:00:00Z");
    const meta = { index: 0, offsetMilli: 500, activity: [], activityCount: 0, isSynthetic: false };

    function effectsOf(event: MapProcessorEvent) {
      const state = mapProcessor.createState();
      mapProcessor.processEvent(state, event, "encounter", start, event.type, context);
      return state.encounters.get("encounter")?.effects;
    }

    it("records landed damage with school, crit, periodic and melee flags", () => {
      const damage = {
        ...meta,
        type: "damage" as const,
        caster: "mage",
        sourceName: "Fireball",
        target: "boss",
        hitType: HitTypeCrit | HitTypePeriodic,
        amount: 900,
        schools: [4],
        tailers: [],
        tailerCount: 0,
        spellId: 133,
        spellAttackOutcome: null,
        overkill: 0,
      };
      expect(effectsOf(damage)?.events).toEqual([expect.objectContaining({
        timestampMs: start.getTime() + 500,
        kind: "damage",
        source: "mage",
        target: "boss",
        school: 4,
        amount: 900,
        crit: true,
        periodic: true,
        melee: false,
        spellId: 133,
      })]);
      expect(effectsOf({ ...damage, spellId: null, hitType: HitTypeHit })?.events[0]).toMatchObject({ melee: true, crit: false });
      expect(effectsOf({ ...damage, hitType: HitTypeMiss })?.events).toEqual([]);
    });

    it("records heals", () => {
      const fx = effectsOf({
        ...meta,
        type: "heal",
        caster: "priest",
        sourceName: "Heal",
        target: "tank",
        hitType: HitTypeHit,
        amount: 1200,
        overheal: 0,
        absorbed: 0,
        schools: [3],
        spellId: 2054,
        spellAttackOutcome: null,
      });
      expect(fx?.events).toEqual([expect.objectContaining({ kind: "heal", source: "priest", target: "tank", school: 3 })]);
    });

    it("records cast starts with their cast time and AoE cast goes", () => {
      const spell = { id: 10, name: "Blizzard" };
      expect(effectsOf({
        ...meta,
        type: "spell_start",
        caster: "mage",
        target: "",
        spell,
        itemId: null,
        castFlags: 0,
        castTimeMilli: 2500,
        channelTimeMilli: 0,
        spellType: 0,
      })?.events[0]).toMatchObject({ kind: "cast_start", source: "mage", castTimeMs: 2500, spellId: 10 });
      const go = { ...meta, type: "spell_go" as const, caster: "mage", target: "", spell, numHits: 4, numMisses: 0, itemId: null, corpseOwner: null };
      expect(effectsOf(go)?.events[0]).toMatchObject({ kind: "cast_go", aoe: true });
      expect(effectsOf({ ...go, numHits: 1 })?.events[0]).toMatchObject({ aoe: false });
    });

    it("records interrupts", () => {
      expect(effectsOf({
        ...meta,
        type: "interrupt",
        caster: "rogue",
        target: "boss",
        spellName: "Shadow Bolt",
        extraSpellId: 686,
        extraSchools: [7],
      })?.events[0]).toMatchObject({ kind: "interrupt", source: "rogue", target: "boss" });
    });

    it("tracks deaths and resurrections per unit", () => {
      const state = mapProcessor.createState();
      mapProcessor.processEvent(state, { ...meta, type: "slain", target: "tank", caster: "boss", attribution: null }, "encounter", start, "slain", context);
      mapProcessor.processEvent(state, {
        ...meta,
        offsetMilli: 900,
        type: "ressurection",
        source: "priest",
        target: "tank",
        spell: { id: 2006, name: "Resurrection" },
      }, "encounter", start, "ressurection", context);
      const fx = state.encounters.get("encounter")!.effects;
      expect(fx.deathsByUnit.get("tank")).toEqual([start.getTime() + 500]);
      expect(fx.resurrectsByUnit.get("tank")).toEqual([start.getTime() + 900]);
    });
  });
});
