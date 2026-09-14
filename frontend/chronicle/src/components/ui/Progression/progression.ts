export interface ProgressionEncounter {
  readonly instance_name: string;
  readonly encounter_name: string;
  readonly difficulty_name: string;
  readonly max_players: number;
  readonly kills: number;
  readonly last_killed_at: string;
}

/** One size/difficulty lockout of an instance. */
export interface ProgressionVariant {
  instanceName: string;
  difficultyName: string;
  maxPlayers: number;
  heroic: boolean;
  encountersDown: number;
  killedBosses: string[];
  kills: number;
  lastKilledAt: string;
}

/** An instance with every size/difficulty variant nested under it. */
export interface InstanceProgression {
  instanceName: string;
  variants: ProgressionVariant[];
  kills: number;
  lastKilledAt: string;
}

/**
 * Builds the common progression model used by character and guild panels.
 * Instances with canonical metadata ignore optional encounters.
 */
export function groupProgression(
  encounters: readonly ProgressionEncounter[],
  progressionBosses?: Map<string, Set<string>>,
): InstanceProgression[] {
  const byVariant = new Map<string, ProgressionVariant>();

  for (const encounter of encounters) {
    const canonical = progressionBosses?.get(encounter.instance_name);
    if (canonical != null && !canonical.has(encounter.encounter_name)) continue;

    const key = `${encounter.instance_name}|${encounter.difficulty_name}|${encounter.max_players}`;
    const variant = byVariant.get(key);
    if (variant) {
      if (!variant.killedBosses.includes(encounter.encounter_name)) {
        variant.killedBosses.push(encounter.encounter_name);
        variant.encountersDown++;
      }
      variant.kills += encounter.kills;
      if (encounter.last_killed_at > variant.lastKilledAt) {
        variant.lastKilledAt = encounter.last_killed_at;
      }
      continue;
    }

    byVariant.set(key, {
      instanceName: encounter.instance_name,
      difficultyName: encounter.difficulty_name,
      maxPlayers: encounter.max_players,
      heroic: encounter.difficulty_name.includes("Heroic"),
      encountersDown: 1,
      killedBosses: [encounter.encounter_name],
      kills: encounter.kills,
      lastKilledAt: encounter.last_killed_at,
    });
  }

  const byInstance = new Map<string, InstanceProgression>();
  for (const variant of byVariant.values()) {
    const instance = byInstance.get(variant.instanceName);
    if (instance) {
      instance.variants.push(variant);
      instance.kills += variant.kills;
      if (variant.lastKilledAt > instance.lastKilledAt) {
        instance.lastKilledAt = variant.lastKilledAt;
      }
    } else {
      byInstance.set(variant.instanceName, {
        instanceName: variant.instanceName,
        variants: [variant],
        kills: variant.kills,
        lastKilledAt: variant.lastKilledAt,
      });
    }
  }

  for (const instance of byInstance.values()) {
    instance.variants.sort(
      (a, b) => b.maxPlayers - a.maxPlayers || Number(b.heroic) - Number(a.heroic),
    );
  }

  return [...byInstance.values()];
}

export function progressionTotal(
  instanceName: string,
  variants: readonly Pick<ProgressionVariant, "encountersDown">[],
  bossCounts?: Map<string, number>,
  progressionBosses?: Map<string, Set<string>>,
): number {
  const known = progressionBosses?.get(instanceName)?.size ?? bossCounts?.get(instanceName) ?? 0;
  return Math.max(known, ...variants.map((variant) => variant.encountersDown));
}

export function progressionVariantLabel(
  variant: Pick<ProgressionVariant, "difficultyName" | "maxPlayers" | "heroic">,
  format: "short" | "long" = "short",
): string {
  if (format === "long") {
    return [variant.maxPlayers > 0 ? `${variant.maxPlayers}-player` : "", variant.difficultyName]
      .filter(Boolean)
      .join(" ");
  }

  const parts: string[] = [];
  if (variant.maxPlayers > 0) parts.push(String(variant.maxPlayers));
  if (variant.heroic) parts.push("HC");
  return parts.join(" ");
}

export interface ProgressionBossStatus {
  killed: string[];
  missing: string[];
}

/** Splits a canonical boss list while preserving its progression order. */
export function progressionBossStatus(
  canonicalBosses: Iterable<string>,
  killedBosses: Iterable<string>,
): ProgressionBossStatus {
  const killedSet = new Set(killedBosses);
  const status: ProgressionBossStatus = { killed: [], missing: [] };

  for (const boss of canonicalBosses) {
    (killedSet.has(boss) ? status.killed : status.missing).push(boss);
  }

  return status;
}
