/**
 * Simulation results tracking. Ported from simulation/results.go.
 */

export interface SpellBreakdown {
  spellID: number;
  name: string;
  casts: number;
  hits: number;
  crits: number;
  misses: number;
  ticks: number;
  totalDmg: number;
  avgHit: number;
  avgCrit: number;
  dps: number;
  dpsPercent: number;
}

export interface SimResults {
  durationMs: number;
  totalDamage: number;
  dps: number;
  spellBreakdown: Map<number, SpellBreakdown>;
}

export function createSimResults(): SimResults {
  return {
    durationMs: 0,
    totalDamage: 0,
    dps: 0,
    spellBreakdown: new Map(),
  };
}

export function finalizeResults(r: SimResults): void {
  if (r.durationMs > 0) {
    r.dps = r.totalDamage / (r.durationMs / 1000.0);
  }
  for (const b of r.spellBreakdown.values()) {
    if (r.durationMs > 0) {
      b.dps = b.totalDmg / (r.durationMs / 1000.0);
    }
    if (r.totalDamage > 0) {
      b.dpsPercent = (b.totalDmg / r.totalDamage) * 100.0;
    }
    if (b.hits + b.crits > 0) {
      b.avgHit = b.totalDmg / (b.hits + b.crits);
    }
  }
}

export function recordDamage(
  r: SimResults,
  spellID: number,
  spellName: string,
  dmg: number,
  isCrit: boolean,
  isMiss: boolean,
  isTick: boolean,
): void {
  let b = r.spellBreakdown.get(spellID);
  if (!b) {
    b = {
      spellID,
      name: spellName,
      casts: 0,
      hits: 0,
      crits: 0,
      misses: 0,
      ticks: 0,
      totalDmg: 0,
      avgHit: 0,
      avgCrit: 0,
      dps: 0,
      dpsPercent: 0,
    };
    r.spellBreakdown.set(spellID, b);
  }
  if (isMiss) {
    b.misses++;
    return;
  }
  if (isTick) {
    b.ticks++;
  } else if (isCrit) {
    b.crits++;
    b.casts++;
  } else {
    b.hits++;
    b.casts++;
  }
  b.totalDmg += dmg;
  r.totalDamage += dmg;
}
