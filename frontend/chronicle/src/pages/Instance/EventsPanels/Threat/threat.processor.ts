/**
 * Threat (estimated) processor: rebuilds each enemy's threat table from damage, heals, resource gains,
 * stances/forms/buffs, taunts, threat drops and deaths, since vanilla logs carry no threat values.
 * The rules, modifiers and known gaps are in docs/threat-estimate.md.
 *
 * Pure TypeScript, worker-safe. No React.
 */

import type {
  AuraProcessorEvent,
  DamageProcessorEvent,
  HealProcessorEvent,
  PanelProcessor,
  ProcessorContext,
  ResourceChangeProcessorEvent,
  SlainProcessorEvent,
  SpellGoProcessorEvent,
} from "../processorTypes";
import { AuraState } from "../processorTypes";
import { isPlayerOrPetGuidFast } from "../processors/guidCache";
import { absorbedDamageFromTailers } from "../processors/damageTailers";

export type ThreatEvent =
  | DamageProcessorEvent
  | HealProcessorEvent
  | ResourceChangeProcessorEvent
  | AuraProcessorEvent
  | SpellGoProcessorEvent
  | SlainProcessorEvent;

export type Stance = "defensive" | "battle" | "berserker" | "bear" | "cat" | "caster";

/** Defensive Stance × Defiance 5/5, and Bear Form × Feral Instinct 5/5 (max-rank talents assumed). */
export const TANK_STANCE_MODIFIER = 1.3 * 1.15;
export const DPS_STANCE_MODIFIER = 0.8;
export const CAT_MODIFIER = 0.71;
export const ROGUE_MODIFIER = 0.71;
/** Righteous Fury (+60%) with Improved Righteous Fury 3/3 (+50% of that), on holy damage. */
export const RIGHTEOUS_FURY_MODIFIER = 1.9;
export const SALVATION_MODIFIER = 0.7;
export const TRANQUIL_AIR_MODIFIER = 0.8;
export const HEAL_THREAT = 0.5;
/** Threat per point gained (rage arrives ×10 in resource_change events). */
export const RESOURCE_THREAT: Record<string, number> = { Rage: 5 / 10, Energy: 5, Mana: 0.5 };
/** Pull-aggro thresholds as a share of the tank's threat. */
export const MELEE_PULL = 1.1;
export const RANGED_PULL = 1.3;

const AUTO_ATTACK = 6603;
const HOLY_SCHOOL = 3;
const FORCED_MS = 6000;
const TAUNT_MS = 3000;
const FADE_MS = 10_000;
const LOG_LIMIT = 200;

/** Flat threat added to an ability's damage (max rank). */
export const ABILITY_BONUS: Record<string, number> = {
  "Heroic Strike": 173,
  Revenge: 355,
  "Shield Slam": 254,
};
/** Threat for a landed Sunder Armor (it deals no damage). */
export const SUNDER_THREAT = 301;

const STANCE_BY_NAME: Record<string, Stance> = {
  "Defensive Stance": "defensive",
  "Battle Stance": "battle",
  "Berserker Stance": "berserker",
  "Bear Form": "bear",
  "Dire Bear Form": "bear",
  "Cat Form": "cat",
};
const STANCE_BY_ID: Record<number, Stance> = { 71: "defensive", 2457: "battle", 2458: "berserker", 5487: "bear", 9634: "bear", 768: "cat" };

const RIGHTEOUS_FURY = new Set(["Righteous Fury"]);
const SALVATION = new Set(["Blessing of Salvation", "Greater Blessing of Salvation"]);
const TRANQUIL_AIR = new Set(["Tranquil Air"]);

const TAUNTS = new Set(["Taunt", "Growl"]);
const FORCES = new Set(["Mocking Blow", "Challenging Shout", "Challenging Roar"]);
const WIPES = new Set(["Feign Death", "Vanish"]);
/** Fade's threat loss by rank; unknown ranks use rank 6. */
const FADE_BY_ID: Record<number, number> = { 586: 55, 9578: 155, 9579: 285, 9592: 440, 10941: 620, 10942: 820 };
const FADE_DEFAULT = 820;

/** Boss abilities that scale the hit unit's threat on the caster (docs: "Known boss threat drops"). */
export const BOSS_THREAT_DROPS: Record<number, number> = { 18670: 0.5, 23339: 0.5 };

const RANGED_CLASSES = new Set(["MAGE", "WARLOCK", "HUNTER", "PRIEST"]);

export interface ThreatUnit {
  name: string;
  className: string;
  /** The owning player for a pet or totem. */
  owner: string | null;
}

export interface ThreatLogEntry {
  offsetMs: number;
  kind: "aggro" | "taunt" | "force" | "drop" | "fade" | "death" | "boss";
  unit: string;
  enemy: string;
  /** For "aggro": the new target's estimated threat as a share of the previous target's. */
  ratio?: number;
  /** The previous target ("aggro"). */
  from?: string;
}

export interface ThreatTable {
  enemy: string;
  name: string;
  threat: Map<string, number>;
  /** Units this enemy has melee'd this encounter (unknown stances read as tanking). */
  meleed: Record<string, true>;
  meleeTarget: string | null;
  forced: { unit: string; untilMs: number } | null;
  dead: boolean;
}

export interface ThreatEncounter {
  tables: Map<string, ThreatTable>;
  log: ThreatLogEntry[];
  fades: { unit: string; amount: number; untilMs: number; enemies: string[] }[];
  /** The latest event offset seen in this encounter. */
  nowMs: number;
  /** Units slain this encounter and not seen acting since (swings logged onto a corpse are ignored). */
  dead: Record<string, true>;
}

export interface ThreatResult {
  encounters: Map<string, ThreatEncounter>;
  units: Map<string, ThreatUnit>;
  /** Stance or form per unit; absent while unknown. */
  stances: Map<string, Stance>;
  /** Righteous Fury: true/false once seen, absent while unknown. */
  righteousFury: Map<string, boolean>;
  salvation: Map<string, boolean>;
  tranquilAir: Map<string, boolean>;
  /** An aura stream was loaded: a Righteous Fury never seen then means none. */
  aurasSeen: boolean;
  /** The encounter of the latest event that changed a table. */
  latestEncounterId: string | null;
}

export function createThreatState(): ThreatResult {
  return {
    encounters: new Map(),
    units: new Map(),
    stances: new Map(),
    righteousFury: new Map(),
    salvation: new Map(),
    tranquilAir: new Map(),
    aurasSeen: false,
    latestEncounterId: null,
  };
}

/** A player, or a pet/totem a player owns; null for anything else. */
function friendly(state: ThreatResult, guid: string, context: ProcessorContext): ThreatUnit | null {
  if (!guid) return null;
  const known = state.units.get(guid);
  if (known) return known;
  const player = context.players[guid];
  if (player) {
    const unit = { name: player.name, className: player.class, owner: null };
    state.units.set(guid, unit);
    return unit;
  }
  const owner = context.unitState?.getOwner(guid) ?? context.units?.[guid]?.owner ?? null;
  const ownerPlayer = owner ? context.players[owner] : undefined;
  if (!owner || !ownerPlayer) return null;
  const name = context.unitState?.getUnit(guid)?.name ?? context.units?.[guid]?.name ?? "Pet";
  const unit = { name, className: ownerPlayer.class, owner };
  state.units.set(guid, unit);
  return unit;
}

function isEnemy(state: ThreatResult, guid: string, context: ProcessorContext): boolean {
  return !!guid && !isPlayerOrPetGuidFast(guid) && friendly(state, guid, context) === null;
}

function encounterState(state: ThreatResult, encounterID: string): ThreatEncounter {
  let encounter = state.encounters.get(encounterID);
  if (!encounter) {
    encounter = { tables: new Map(), log: [], fades: [], nowMs: 0, dead: {} };
    state.encounters.set(encounterID, encounter);
  }
  return encounter;
}

function table(encounter: ThreatEncounter, enemy: string, context: ProcessorContext): ThreatTable {
  let entry = encounter.tables.get(enemy);
  if (!entry) {
    const name = context.unitState?.getUnit(enemy)?.name ?? context.units?.[enemy]?.name ?? enemy;
    entry = { enemy, name, threat: new Map(), meleed: {}, meleeTarget: null, forced: null, dead: false };
    encounter.tables.set(enemy, entry);
  }
  return entry;
}

function log(encounter: ThreatEncounter, entry: ThreatLogEntry) {
  if (encounter.log.length < LOG_LIMIT) encounter.log.push(entry);
}

function add(entry: ThreatTable, unit: string, amount: number) {
  entry.threat.set(unit, (entry.threat.get(unit) ?? 0) + amount);
}

function topThreat(entry: ThreatTable): number {
  let top = 0;
  for (const value of entry.threat.values()) top = Math.max(top, value);
  return top;
}

/** The unit's stance/form/class modifier against `entry` (unknown stances read as tanking once meleed). */
export function stanceModifier(state: ThreatResult, guid: string, unit: ThreatUnit, entry: ThreatTable | null): number {
  if (unit.owner) return 1;
  const tanking = entry ? entry.meleed[guid] === true : false;
  const stance = state.stances.get(guid);
  switch (unit.className) {
    case "WARRIOR":
      if (stance === "defensive") return TANK_STANCE_MODIFIER;
      if (stance === "battle" || stance === "berserker") return DPS_STANCE_MODIFIER;
      return tanking ? TANK_STANCE_MODIFIER : DPS_STANCE_MODIFIER;
    case "DRUID":
      if (stance === "bear") return TANK_STANCE_MODIFIER;
      if (stance === "cat") return CAT_MODIFIER;
      if (stance === "caster") return 1;
      return tanking ? TANK_STANCE_MODIFIER : 1;
    case "ROGUE":
      return ROGUE_MODIFIER;
    default:
      return 1;
  }
}

/** Salvation and Tranquil Air on the unit. */
export function buffModifier(state: ThreatResult, guid: string): number {
  return (state.salvation.get(guid) ? SALVATION_MODIFIER : 1) * (state.tranquilAir.get(guid) ? TRANQUIL_AIR_MODIFIER : 1);
}

function righteousFury(state: ThreatResult, guid: string, unit: ThreatUnit, entry: ThreatTable): boolean {
  if (unit.className !== "PALADIN" || unit.owner) return false;
  return state.righteousFury.get(guid) ?? (!state.aurasSeen && entry.meleed[guid] === true);
}

function liveEnemies(encounter: ThreatEncounter): ThreatTable[] {
  return [...encounter.tables.values()].filter((entry) => !entry.dead);
}

/** Restores Fade's threat once its 10 s are up. */
function settleFades(encounter: ThreatEncounter, nowMs: number) {
  if (encounter.fades.length === 0) return;
  encounter.fades = encounter.fades.filter((fade) => {
    if (nowMs < fade.untilMs) return true;
    for (const enemy of fade.enemies) {
      const entry = encounter.tables.get(enemy);
      if (entry && !entry.dead && entry.threat.has(fade.unit)) add(entry, fade.unit, fade.amount);
    }
    return false;
  });
}

function setFlag(map: Map<string, boolean>, guid: string, event: AuraProcessorEvent) {
  if (event.state === AuraState.Added || event.state === AuraState.Modified) map.set(guid, true);
  else if (event.state === AuraState.Removed) map.set(guid, false);
}

function stanceOf(name: string, id: number | null): Stance | undefined {
  return STANCE_BY_NAME[name] ?? (id != null ? STANCE_BY_ID[id] : undefined);
}

function processAura(state: ThreatResult, event: AuraProcessorEvent, context: ProcessorContext) {
  state.aurasSeen = true;
  const unit = friendly(state, event.target, context);
  if (!unit) return;
  const stance = stanceOf(event.spellName, event.spellId);
  if (stance) {
    if (event.state === AuraState.Added) state.stances.set(event.target, stance);
    else if (event.state === AuraState.Removed && state.stances.get(event.target) === stance) {
      // Leaving a form drops a druid to caster form; a warrior's next stance follows in its own event.
      if (unit.className === "DRUID") state.stances.set(event.target, "caster");
      else state.stances.delete(event.target);
    }
    return;
  }
  if (RIGHTEOUS_FURY.has(event.spellName)) setFlag(state.righteousFury, event.target, event);
  else if (SALVATION.has(event.spellName)) setFlag(state.salvation, event.target, event);
  else if (TRANQUIL_AIR.has(event.spellName)) setFlag(state.tranquilAir, event.target, event);
}

function processDamage(state: ThreatResult, event: DamageProcessorEvent, encounterID: string, context: ProcessorContext) {
  const encounter = encounterState(state, encounterID);
  settleFades(encounter, event.offsetMilli);
  const source = friendly(state, event.caster, context);
  if (source) {
    delete encounter.dead[event.caster];
    if (!isEnemy(state, event.target, context)) return;
    const entry = table(encounter, event.target, context);
    if (entry.dead) return;
    const effective = Math.max(0, event.amount - (event.overkill || 0)) + absorbedDamageFromTailers(event);
    const bonus = effective > 0 ? ABILITY_BONUS[event.sourceName] ?? 0 : 0;
    let modifier = stanceModifier(state, event.caster, source, entry) * buffModifier(state, event.caster);
    if (event.schools.includes(HOLY_SCHOOL) && righteousFury(state, event.caster, source, entry)) modifier *= RIGHTEOUS_FURY_MODIFIER;
    add(entry, event.caster, (effective + bonus) * modifier);
    state.latestEncounterId = encounterID;
    return;
  }
  // Enemy → friendly: melee marks who it is attacking; listed abilities drop the hit unit's threat.
  if (!isEnemy(state, event.caster, context) || !friendly(state, event.target, context)) return;
  const entry = table(encounter, event.caster, context);
  const dropFactor = event.spellId != null ? BOSS_THREAT_DROPS[event.spellId] : undefined;
  if (dropFactor !== undefined && entry.threat.has(event.target)) {
    entry.threat.set(event.target, entry.threat.get(event.target)! * dropFactor);
    log(encounter, { offsetMs: event.offsetMilli, kind: "boss", unit: event.target, enemy: event.caster });
  }
  if ((event.spellId !== AUTO_ATTACK && event.spellId !== null) || encounter.dead[event.target]) return;
  entry.meleed[event.target] = true;
  const forced = entry.forced && event.offsetMilli < entry.forced.untilMs;
  const previous = entry.meleeTarget;
  if (previous && previous !== event.target && !forced && entry.threat.has(previous)) {
    const before = entry.threat.get(previous) ?? 0;
    log(encounter, {
      offsetMs: event.offsetMilli,
      kind: "aggro",
      unit: event.target,
      enemy: event.caster,
      from: previous,
      ratio: before > 0 ? (entry.threat.get(event.target) ?? 0) / before : undefined,
    });
  }
  entry.meleeTarget = event.target;
}

function processHeal(state: ThreatResult, event: HealProcessorEvent, encounterID: string, context: ProcessorContext) {
  const source = friendly(state, event.caster, context);
  if (!source || !friendly(state, event.target, context)) return;
  const encounter = encounterState(state, encounterID);
  settleFades(encounter, event.offsetMilli);
  const effective = Math.max(0, event.amount - (event.overheal || 0));
  const enemies = liveEnemies(encounter);
  if (effective <= 0 || enemies.length === 0) return;
  const each = (effective * HEAL_THREAT * buffModifier(state, event.caster)) / enemies.length;
  for (const entry of enemies) add(entry, event.caster, each * stanceModifier(state, event.caster, source, entry));
  state.latestEncounterId = encounterID;
}

function processResource(state: ThreatResult, event: ResourceChangeProcessorEvent, encounterID: string, context: ProcessorContext) {
  if (event.direction !== "Gain" || event.amount <= 0) return;
  const perPoint = RESOURCE_THREAT[event.resourceType];
  if (!perPoint || !friendly(state, event.target, context)) return;
  const encounter = encounterState(state, encounterID);
  const enemies = liveEnemies(encounter);
  if (enemies.length === 0) return;
  const gained = Math.max(0, event.amount - (event.overResource || 0));
  const each = (gained * perPoint) / enemies.length;
  for (const entry of enemies) add(entry, event.target, each);
}

function processSpellGo(state: ThreatResult, event: SpellGoProcessorEvent, encounterID: string, context: ProcessorContext) {
  const name = event.spell.name;
  const stance = stanceOf(name, event.spell.id);
  if (stance) {
    if (friendly(state, event.caster, context)) state.stances.set(event.caster, stance);
    return;
  }
  const isTaunt = TAUNTS.has(name);
  const isForce = FORCES.has(name);
  const isWipe = WIPES.has(name);
  const isFade = name === "Fade";
  const isSunder = name === "Sunder Armor";
  if (!isTaunt && !isForce && !isWipe && !isFade && !isSunder) return;
  const source = friendly(state, event.caster, context);
  if (!source) return;
  const encounter = encounterState(state, encounterID);
  settleFades(encounter, event.offsetMilli);
  const now = event.offsetMilli;

  if (isWipe || isFade) {
    const amount = isFade ? FADE_BY_ID[event.spell.id] ?? FADE_DEFAULT : 0;
    const enemies: string[] = [];
    for (const entry of encounter.tables.values()) {
      const current = entry.threat.get(event.caster);
      if (current === undefined) continue;
      if (isWipe) entry.threat.set(event.caster, 0);
      else {
        // Fade takes up to its amount away for 10 s and gives back what it took.
        const taken = Math.min(current, amount);
        entry.threat.set(event.caster, current - taken);
        enemies.push(entry.enemy);
        encounter.fades.push({ unit: event.caster, amount: taken, untilMs: now + FADE_MS, enemies: [entry.enemy] });
      }
    }
    log(encounter, { offsetMs: now, kind: isWipe ? "drop" : "fade", unit: event.caster, enemy: enemies[0] ?? "" });
    state.latestEncounterId = encounterID;
    return;
  }

  if (event.numHits <= 0) return;
  if (name === "Challenging Shout" || name === "Challenging Roar") {
    // Area effect: every live enemy already attacking the raid.
    for (const entry of liveEnemies(encounter)) entry.forced = { unit: event.caster, untilMs: now + FORCED_MS };
    log(encounter, { offsetMs: now, kind: "force", unit: event.caster, enemy: "" });
    return;
  }
  if (!isEnemy(state, event.target, context)) return;
  const entry = table(encounter, event.target, context);
  if (entry.dead) return;
  if (isSunder) {
    add(entry, event.caster, SUNDER_THREAT * stanceModifier(state, event.caster, source, entry) * buffModifier(state, event.caster));
  } else if (isTaunt) {
    const top = topThreat(entry);
    if ((entry.threat.get(event.caster) ?? 0) < top) entry.threat.set(event.caster, top);
    entry.forced = { unit: event.caster, untilMs: now + TAUNT_MS };
    log(encounter, { offsetMs: now, kind: "taunt", unit: event.caster, enemy: event.target });
  } else {
    entry.forced = { unit: event.caster, untilMs: now + FORCED_MS };
    log(encounter, { offsetMs: now, kind: "force", unit: event.caster, enemy: event.target });
  }
  state.latestEncounterId = encounterID;
}

function processSlain(state: ThreatResult, event: SlainProcessorEvent, encounterID: string, context: ProcessorContext) {
  const encounter = state.encounters.get(encounterID);
  if (!encounter) return;
  const enemy = encounter.tables.get(event.target);
  if (enemy) {
    enemy.dead = true;
    return;
  }
  if (!friendly(state, event.target, context)) return;
  encounter.dead[event.target] = true;
  let had = false;
  for (const entry of encounter.tables.values()) {
    if (entry.threat.has(event.target)) {
      entry.threat.set(event.target, 0);
      had = true;
    }
  }
  if (had) log(encounter, { offsetMs: event.offsetMilli, kind: "death", unit: event.target, enemy: "" });
}

export const threatProcessor: PanelProcessor<ThreatResult, ThreatEvent> = {
  id: "threat",
  streams: ["damage", "heal", "resource_change", "aura", "spell_go", "slain"],
  createState: createThreatState,
  processEvent: (state, event, encounterID, _firstTimestamp, _streamType, context) => {
    const encounter = state.encounters.get(encounterID);
    if (encounter && event.offsetMilli > encounter.nowMs) encounter.nowMs = event.offsetMilli;
    switch (event.type) {
      case "damage":
        return processDamage(state, event, encounterID, context);
      case "heal":
        return processHeal(state, event, encounterID, context);
      case "resource_change":
        return processResource(state, event, encounterID, context);
      case "aura":
        return processAura(state, event, context);
      case "spell_go":
        return processSpellGo(state, event, encounterID, context);
      case "slain":
        return processSlain(state, event, encounterID, context);
    }
  },
};

export interface ThreatRow {
  guid: string;
  name: string;
  className: string;
  threat: number;
  /** Share of the tank's threat. */
  share: number;
  isTank: boolean;
  ranged: boolean;
  /** Over 110% (melee) or 130% (ranged) of the tank. */
  pulls: boolean;
}

export interface ThreatView {
  encounterId: string;
  enemy: string;
  enemyName: string;
  tank: string | null;
  tankThreat: number;
  rows: ThreatRow[];
  log: ThreatLogEntry[];
}

function tableTotal(entry: ThreatTable): number {
  let total = 0;
  for (const value of entry.threat.values()) total += value;
  return total;
}

/** The enemy's current tank: a forced target, else its latest melee target, else the top threat. */
export function tankOf(entry: ThreatTable, nowMs: number): string | null {
  if (entry.forced && nowMs < entry.forced.untilMs) return entry.forced.unit;
  if (entry.meleeTarget && (entry.threat.get(entry.meleeTarget) ?? 0) > 0) return entry.meleeTarget;
  let tank: string | null = null;
  let top = 0;
  for (const [unit, value] of entry.threat) {
    if (value > top) {
      top = value;
      tank = unit;
    }
  }
  return tank;
}

/**
 * The table to show: the selected enemy, else the enemy with the most total threat, in the latest
 * selected encounter that has one.
 */
export function buildThreatView(result: ThreatResult, encounterIds: readonly string[], enemyIds: ReadonlySet<string>): ThreatView | null {
  const order = result.latestEncounterId && encounterIds.includes(result.latestEncounterId)
    ? [result.latestEncounterId, ...[...encounterIds].reverse()]
    : [...encounterIds].reverse();
  for (const encounterId of order) {
    const encounter = result.encounters.get(encounterId);
    if (!encounter) continue;
    let chosen: ThreatTable | null = null;
    for (const entry of encounter.tables.values()) {
      if (entry.threat.size === 0) continue;
      if (enemyIds.size > 0) {
        if (enemyIds.has(entry.enemy)) chosen = entry;
        if (chosen) break;
        continue;
      }
      if (!chosen || tableTotal(entry) > tableTotal(chosen)) chosen = entry;
    }
    if (!chosen) continue;
    const tank = tankOf(chosen, encounter.nowMs);
    const tankThreat = tank ? chosen.threat.get(tank) ?? 0 : 0;
    const rows: ThreatRow[] = [];
    for (const [guid, threat] of chosen.threat) {
      if (threat <= 0) continue;
      const unit = result.units.get(guid);
      const className = unit?.className ?? "UNKNOWN";
      const ranged = RANGED_CLASSES.has(className) && !unit?.owner;
      const share = tankThreat > 0 ? threat / tankThreat : 0;
      rows.push({
        guid,
        name: unit?.name ?? guid,
        className,
        threat,
        share,
        isTank: guid === tank,
        ranged,
        pulls: guid !== tank && tankThreat > 0 && share >= (ranged ? RANGED_PULL : MELEE_PULL),
      });
    }
    rows.sort((left, right) => Number(right.isTank) - Number(left.isTank) || right.threat - left.threat);
    return { encounterId, enemy: chosen.enemy, enemyName: chosen.name, tank, tankThreat, rows, log: encounter.log };
  }
  return null;
}
