import type { Rotation, SimState } from "../../sim/engine";

export interface RotationEntry {
  spellId: number;
  name: string;
}

/**
 * Simple priority-list rotation. Iterates entries top-to-bottom and
 * casts the first spell that is ready (off cooldown, GCD ready, has resources).
 */
export class PriorityRotation implements Rotation {
  private entries: RotationEntry[];
  constructor(entries: RotationEntry[]) {
    this.entries = entries;
  }

  nextAction(state: SimState): { type: "cast"; spellID: number } | null {
    if (state.timeMs < state.gcdReadyMs) return null;

    for (const entry of this.entries) {
      const cd = state.cooldowns.get(entry.spellId);
      if (cd !== undefined && state.timeMs < cd) continue;
      return { type: "cast", spellID: entry.spellId };
    }
    return null;
  }
}
