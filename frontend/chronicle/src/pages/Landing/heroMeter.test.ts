import { describe, expect, it } from "vitest";
import { HitTypeCrit, HitTypeHit } from "@/lib/hittype/hittype";
import { PANELS } from "@/pages/Instance/EventsPanels/EventsPanel";
import { createDamageDoneProcessor } from "@/pages/Instance/EventsPanels/DamageDone/damageDone.processor";
import { createUnifiedHealingProcessor } from "@/pages/Instance/EventsPanels/processors/healing.processor";
import type { DamageProcessorEvent, HealProcessorEvent, ProcessorContext } from "@/pages/Instance/EventsPanels/processorTypes";
import { PRESET_LAYOUTS } from "@/pages/Instance/presetLayouts";
import { playerBreakout } from "./heroBreakout";
import { meterTotals, RUN_PAGE_PANELS, runPageHref } from "./heroMeter";

describe("meterTotals", () => {
  it("ranks players by amount with rates over the pull and shares of the total", () => {
    const totals = meterTotals([
      { name: "Healer", className: "Priest", amount: 0 },
      { name: "Second", className: "Mage", amount: 10_000 },
      { name: "First", className: "Rogue", amount: 30_000 },
    ], 20_000);
    expect(totals.total).toBe(40_000);
    expect(totals.perSecond).toBe(2_000);
    expect(totals.rows).toEqual([
      { name: "First", className: "Rogue", perSecond: 1_500, share: 0.75 },
      { name: "Second", className: "Mage", perSecond: 500, share: 0.25 },
    ]);
  });
});

describe("playerBreakout", () => {
  const PLAYER = "0x0000000000001234";
  const BOSS = "0xF130000CE0000001";
  const ADD = "0xF130000CE0000002";
  const context: ProcessorContext = {
    players: { [PLAYER]: { name: "Vorn", class: "WARRIOR" }, "0x0000000000005678": { name: "Serah", class: "PRIEST" } },
    units: { [BOSS]: { name: "Boss", owner: null, entry: 1 }, [ADD]: { name: "Add", owner: null, entry: 2 } },
    selectedEncounterIds: new Set(["enc1"]),
    entitySelection: { enemyIds: new Set(), playerIds: new Set() },
    capabilities: ["overheal"],
  };

  function damage(offsetMilli: number, sourceName: string, amount: number, hitType: number, target = BOSS): DamageProcessorEvent {
    return {
      type: "damage", index: 0, offsetMilli, caster: PLAYER, sourceName, target, hitType, amount, schools: [1],
      tailers: [], tailerCount: 0, activity: [], activityCount: 0, isSynthetic: false, spellId: null, spellAttackOutcome: null, overkill: 0,
    };
  }

  it("sums a player's damage by ability up to the cursor, with crit % and targets", () => {
    const processor = createDamageDoneProcessor("players");
    const state = processor.createState();
    const events = [
      damage(1_000, "Mortal Strike", 3_000, HitTypeHit | HitTypeCrit),
      damage(2_000, "Melee", 1_000, HitTypeHit),
      damage(3_000, "Melee", 1_000, HitTypeHit, ADD),
      damage(4_000, "Whirlwind", 9_000, HitTypeHit),
    ];
    // The replay's cursor at 3 s: the processor stops there, as processIncrementally does.
    const cursorMs = 3_000;
    for (const event of events.filter((candidate) => candidate.offsetMilli <= cursorMs)) {
      processor.processEvent(state, event, "enc1", new Date(0), "damage", context);
    }
    const breakout = playerBreakout({
      abilities: state.ByAbility.get(PLAYER),
      raidTotal: 10_000,
      elapsedMs: cursorMs,
      targets: state.ByTarget.get(PLAYER)?.size ?? 0,
      limit: 5,
    });
    expect(breakout).toEqual({
      total: 5_000,
      perSecond: 5_000 / 3,
      raidShare: 0.5,
      abilities: [
        { name: "Mortal Strike", perSecond: 1_000, share: 0.6 },
        { name: "Melee", perSecond: 2_000 / 3, share: 0.4 },
      ],
      facts: [{ label: "crit", value: "33%" }, { label: "targets", value: "2" }],
    });
  });

  it("reads a healer's overheal from the run page's Healing Done sums", () => {
    const processor = createUnifiedHealingProcessor();
    const state = processor.createState();
    const heal = (sourceName: string, amount: number, overheal: number, hitType: number): HealProcessorEvent => ({
      type: "heal", index: 0, offsetMilli: 0, caster: "0x0000000000005678", sourceName, target: PLAYER, hitType, amount, overheal,
      absorbed: 0, schools: [2], spellId: null, spellAttackOutcome: null, activity: [], activityCount: 0, isSynthetic: false,
    });
    for (const event of [heal("Flash Heal", 1_000, 0, HitTypeHit | HitTypeCrit), heal("Renew", 1_000, 500, HitTypeHit)]) {
      processor.processEvent(state, event, "enc1", new Date(0), "heal", context);
    }
    const healer = "0x0000000000005678";
    const overheal = [...state.HealerByAbilityOverheal.get(healer)?.values() ?? []].reduce((sum, ability) => sum + ability.Total, 0);
    const breakout = playerBreakout({
      abilities: state.HealerByAbility.get(healer),
      hitAbilities: state.HealerByAbilityTotal.get(healer),
      raidTotal: 3_000,
      elapsedMs: 500,
      targets: 1,
      overheal,
      limit: 1,
    });
    // A heal's amount includes its overheal: Renew lands 500.
    expect(breakout?.total).toBe(1_500);
    // Under a second counts as one, as the pane's rates do.
    expect(breakout?.perSecond).toBe(1_500);
    expect(breakout?.raidShare).toBe(0.5);
    expect(breakout?.abilities).toEqual([{ name: "Flash Heal", perSecond: 1_000, share: 2 / 3 }]);
    expect(breakout?.facts).toEqual([{ label: "crit", value: "50%" }, { label: "overheal", value: "25%" }, { label: "target", value: "1" }]);
  });

  it("is null for a player without an amount yet", () => {
    expect(playerBreakout({ abilities: undefined, raidTotal: 0, elapsedMs: 0, targets: 0, limit: 5 })).toBeNull();
    expect(playerBreakout({ abilities: new Map(), raidTotal: 100, elapsedMs: 1_000, targets: 0, limit: 5 })).toBeNull();
  });
});

describe("runPageHref", () => {
  it("opens the run page on the pane's preset, by slug, else by id", () => {
    expect(runPageHref({ id: "run-id", slug: "abc" }, "damage_done")).toBe("/instances/abc?preset=damage");
    expect(runPageHref({ id: "run-id" }, "healing_done")).toBe("/instances/run-id?preset=healing");
    expect(runPageHref({ id: "run-id", slug: null }, "deaths")).toBe("/instances/run-id?preset=deaths");
    expect(runPageHref({ id: "run-id", slug: "abc" })).toBe("/instances/abc?preset=watch");
  });

  it("names presets the run page has", () => {
    const ids = new Set(PRESET_LAYOUTS.map((preset) => preset.id));
    for (const pane of ["damage_done", "healing_done", "deaths"] as const) {
      expect(ids).toContain(new URLSearchParams(runPageHref({ id: "x" }, pane).split("?")[1]).get("preset"));
    }
  });
});

describe("RUN_PAGE_PANELS", () => {
  it("claims no more panels than the run page's registry has", () => {
    expect(RUN_PAGE_PANELS).toBeLessThanOrEqual(Object.keys(PANELS).length);
  });
});
