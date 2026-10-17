import { describe, expect, it } from "vitest";
import { HitTypeCrit, HitTypeHit, HitTypeMainHand, HitTypeMiss, HitTypePeriodic } from "@/lib/hittype/hittype";
import type { DamageProcessorEvent, ProcessorContext, UnitPositionProcessorEvent, UnitResourcesProcessorEvent } from "../processorTypes";
import { mapProcessor, type MapProcessorEvent } from "./map.processor";

const context: ProcessorContext = {
  players: {},
  units: {},
  selectedEncounterIds: new Set(["encounter"]),
  entitySelection: { enemyIds: new Set(), playerIds: new Set() },
};

function position(unit: string, offsetMilli: number, x: number, y: number, z?: number): UnitPositionProcessorEvent {
  return {
    type: "unit_position",
    index: offsetMilli,
    offsetMilli,
    unit,
    x,
    y,
    ...(z === undefined ? {} : { z }),
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

    mapProcessor.processEvent(state, position("player", 100, 10, 20, 5), "encounter", start, "unit_position", context);
    mapProcessor.processEvent(state, position("enemy", 150, 30, 40), "encounter", start, "unit_position", context);
    mapProcessor.processEvent(state, position("player", 200, 11, 22), "encounter", start, "unit_position", context);

    const encounter = state.encounters.get("encounter");
    expect(encounter?.startMs).toBe(start.getTime());
    expect(encounter?.endMs).toBe(start.getTime() + 200);
    expect(encounter?.positionsByUnit.get("player")).toEqual([
      { timestampMs: start.getTime() + 100, x: 10, y: 20, z: 5, mapId: 533, facing: 1.5 },
      { timestampMs: start.getTime() + 200, x: 11, y: 22, mapId: 533, facing: 1.5 },
    ]);
    expect(encounter?.positionsByUnit.get("enemy")).toHaveLength(1);
  });

  it("keeps facing out of samples whose event has none", () => {
    const state = mapProcessor.createState();
    const start = new Date("2026-10-07T20:00:00Z");
    mapProcessor.processEvent(state, { ...position("player", 100, 10, 20), facing: undefined }, "encounter", start, "unit_position", context);
    expect(state.encounters.get("encounter")?.positionsByUnit.get("player")?.[0]).not.toHaveProperty("facing");
  });

  it("retains unselected encounters for travel between selected fights", () => {
    const state = mapProcessor.createState();
    mapProcessor.processEvent(
      state,
      position("player", 100, 10, 20),
      "other",
      new Date("2026-10-07T20:00:00Z"),
      "unit_position",
      context,
    );
    expect(state.encounters.get("other")?.positionsByUnit.get("player")).toHaveLength(1);
  });

  describe("effects", () => {
    const start = new Date("2026-10-07T20:00:00Z");
    const meta = { index: 0, offsetMilli: 500, activity: [], activityCount: 0, isSynthetic: false };

    function effectsOf(event: MapProcessorEvent) {
      const state = mapProcessor.createState();
      mapProcessor.processEvent(state, event, "encounter", start, event.type, context);
      return state.encounters.get("encounter")?.effects;
    }

    it("records landed damage with school, crit, periodic and attack kind", () => {
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
        attack: "spell",
        spellId: 133,
      })]);
      expect(effectsOf({ ...damage, spellId: null, hitType: HitTypeHit })?.events[0]).toMatchObject({ attack: "swing", crit: false });
      expect(effectsOf({ ...damage, hitType: HitTypeMiss })?.events).toEqual([]);
    });

    describe("attack classification", () => {
      const hit: DamageProcessorEvent = {
        ...meta,
        type: "damage",
        caster: "attacker",
        sourceName: "",
        target: "boss",
        hitType: HitTypeHit,
        amount: 500,
        schools: [2],
        tailers: [],
        tailerCount: 0,
        spellId: null,
        spellAttackOutcome: null,
        overkill: 0,
      };

      // Places the attacker `distance` yards from the boss before the hit.
      function attackOf(event: DamageProcessorEvent, distance: number | null) {
        const state = mapProcessor.createState();
        if (distance !== null) {
          mapProcessor.processEvent(state, position("boss", 100, 0, 0), "encounter", start, "unit_position", context);
          mapProcessor.processEvent(state, position("attacker", 100, distance, 0), "encounter", start, "unit_position", context);
        }
        mapProcessor.processEvent(state, event, "encounter", start, "damage", context);
        return state.encounters.get("encounter")!.effects.events[0].attack;
      }

      it.each([
        { name: "Auto Attack", event: { ...hit, spellId: 6603, sourceName: "Auto Attack" }, distance: 30, attack: "swing" },
        { name: "a main-hand flagged hit", event: { ...hit, spellId: 1, hitType: HitTypeHit | HitTypeMainHand }, distance: null, attack: "swing" },
        { name: "Auto Shot", event: { ...hit, spellId: 75, sourceName: "Auto Shot" }, distance: 2, attack: "ranged_auto" },
        { name: "wand Shoot", event: { ...hit, spellId: 5019, schools: [7], sourceName: "Shoot" }, distance: 25, attack: "ranged_auto" },
        { name: "Heroic Strike in melee range", event: { ...hit, spellId: 78, sourceName: "Heroic Strike" }, distance: 4, attack: "melee_ability" },
        { name: "Aimed Shot at range", event: { ...hit, spellId: 19434, sourceName: "Aimed Shot" }, distance: 30, attack: "spell" },
        { name: "a physical ability with unknown positions", event: { ...hit, spellId: 78 }, distance: null, attack: "spell" },
        { name: "Frostbolt in melee range", event: { ...hit, spellId: 116, schools: [6], sourceName: "Frostbolt" }, distance: 3, attack: "spell" },
        { name: "a hit without spell data far away", event: hit, distance: 30, attack: "ranged_auto" },
        { name: "a hit without spell data or positions", event: hit, distance: null, attack: "swing" },
      ])("classifies $name as $attack", ({ event, distance, attack }) => {
        expect(attackOf(event, distance)).toBe(attack);
      });
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

    it("records interrupts with the interrupted spell, if known", () => {
      const interrupt = {
        ...meta,
        type: "interrupt" as const,
        caster: "rogue",
        target: "boss",
        spellName: "Shadow Bolt",
        extraSpellId: 686,
        extraSchools: [7],
      };
      expect(effectsOf(interrupt)?.events[0])
        .toMatchObject({ kind: "interrupt", source: "rogue", target: "boss", spellId: 686, spellName: "Shadow Bolt" });
      expect(effectsOf({ ...interrupt, extraSpellId: 0, spellName: "" })?.events[0]).toMatchObject({ spellId: null, spellName: "" });
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
  describe("health", () => {
    const start = new Date("2026-10-07T20:00:00Z");

    function resources(unit: string, offsetMilli: number, currentHealth: number, absorb = 0, currentPower = 0): UnitResourcesProcessorEvent {
      return {
        type: "unit_resources",
        index: offsetMilli,
        offsetMilli,
        activity: [],
        activityCount: 0,
        isSynthetic: false,
        unit,
        currentHealth,
        maximumHealth: 1000,
        absorb,
        powerType: "Mana",
        currentPower,
        maximumPower: 500,
        attackPower: 0,
        spellPower: 0,
        unitLevel: null,
        averageItemLevel: null,
        armor: 0,
      };
    }

    it("requests unit_resources and keeps only health changes per unit", () => {
      expect(mapProcessor.streams).toContain("unit_resources");
      const state = mapProcessor.createState();
      for (const event of [resources("tank", 100, 1000), resources("tank", 200, 1000), resources("tank", 300, 800, 50), resources("boss", 300, 900)]) {
        mapProcessor.processEvent(state, event, "encounter", start, "unit_resources", context);
      }
      const encounter = state.encounters.get("encounter")!;
      expect(encounter.healthByUnit.get("tank")).toEqual([
        { timestampMs: start.getTime() + 100, current: 1000, max: 1000, absorb: 0 },
        { timestampMs: start.getTime() + 300, current: 800, max: 1000, absorb: 50 },
      ]);
      expect(encounter.healthByUnit.get("boss")).toHaveLength(1);
      expect(encounter.effects.events).toEqual([]);
    });
  });
});
