/**
 * Aura tracking system. Ported from simulation/combat/aura.go.
 */

import { type SpellData, SpellEffectNone, SpellEffectApplyAura, AuraPeriodicDamage } from "./types";
import { defaultSpellCoefficient, levelPenalty } from "./formulas";

export interface AuraEffect {
  type: number;
  amount: number;
  miscValue: number;
  periodicMs: number;
  nextTickMs: number;
  active: boolean;
}

export interface Aura {
  spellID: number;
  casterLevel: number;
  effects: [AuraEffect, AuraEffect, AuraEffect];
  maxDurationMs: number;
  remainingMs: number;
  stackCount: number;
  maxStacks: number;
  procCharges: number;
  permanent: boolean;
}

export interface AuraTickEvent {
  spellID: number;
  effectIdx: number;
  amount: number;
  auraType: number;
}

function emptyEffect(): AuraEffect {
  return { type: 0, amount: 0, miscValue: 0, periodicMs: 0, nextTickMs: 0, active: false };
}

export class AuraTracker {
  private auras: Aura[] = [];

  addAura(a: Aura): void {
    for (const existing of this.auras) {
      if (existing.spellID === a.spellID) {
        existing.remainingMs = a.maxDurationMs;
        if (existing.maxStacks > 0 && existing.stackCount < existing.maxStacks) {
          existing.stackCount++;
        }
        for (let i = 0; i < 3; i++) {
          if (a.effects[i].active) existing.effects[i] = { ...a.effects[i] };
        }
        return;
      }
    }
    if (a.stackCount === 0) a.stackCount = 1;
    this.auras.push(a);
  }

  removeAura(spellID: number): void {
    const idx = this.auras.findIndex((a) => a.spellID === spellID);
    if (idx >= 0) this.auras.splice(idx, 1);
  }

  getAura(spellID: number): Aura | undefined {
    return this.auras.find((a) => a.spellID === spellID);
  }

  hasAura(spellID: number): boolean {
    return this.getAura(spellID) !== undefined;
  }

  activeAuras(): Aura[] {
    return this.auras;
  }

  getTotalModifier(auraType: number, schoolMask: number): number {
    let total = 0;
    for (const a of this.auras) {
      for (const eff of a.effects) {
        if (!eff.active || eff.type !== auraType) continue;
        if (schoolMask === 0 || eff.miscValue === 0 || (eff.miscValue & schoolMask) !== 0) {
          total += eff.amount * a.stackCount;
        }
      }
    }
    return total;
  }

  getTotalModifierPercent(auraType: number, schoolMask: number): number {
    let product = 1.0;
    for (const a of this.auras) {
      for (const eff of a.effects) {
        if (!eff.active || eff.type !== auraType) continue;
        if (schoolMask === 0 || eff.miscValue === 0 || (eff.miscValue & schoolMask) !== 0) {
          for (let s = 0; s < a.stackCount; s++) {
            product *= 1.0 + eff.amount / 100.0;
          }
        }
      }
    }
    return product;
  }

  tickAuras(deltaMs: number): AuraTickEvent[] {
    const events: AuraTickEvent[] = [];
    for (const a of this.auras) {
      for (let i = 0; i < 3; i++) {
        const eff = a.effects[i];
        if (!eff.active || eff.periodicMs <= 0) continue;
        eff.nextTickMs -= deltaMs;
        while (eff.nextTickMs <= 0) {
          events.push({
            spellID: a.spellID,
            effectIdx: i,
            amount: eff.amount * a.stackCount,
            auraType: eff.type,
          });
          eff.nextTickMs += eff.periodicMs;
        }
      }
    }
    return events;
  }

  expireAuras(deltaMs: number): number[] {
    const expired: number[] = [];
    this.auras = this.auras.filter((a) => {
      if (a.permanent) return true;
      a.remainingMs -= deltaMs;
      if (a.remainingMs <= 0) {
        expired.push(a.spellID);
        return false;
      }
      return true;
    });
    return expired;
  }
}

/** Create an Aura from spell data, snapshotting periodic damage with spell power. */
export function createAuraFromSpell(spell: SpellData, casterLevel: number, spellPower: number): Aura {
  const a: Aura = {
    spellID: spell.id,
    casterLevel,
    effects: [emptyEffect(), emptyEffect(), emptyEffect()],
    maxDurationMs: spell.durationMs,
    remainingMs: spell.durationMs,
    stackCount: 1,
    maxStacks: 0,
    procCharges: 0,
    permanent: false,
  };

  for (let i = 0; i < 3; i++) {
    const eff = spell.effects[i];
    if (eff.type === SpellEffectNone) continue;
    if (eff.type === SpellEffectApplyAura) {
      const ae: AuraEffect = {
        type: eff.auraType,
        amount: eff.basePoints + 1,
        miscValue: eff.miscValue,
        periodicMs: eff.auraPeriodMs,
        nextTickMs: eff.auraPeriodMs > 0 ? eff.auraPeriodMs : 0,
        active: true,
      };
      if (eff.auraType === AuraPeriodicDamage) {
        let coeff = eff.bonusCoefficient;
        if (coeff < 0) {
          let numTicks = 0;
          if (eff.auraPeriodMs > 0 && spell.durationMs > 0) {
            numTicks = Math.floor(spell.durationMs / eff.auraPeriodMs);
          }
          coeff = defaultSpellCoefficient(spell.castTimeMs, spell.durationMs, true, false, numTicks);
        }
        ae.amount += spellPower * coeff * levelPenalty(spell.spellLevel);
      }
      a.effects[i] = ae;
    }
  }

  return a;
}
