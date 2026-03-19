/**
 * DPS simulation engine. Ported from simulation/engine.go.
 * Event-driven, priority-queue based sim with Step/Run/CastSpell modes.
 */

import {
  type CombatUnit,
  type SpellData,
  type CreatureData,
  type PlayerBaseStats,
  Outcome,
  AttackType,
  PowerMana,
  PowerEnergy,
  SchoolMaskPhysical,
  AuraPeriodicDamage,
  SpellEffectNone,
  SpellEffectSchoolDamage,
  SpellEffectApplyAura,
  SpellEffectWeaponDamage,
  SpellEffectNormalizedWeaponDmg,
} from "./types";
import { AuraTracker, createAuraFromSpell } from "./aura";
import { resolveSpellDamage, resolveMeleeDamage } from "./resolve";
import { type SimResults, createSimResults, finalizeResults, recordDamage } from "./results";
import { type SpellMod } from "./spellmod";
import { type CharacterConfig, buildCombatUnit, buildTargetUnit } from "./character";

// --- Event types ---

export enum EventType {
  AutoAttack,
  CastStart,
  CastComplete,
  DotTick,
  HotTick,
  AuraExpire,
  GCDReady,
  CooldownReady,
  ResourceTick,
  Proc,
}

interface SimEvent {
  timeMs: number;
  type: EventType;
  spellID: number;
  effectIdx: number;
  seqNo: number;
}

export interface StepResult {
  timeMs: number;
  event: EventType;
  spellID: number;
  outcome: Outcome;
  amount: number;
  school: number;
  resisted: number;
  isCrit: boolean;
  resourceDelta: number;
  aurasApplied: number[];
  aurasRemoved: number[];
}

// --- Rotation interface ---

export interface SimState {
  timeMs: number;
  caster: CombatUnit;
  target: CombatUnit;
  auras: AuraTracker;
  targetAuras: AuraTracker;
  spellMods: SpellMod[];
  cooldowns: Map<number, number>;
  gcdReadyMs: number;
  casting: { spellID: number; startMs: number; completeMs: number } | null;
  autoAttacking: boolean;
  comboPoints: number;
  totalDamage: number;
}

export interface Rotation {
  nextAction(state: SimState): { type: "cast"; spellID: number } | null;
}

// --- Priority queue (min-heap) ---

class EventQueue {
  private events: SimEvent[] = [];

  push(ev: SimEvent): void {
    this.events.push(ev);
    this.bubbleUp(this.events.length - 1);
  }

  pop(): SimEvent | null {
    if (this.events.length === 0) return null;
    const top = this.events[0];
    const last = this.events.pop()!;
    if (this.events.length > 0) {
      this.events[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  peek(): SimEvent | null {
    return this.events[0] ?? null;
  }

  remove(predicate: (ev: SimEvent) => boolean): void {
    this.events = this.events.filter((e) => !predicate(e));
    // Rebuild heap
    for (let i = Math.floor(this.events.length / 2) - 1; i >= 0; i--) {
      this.sinkDown(i);
    }
  }

  get length(): number {
    return this.events.length;
  }

  private less(a: SimEvent, b: SimEvent): boolean {
    if (a.timeMs !== b.timeMs) return a.timeMs < b.timeMs;
    return a.seqNo < b.seqNo;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.less(this.events[i], this.events[parent])) {
        [this.events[i], this.events[parent]] = [this.events[parent], this.events[i]];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    const n = this.events.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.less(this.events[left], this.events[smallest])) smallest = left;
      if (right < n && this.less(this.events[right], this.events[smallest])) smallest = right;
      if (smallest === i) break;
      [this.events[i], this.events[smallest]] = [this.events[smallest], this.events[i]];
      i = smallest;
    }
  }
}

// --- Seeded RNG (mulberry32) ---

function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Engine ---

export class Engine {
  private spells: Map<number, SpellData>;
  private config: CharacterConfig;
  private targetData: CreatureData;
  private baseStats: PlayerBaseStats | null;
  private state!: SimState;
  private events!: EventQueue;
  private rotation: Rotation | null = null;
  private results!: SimResults;
  private rng: () => number;
  private seqCounter = 0;

  constructor(
    config: CharacterConfig,
    targetData: CreatureData,
    baseStats: PlayerBaseStats | null,
    spells: Map<number, SpellData>,
  ) {
    this.config = config;
    this.targetData = targetData;
    this.baseStats = baseStats;
    this.spells = spells;
    this.rng = createRng(1);
  }

  setRotation(r: Rotation | null): void {
    this.rotation = r;
  }

  setSeed(seed: number): void {
    this.rng = createRng(seed);
  }

  getSpell(id: number): SpellData | undefined {
    return this.spells.get(id);
  }

  reset(): void {
    const caster = buildCombatUnit(this.config, this.baseStats);
    const target = buildTargetUnit(this.targetData);

    this.state = {
      timeMs: 0,
      caster,
      target,
      auras: new AuraTracker(),
      targetAuras: new AuraTracker(),
      spellMods: [],
      cooldowns: new Map(),
      gcdReadyMs: 0,
      casting: null,
      autoAttacking: false,
      comboPoints: 0,
      totalDamage: 0,
    };
    this.events = new EventQueue();
    this.results = createSimResults();
    this.seqCounter = 0;

    this.scheduleEvent({ timeMs: 0, type: EventType.GCDReady, spellID: 0, effectIdx: 0, seqNo: 0 });
    this.scheduleEvent({ timeMs: 2000, type: EventType.ResourceTick, spellID: 0, effectIdx: 0, seqNo: 0 });
    // Auto-start melee attacks
    this.startAutoAttack();
  }

  private scheduleEvent(ev: SimEvent): void {
    this.seqCounter++;
    ev.seqNo = this.seqCounter;
    this.events.push(ev);
  }

  step(): { result: StepResult; ok: boolean } {
    const ev = this.events.pop();
    if (!ev) return { result: emptyResult(), ok: false };

    const oldTime = this.state.timeMs;
    this.state.timeMs = ev.timeMs;
    const deltaMs = this.state.timeMs - oldTime;

    const result: StepResult = {
      timeMs: ev.timeMs,
      event: ev.type,
      spellID: 0,
      outcome: Outcome.Hit,
      amount: 0,
      school: 0,
      resisted: 0,
      isCrit: false,
      resourceDelta: 0,
      aurasApplied: [],
      aurasRemoved: [],
    };

    if (deltaMs > 0) {
      // Tick auras
      const ticks = this.state.targetAuras.tickAuras(deltaMs);
      for (const tick of ticks) {
        if (tick.auraType === AuraPeriodicDamage) {
          const dmg = Math.round(tick.amount);
          result.amount += dmg;
          this.state.totalDamage += dmg;
          const spell = this.spells.get(tick.spellID);
          recordDamage(this.results, tick.spellID, spell?.name ?? "DoT", dmg, false, false, true);
        }
      }
      // Expire auras
      const expired = this.state.targetAuras.expireAuras(deltaMs);
      result.aurasRemoved.push(...expired);
      const expiredPlayer = this.state.auras.expireAuras(deltaMs);
      result.aurasRemoved.push(...expiredPlayer);
    }

    switch (ev.type) {
      case EventType.GCDReady:
        this.state.gcdReadyMs = ev.timeMs;
        if (this.rotation) {
          const action = this.rotation.nextAction(this.state);
          if (action && action.type === "cast") {
            const err = this.castSpell(action.spellID);
            if (err) {
              // Cast failed — retry next GCD tick (100ms poll)
              this.scheduleEvent({ timeMs: this.state.timeMs + 100, type: EventType.GCDReady, spellID: 0, effectIdx: 0, seqNo: 0 });
            } else {
              result.spellID = action.spellID;
            }
          } else {
            // Rotation returned nothing — poll again shortly
            this.scheduleEvent({ timeMs: this.state.timeMs + 100, type: EventType.GCDReady, spellID: 0, effectIdx: 0, seqNo: 0 });
          }
        }
        break;

      case EventType.CastStart:
        result.spellID = ev.spellID;
        break;

      case EventType.CastComplete:
        result.spellID = ev.spellID;
        this.state.casting = null;
        this.processCastComplete(ev.spellID, result);
        break;

      case EventType.AutoAttack:
        this.processAutoAttack(result);
        break;

      case EventType.ResourceTick:
        this.processResourceTick(result);
        this.scheduleEvent({ timeMs: this.state.timeMs + 2000, type: EventType.ResourceTick, spellID: 0, effectIdx: 0, seqNo: 0 });
        break;

      case EventType.CooldownReady:
      case EventType.DotTick:
      case EventType.AuraExpire:
        result.spellID = ev.spellID;
        break;
    }

    return { result, ok: true };
  }

  private processCastComplete(spellID: number, result: StepResult): void {
    const spell = this.spells.get(spellID);
    if (!spell) return;

    for (let i = 0; i < 3; i++) {
      const eff = spell.effects[i];
      if (eff.type === SpellEffectNone) continue;

      switch (eff.type) {
        case SpellEffectSchoolDamage: {
          const dmgResult = resolveSpellDamage(spell, i, this.state.caster, this.state.target, this.rng);
          result.amount += dmgResult.damage;
          result.outcome = dmgResult.outcome;
          result.school = dmgResult.school;
          result.resisted = dmgResult.resisted;
          result.isCrit = dmgResult.outcome === Outcome.Crit;

          if (dmgResult.outcome !== Outcome.Resist) {
            this.state.totalDamage += dmgResult.damage;
            recordDamage(this.results, spellID, spell.name, dmgResult.damage, dmgResult.outcome === Outcome.Crit, false, false);
          } else {
            recordDamage(this.results, spellID, spell.name, 0, false, true, false);
          }
          break;
        }

        case SpellEffectApplyAura: {
          if (eff.auraType === AuraPeriodicDamage) {
            const spellPower = this.state.caster.spellPower[0];
            const aura = createAuraFromSpell(spell, this.state.caster.level, spellPower);
            this.state.targetAuras.addAura(aura);
            result.aurasApplied.push(spellID);
          }
          break;
        }

        case SpellEffectWeaponDamage:
        case SpellEffectNormalizedWeaponDmg: {
          const dmgResult = resolveMeleeDamage(
            this.state.caster, this.state.target,
            AttackType.MainHand, this.state.caster.weaponSkill, this.rng,
          );
          if (dmgResult.outcome !== Outcome.Miss && dmgResult.outcome !== Outcome.Dodge && dmgResult.outcome !== Outcome.Parry) {
            dmgResult.damage += eff.basePoints + 1;
          }
          result.amount += dmgResult.damage;
          result.outcome = dmgResult.outcome;
          result.school = dmgResult.school;
          result.isCrit = dmgResult.outcome === Outcome.Crit;

          if (dmgResult.outcome !== Outcome.Miss) {
            this.state.totalDamage += dmgResult.damage;
            recordDamage(this.results, spellID, spell.name, dmgResult.damage, dmgResult.outcome === Outcome.Crit, false, false);
          } else {
            recordDamage(this.results, spellID, spell.name, 0, false, true, false);
          }
          break;
        }
      }
    }

    // GCD
    let gcd = spell.gcdMs || 1500;
    const gcdReady = this.state.timeMs + gcd;
    if (gcdReady > this.state.gcdReadyMs) {
      this.scheduleEvent({ timeMs: gcdReady, type: EventType.GCDReady, spellID: 0, effectIdx: 0, seqNo: 0 });
    }

    // Cooldown
    if (spell.cooldownMs > 0) {
      this.state.cooldowns.set(spellID, this.state.timeMs + spell.cooldownMs);
      this.scheduleEvent({ timeMs: this.state.timeMs + spell.cooldownMs, type: EventType.CooldownReady, spellID, effectIdx: 0, seqNo: 0 });
    }
  }

  private processAutoAttack(result: StepResult): void {
    if (!this.state.autoAttacking) return;

    const dmgResult = resolveMeleeDamage(
      this.state.caster, this.state.target,
      AttackType.MainHand, this.state.caster.weaponSkill, this.rng,
    );
    result.amount = dmgResult.damage;
    result.outcome = dmgResult.outcome;
    result.school = dmgResult.school;
    result.isCrit = dmgResult.outcome === Outcome.Crit;

    if (dmgResult.outcome !== Outcome.Miss && dmgResult.outcome !== Outcome.Dodge && dmgResult.outcome !== Outcome.Parry) {
      this.state.totalDamage += dmgResult.damage;
      recordDamage(this.results, 0, "Auto Attack", dmgResult.damage, dmgResult.outcome === Outcome.Crit, false, false);
    } else {
      recordDamage(this.results, 0, "Auto Attack", 0, false, true, false);
    }

    const speedMs = this.state.caster.mhSpeedMs || 2000;
    this.scheduleEvent({ timeMs: this.state.timeMs + speedMs, type: EventType.AutoAttack, spellID: 0, effectIdx: 0, seqNo: 0 });
  }

  private processResourceTick(result: StepResult): void {
    const c = this.state.caster;
    switch (c.powerType) {
      case PowerMana: {
        const regen = Math.max(1, Math.floor(c.maxPower * 2 / 100));
        c.power = Math.min(c.maxPower, c.power + regen);
        result.resourceDelta = regen;
        break;
      }
      case PowerEnergy: {
        c.power = Math.min(c.maxPower, c.power + 20);
        result.resourceDelta = 20;
        break;
      }
    }
  }

  castSpell(spellID: number): string | null {
    const spell = this.spells.get(spellID);
    if (!spell) return `spell ${spellID} not found`;

    if (this.state.timeMs < this.state.gcdReadyMs) {
      return `GCD not ready`;
    }
    if (this.state.casting) {
      return `already casting ${this.state.casting.spellID}`;
    }
    const readyAt = this.state.cooldowns.get(spellID);
    if (readyAt !== undefined && this.state.timeMs < readyAt) {
      return `spell on cooldown`;
    }
    if (spell.manaCost > 0 && this.state.caster.power < spell.manaCost) {
      return `not enough resource`;
    }

    if (spell.manaCost > 0) {
      this.state.caster.power -= spell.manaCost;
    }

    if (spell.castTimeMs <= 0) {
      this.scheduleEvent({ timeMs: this.state.timeMs, type: EventType.CastComplete, spellID, effectIdx: 0, seqNo: 0 });
    } else {
      this.state.casting = {
        spellID,
        startMs: this.state.timeMs,
        completeMs: this.state.timeMs + spell.castTimeMs,
      };
      this.scheduleEvent({ timeMs: this.state.timeMs, type: EventType.CastStart, spellID, effectIdx: 0, seqNo: 0 });
      this.scheduleEvent({ timeMs: this.state.timeMs + spell.castTimeMs, type: EventType.CastComplete, spellID, effectIdx: 0, seqNo: 0 });

      if (this.state.autoAttacking) {
        this.events.remove((ev) => ev.type === EventType.AutoAttack);
        const nextSwing = this.state.timeMs + spell.castTimeMs + this.state.caster.mhSpeedMs;
        this.scheduleEvent({ timeMs: nextSwing, type: EventType.AutoAttack, spellID: 0, effectIdx: 0, seqNo: 0 });
      }
    }

    return null;
  }

  startAutoAttack(): void {
    if (this.state.autoAttacking) return;
    this.state.autoAttacking = true;
    this.scheduleEvent({ timeMs: this.state.timeMs, type: EventType.AutoAttack, spellID: 0, effectIdx: 0, seqNo: 0 });
  }

  stopAutoAttack(): void {
    this.state.autoAttacking = false;
    this.events.remove((ev) => ev.type === EventType.AutoAttack);
  }

  run(durationMs: number): SimResults {
    this.reset();
    while (true) {
      const next = this.events.peek();
      if (!next || next.timeMs > durationMs) break;
      const { ok } = this.step();
      if (!ok) break;
    }
    this.results.durationMs = durationMs;
    finalizeResults(this.results);
    return this.results;
  }

  advanceTo(targetTimeMs: number): StepResult[] {
    const results: StepResult[] = [];
    while (true) {
      const next = this.events.peek();
      if (!next || next.timeMs > targetTimeMs) break;
      const { result, ok } = this.step();
      if (!ok) break;
      results.push(result);
    }
    return results;
  }

  currentTimeMs(): number { return this.state.timeMs; }
  isGCDReady(): boolean { return this.state.timeMs >= this.state.gcdReadyMs; }
  getState(): SimState { return this.state; }
  getResults(): SimResults { return this.results; }

  isSpellReady(spellID: number): { ready: boolean; remainingMs: number } {
    const readyAt = this.state.cooldowns.get(spellID);
    if (readyAt === undefined) return { ready: true, remainingMs: 0 };
    const remaining = readyAt - this.state.timeMs;
    return remaining <= 0 ? { ready: true, remainingMs: 0 } : { ready: false, remainingMs: remaining };
  }

  resources(): { current: number; max: number } {
    return { current: this.state.caster.power, max: this.state.caster.maxPower };
  }

  currentDPS(): number {
    if (this.state.timeMs <= 0) return 0;
    return this.state.totalDamage / (this.state.timeMs / 1000.0);
  }
}

function emptyResult(): StepResult {
  return {
    timeMs: 0, event: EventType.GCDReady, spellID: 0, outcome: Outcome.Hit,
    amount: 0, school: 0, resisted: 0, isCrit: false, resourceDelta: 0,
    aurasApplied: [], aurasRemoved: [],
  };
}
