import { describe, expect, it } from "vitest";
import {
  AuraState,
  AuraTransition,
  type AuraProcessorEvent,
  type DamageProcessorEvent,
  type HealProcessorEvent,
  type ProcessorContext,
  type ResourceChangeProcessorEvent,
  type SlainProcessorEvent,
  type SpellGoProcessorEvent,
} from "../processorTypes";
import {
  buildThreatView,
  CAT_MODIFIER,
  DPS_STANCE_MODIFIER,
  RIGHTEOUS_FURY_MODIFIER,
  ROGUE_MODIFIER,
  SALVATION_MODIFIER,
  SUNDER_THREAT,
  TANK_STANCE_MODIFIER,
  threatProcessor,
  TRANQUIL_AIR_MODIFIER,
  type ThreatEvent,
  type ThreatResult,
} from "./threat.processor";

const ENC = "enc1";
const BOSS = "0xF130000CE0000001";
const ADD = "0xF130000CE0000002";
const WARRIOR = "0x0000000000000001";
const DRUID = "0x0000000000000002";
const ROGUE = "0x0000000000000003";
const PALADIN = "0x0000000000000004";
const PRIEST = "0x0000000000000005";
const MAGE = "0x0000000000000006";
const HUNTER = "0x0000000000000007";
const PET = "0xF140000CE0000009";

function context(): ProcessorContext {
  return {
    players: {
      [WARRIOR]: { name: "Tank", class: "WARRIOR" },
      [DRUID]: { name: "Bear", class: "DRUID" },
      [ROGUE]: { name: "Stab", class: "ROGUE" },
      [PALADIN]: { name: "Pally", class: "PALADIN" },
      [PRIEST]: { name: "Heals", class: "PRIEST" },
      [MAGE]: { name: "Frost", class: "MAGE" },
      [HUNTER]: { name: "Hunt", class: "HUNTER" },
    },
    units: {
      [BOSS]: { name: "Boss", owner: null, entry: 1 },
      [ADD]: { name: "Add", owner: null, entry: 2 },
      [PET]: { name: "Wolf", owner: HUNTER, entry: 3 },
    },
    selectedEncounterIds: new Set([ENC]),
    entitySelection: { enemyIds: new Set(), playerIds: new Set() },
  };
}

const meta = { index: 0, activity: [], activityCount: 0, isSynthetic: false };

function damage(caster: string, target: string, amount: number, extra: Partial<DamageProcessorEvent> = {}): DamageProcessorEvent {
  return {
    ...meta, type: "damage", offsetMilli: 0, caster, sourceName: "Melee", target, hitType: 1, amount,
    schools: [2], tailers: [], tailerCount: 0, spellId: null, spellAttackOutcome: null, overkill: 0, ...extra,
  };
}

const melee = (enemy: string, target: string, offsetMilli = 0) => damage(enemy, target, 100, { spellId: 6603, offsetMilli });

function heal(caster: string, target: string, amount: number, overheal = 0): HealProcessorEvent {
  return {
    ...meta, type: "heal", offsetMilli: 0, caster, sourceName: "Heal", target, hitType: 1, amount, overheal, absorbed: 0,
    schools: [3], spellId: 2054, spellAttackOutcome: null,
  };
}

function aura(target: string, spellName: string, state: AuraState = AuraState.Added): AuraProcessorEvent {
  return {
    ...meta, type: "aura", offsetMilli: 0, target, caster: target, spellName, spellId: null, spellAttackOutcome: null, amount: 1,
    application: 1, state, transition: state === AuraState.Removed ? AuraTransition.Removed : AuraTransition.Applied, isBuff: true,
  };
}

function spell(caster: string, name: string, target = "", offsetMilli = 0, id = 0, numHits = 1): SpellGoProcessorEvent {
  return { ...meta, type: "spell_go", offsetMilli, caster, target, spell: { id, name }, numHits, numMisses: 0, itemId: null, corpseOwner: null };
}

function resource(target: string, resourceType: string, amount: number): ResourceChangeProcessorEvent {
  return {
    ...meta, type: "resource_change", offsetMilli: 0, caster: target, sourceName: "Bloodrage", target, amount, overResource: 0,
    resourceType, spellId: null, spellAttackOutcome: null, direction: "Gain",
  };
}

function slain(target: string, offsetMilli = 0): SlainProcessorEvent {
  return { ...meta, type: "slain", offsetMilli, target, caster: "", attribution: null };
}

function run(events: ThreatEvent[]): ThreatResult {
  const state = threatProcessor.createState();
  const ctx = context();
  for (const event of events) {
    threatProcessor.processEvent(state, event, ENC, new Date(0), event.type === "spell_go" ? "spell_go" : event.type, ctx);
  }
  return state;
}

const threat = (state: ThreatResult, unit: string, enemy = BOSS) => state.encounters.get(ENC)?.tables.get(enemy)?.threat.get(unit) ?? 0;

describe("threat modifiers", () => {
  it("defensive stance with Defiance multiplies warrior damage by 1.495", () => {
    expect(threat(run([aura(WARRIOR, "Defensive Stance"), damage(WARRIOR, BOSS, 1000)]), WARRIOR)).toBeCloseTo(1000 * TANK_STANCE_MODIFIER);
  });

  it("battle and berserker stance multiply warrior damage by 0.8", () => {
    expect(threat(run([aura(WARRIOR, "Battle Stance"), damage(WARRIOR, BOSS, 1000)]), WARRIOR)).toBeCloseTo(1000 * DPS_STANCE_MODIFIER);
    expect(threat(run([aura(WARRIOR, "Berserker Stance"), damage(WARRIOR, BOSS, 1000)]), WARRIOR)).toBeCloseTo(1000 * DPS_STANCE_MODIFIER);
  });

  it("a stance cast (spell_go) sets the stance without an aura stream", () => {
    expect(threat(run([spell(WARRIOR, "Defensive Stance", "", 0, 71), damage(WARRIOR, BOSS, 1000)]), WARRIOR)).toBeCloseTo(1000 * TANK_STANCE_MODIFIER);
  });

  it("an unknown warrior stance reads as tanking once the enemy has meleed them, else 0.8", () => {
    expect(threat(run([damage(WARRIOR, BOSS, 1000)]), WARRIOR)).toBeCloseTo(1000 * DPS_STANCE_MODIFIER);
    expect(threat(run([melee(BOSS, WARRIOR), damage(WARRIOR, BOSS, 1000)]), WARRIOR)).toBeCloseTo(1000 * TANK_STANCE_MODIFIER);
  });

  it("bear form multiplies by 1.495, cat form by 0.71, leaving a form is caster form", () => {
    expect(threat(run([aura(DRUID, "Dire Bear Form"), damage(DRUID, BOSS, 1000)]), DRUID)).toBeCloseTo(1000 * TANK_STANCE_MODIFIER);
    expect(threat(run([aura(DRUID, "Cat Form"), damage(DRUID, BOSS, 1000)]), DRUID)).toBeCloseTo(1000 * CAT_MODIFIER);
    expect(threat(run([aura(DRUID, "Cat Form"), aura(DRUID, "Cat Form", AuraState.Removed), melee(BOSS, DRUID), damage(DRUID, BOSS, 1000)]), DRUID))
      .toBeCloseTo(1000);
  });

  it("rogues generate 0.71 threat", () => {
    expect(threat(run([damage(ROGUE, BOSS, 1000)]), ROGUE)).toBeCloseTo(1000 * ROGUE_MODIFIER);
  });

  it("Righteous Fury multiplies holy damage by 1.9, not physical", () => {
    const state = run([aura(PALADIN, "Righteous Fury"), damage(PALADIN, BOSS, 1000, { schools: [3] }), damage(PALADIN, BOSS, 500)]);
    expect(threat(state, PALADIN)).toBeCloseTo(1000 * RIGHTEOUS_FURY_MODIFIER + 500);
  });

  it("an unseen Righteous Fury reads as on for a meleed paladin only without an aura stream", () => {
    expect(threat(run([melee(BOSS, PALADIN), damage(PALADIN, BOSS, 1000, { schools: [3] })]), PALADIN)).toBeCloseTo(1000 * RIGHTEOUS_FURY_MODIFIER);
    expect(threat(run([aura(MAGE, "Arcane Intellect"), melee(BOSS, PALADIN), damage(PALADIN, BOSS, 1000, { schools: [3] })]), PALADIN)).toBeCloseTo(1000);
  });

  it("Salvation (0.7) and Tranquil Air (0.8) stack and fall off with the aura", () => {
    expect(threat(run([aura(MAGE, "Greater Blessing of Salvation"), aura(MAGE, "Tranquil Air"), damage(MAGE, BOSS, 1000)]), MAGE))
      .toBeCloseTo(1000 * SALVATION_MODIFIER * TRANQUIL_AIR_MODIFIER);
    expect(threat(run([aura(MAGE, "Blessing of Salvation"), aura(MAGE, "Blessing of Salvation", AuraState.Removed), damage(MAGE, BOSS, 1000)]), MAGE))
      .toBeCloseTo(1000);
  });
});

describe("threat events", () => {
  it("damage counts effective damage plus ability bonuses", () => {
    const state = run([
      aura(WARRIOR, "Defensive Stance"),
      damage(WARRIOR, BOSS, 1000, { overkill: 200 }),
      damage(WARRIOR, BOSS, 100, { sourceName: "Heroic Strike", spellId: 11567 }),
      damage(WARRIOR, BOSS, 0, { sourceName: "Revenge", spellId: 11601, hitType: 4 }),
    ]);
    expect(threat(state, WARRIOR)).toBeCloseTo((800 + 100 + 173) * TANK_STANCE_MODIFIER);
  });

  it("a landed Sunder Armor adds 301 threat × stance", () => {
    expect(threat(run([aura(WARRIOR, "Defensive Stance"), spell(WARRIOR, "Sunder Armor", BOSS)]), WARRIOR)).toBeCloseTo(SUNDER_THREAT * TANK_STANCE_MODIFIER);
    expect(threat(run([aura(WARRIOR, "Defensive Stance"), spell(WARRIOR, "Sunder Armor", BOSS, 0, 11597, 0)]), WARRIOR)).toBe(0);
  });

  it("healing is 0.5 × effective heal split across live engaged enemies", () => {
    const state = run([melee(BOSS, WARRIOR), melee(ADD, WARRIOR), heal(PRIEST, WARRIOR, 1200, 200)]);
    expect(threat(state, PRIEST, BOSS)).toBeCloseTo(250);
    expect(threat(state, PRIEST, ADD)).toBeCloseTo(250);
    const afterKill = run([melee(BOSS, WARRIOR), melee(ADD, WARRIOR), slain(ADD), heal(PRIEST, WARRIOR, 1000)]);
    expect(threat(afterKill, PRIEST, BOSS)).toBeCloseTo(500);
  });

  it("resource gains add 5 per rage (log ×10), unmodified", () => {
    expect(threat(run([aura(WARRIOR, "Defensive Stance"), melee(BOSS, WARRIOR), resource(WARRIOR, "Rage", 100)]), WARRIOR)).toBeCloseTo(50);
  });

  it("pet threat goes to the pet, not the owner", () => {
    const state = run([damage(PET, BOSS, 400), damage(HUNTER, BOSS, 100)]);
    expect(threat(state, PET)).toBeCloseTo(400);
    expect(threat(state, HUNTER)).toBeCloseTo(100);
    expect(state.units.get(PET)).toEqual({ name: "Wolf", className: "HUNTER", owner: HUNTER });
  });

  it("Taunt raises the taunter to the top threat and forces the target", () => {
    const state = run([damage(MAGE, BOSS, 5000), damage(WARRIOR, BOSS, 100), spell(WARRIOR, "Taunt", BOSS, 1000, 355)]);
    expect(threat(state, WARRIOR)).toBeCloseTo(5000);
    const view = buildThreatView(state, [ENC], new Set());
    expect(view?.tank).toBe(WARRIOR);
  });

  it("Growl from a pet taunts for the pet", () => {
    expect(threat(run([damage(MAGE, BOSS, 3000), damage(PET, BOSS, 10), spell(PET, "Growl", BOSS, 0, 14921)]), PET)).toBeCloseTo(3000);
  });

  it("Mocking Blow and Challenging Shout force the target without changing threat", () => {
    const state = run([melee(BOSS, MAGE, 0), damage(MAGE, BOSS, 3000), damage(WARRIOR, BOSS, 100), spell(WARRIOR, "Challenging Shout", "", 500)]);
    expect(threat(state, WARRIOR)).toBeCloseTo(100 * DPS_STANCE_MODIFIER);
    expect(buildThreatView(state, [ENC], new Set())?.tank).toBe(WARRIOR);
  });

  it("Feign Death and Vanish drop the caster to 0 on every enemy", () => {
    const state = run([damage(HUNTER, BOSS, 3000), damage(HUNTER, ADD, 1000), spell(HUNTER, "Feign Death", "", 0, 5384)]);
    expect(threat(state, HUNTER, BOSS)).toBe(0);
    expect(threat(state, HUNTER, ADD)).toBe(0);
    expect(threat(run([damage(ROGUE, BOSS, 3000), spell(ROGUE, "Vanish", "", 0, 1857)]), ROGUE)).toBe(0);
  });

  it("Fade takes its rank's threat for 10 s, then gives it back", () => {
    const during = run([damage(PRIEST, BOSS, 1000), spell(PRIEST, "Fade", "", 1000, 10942), damage(MAGE, BOSS, 1, { offsetMilli: 5000 })]);
    expect(threat(during, PRIEST)).toBeCloseTo(180);
    const after = run([damage(PRIEST, BOSS, 1000), spell(PRIEST, "Fade", "", 1000, 10942), damage(MAGE, BOSS, 1, { offsetMilli: 11_500 })]);
    expect(threat(after, PRIEST)).toBeCloseTo(1000);
  });

  it("a death resets the unit's threat", () => {
    expect(threat(run([damage(MAGE, BOSS, 3000), slain(MAGE)]), MAGE)).toBe(0);
  });

  it("listed boss abilities halve the hit unit's threat", () => {
    const state = run([aura(WARRIOR, "Defensive Stance"), damage(WARRIOR, BOSS, 1000), damage(BOSS, WARRIOR, 500, { spellId: 18670, sourceName: "Knock Away" })]);
    expect(threat(state, WARRIOR)).toBeCloseTo(500 * TANK_STANCE_MODIFIER);
  });
});

describe("tank inference and the view", () => {
  it("the tank is the enemy's latest melee target; PULLS marks rows over 110% (melee) / 130% (ranged)", () => {
    const state = run([
      melee(BOSS, WARRIOR),
      aura(WARRIOR, "Defensive Stance"),
      damage(WARRIOR, BOSS, 1000),
      damage(ROGUE, BOSS, 1000 * TANK_STANCE_MODIFIER * 1.15 / ROGUE_MODIFIER),
      damage(MAGE, BOSS, 1000 * TANK_STANCE_MODIFIER * 1.2),
    ]);
    const view = buildThreatView(state, [ENC], new Set())!;
    expect(view.tank).toBe(WARRIOR);
    expect(view.rows[0].guid).toBe(WARRIOR);
    const byGuid = new Map(view.rows.map((row) => [row.guid, row]));
    expect(byGuid.get(ROGUE)?.pulls).toBe(true);
    expect(byGuid.get(MAGE)?.pulls).toBe(false);
    expect(byGuid.get(MAGE)?.share).toBeCloseTo(1.2);
  });

  it("logs an aggro change with the estimated share of the previous target", () => {
    const state = run([
      melee(BOSS, WARRIOR, 0),
      aura(WARRIOR, "Defensive Stance"),
      damage(WARRIOR, BOSS, 1000),
      damage(MAGE, BOSS, 2000),
      melee(BOSS, MAGE, 2000),
    ]);
    const aggro = state.encounters.get(ENC)!.log.find((entry) => entry.kind === "aggro")!;
    expect(aggro).toMatchObject({ unit: MAGE, from: WARRIOR, enemy: BOSS });
    expect(aggro.ratio).toBeCloseTo(2000 / (1000 * TANK_STANCE_MODIFIER));
  });

  it("ignores swings logged onto a unit that just died", () => {
    const state = run([melee(BOSS, WARRIOR, 0), damage(WARRIOR, BOSS, 100), damage(MAGE, BOSS, 100), melee(BOSS, MAGE, 1000), slain(MAGE, 2000), melee(BOSS, MAGE, 2100)]);
    expect(state.encounters.get(ENC)!.tables.get(BOSS)!.meleeTarget).toBe(MAGE);
    expect(state.encounters.get(ENC)!.log.filter((entry) => entry.kind === "aggro")).toHaveLength(1);
  });

  it("shows the selected enemy, else the enemy with the most threat", () => {
    const state = run([damage(MAGE, BOSS, 3000), damage(MAGE, ADD, 1000)]);
    expect(buildThreatView(state, [ENC], new Set())?.enemy).toBe(BOSS);
    expect(buildThreatView(state, [ENC], new Set([ADD]))?.enemy).toBe(ADD);
  });
});
