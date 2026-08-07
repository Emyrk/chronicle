import type { ConsumableEffectKind, ConsumableEffectPolicy } from "@/api/typesGenerated";

export interface ConsumableBuff {
  id: number;
  name: string;
}

export interface ConsumableEntry {
  item_id: number;
  item_name: string;
  item_quality: number;
  item_icon: string;
  item_spell_ids: number[];
  buffs: ConsumableBuff[];
}

export interface ConsumableDatasetSnapshot {
  datasetId: string;
  consumables: ConsumableEntry[];
  policies: ConsumableEffectPolicy[];
}

export interface CommonConsumableDatasetState {
  datasetId: string;
  candidates: ConsumableEntry[];
  policy?: ConsumableEffectPolicy;
}

export interface CommonConsumableEffect {
  effectKind: ConsumableEffectKind;
  spellId: number;
  spellName: string;
  datasets: CommonConsumableDatasetState[];
  commonCandidates: ConsumableEntry[];
  candidateSetsIdentical: boolean;
  missingDatasetIds: string[];
  conflictingItemIds: number[];
}

function effectKey(effectKind: ConsumableEffectKind, spellId: number): string {
  return `${effectKind}:${spellId}`;
}

function candidateIds(candidates: ConsumableEntry[]): number[] {
  return candidates.map((candidate) => candidate.item_id).sort((a, b) => a - b);
}

function sameIds(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function buildCommonConsumableEffects(
  snapshots: ConsumableDatasetSnapshot[],
): CommonConsumableEffect[] {
  if (snapshots.length < 2) return [];

  const effectsByDataset = snapshots.map((snapshot) => {
    const effects = new Map<string, { effectKind: ConsumableEffectKind; spellId: number; spellName: string; candidates: ConsumableEntry[] }>();

    for (const item of snapshot.consumables) {
      for (const buff of item.buffs) {
        const key = effectKey("buff", buff.id);
        const effect = effects.get(key);
        if (effect) effect.candidates.push(item);
        else effects.set(key, { effectKind: "buff", spellId: buff.id, spellName: buff.name, candidates: [item] });
      }
      for (const spellId of item.item_spell_ids) {
        const key = effectKey("direct", spellId);
        const effect = effects.get(key);
        if (effect) effect.candidates.push(item);
        else effects.set(key, { effectKind: "direct", spellId, spellName: `Spell ${spellId}`, candidates: [item] });
      }
    }

    const policies = new Map(snapshot.policies.map((policy) => [effectKey(policy.effect_kind, policy.spell_id), policy]));
    return { snapshot, effects, policies };
  });

  const sharedKeys = new Set<string>();
  for (const { effects } of effectsByDataset) {
    for (const key of effects.keys()) {
      const appearances = effectsByDataset.filter((entry) => entry.effects.has(key)).length;
      if (appearances >= 2) sharedKeys.add(key);
    }
  }

  const result: CommonConsumableEffect[] = [];
  for (const key of sharedKeys) {
    const firstEffect = effectsByDataset.find((entry) => entry.effects.has(key))?.effects.get(key);
    if (!firstEffect) continue;

    const datasets = effectsByDataset.map(({ snapshot, effects, policies }) => ({
      datasetId: snapshot.datasetId,
      candidates: [...(effects.get(key)?.candidates ?? [])].sort((a, b) => a.item_id - b.item_id),
      policy: policies.get(key),
    }));
    const idSets = datasets.map((dataset) => candidateIds(dataset.candidates));
    const candidateSetsIdentical = idSets.slice(1).every((ids) => sameIds(ids, idSets[0]));
    const missingDatasetIds = datasets.filter((dataset) => dataset.candidates.length === 0).map((dataset) => dataset.datasetId);

    const itemsByDataset = new Map<number, Map<string, ConsumableEntry>>();
    for (const dataset of datasets) {
      for (const candidate of dataset.candidates) {
        const occurrences = itemsByDataset.get(candidate.item_id);
        if (occurrences) occurrences.set(dataset.datasetId, candidate);
        else itemsByDataset.set(candidate.item_id, new Map([[dataset.datasetId, candidate]]));
      }
    }

    const conflictingItemIds: number[] = [];
    const commonCandidates: ConsumableEntry[] = [];
    for (const [itemId, occurrences] of itemsByDataset) {
      if (occurrences.size !== snapshots.length) continue;
      const items = [...occurrences.values()];
      const names = new Set(items.map((item) => item.item_name.trim().toLowerCase()));
      if (names.size > 1) {
        conflictingItemIds.push(itemId);
        continue;
      }
      commonCandidates.push(items[0]);
    }
    commonCandidates.sort((a, b) => a.item_name.localeCompare(b.item_name) || a.item_id - b.item_id);

    const unionCandidateCount = itemsByDataset.size;
    const hasPolicy = datasets.some((dataset) => dataset.policy !== undefined);
    if (unionCandidateCount <= 1 && !hasPolicy) continue;

    result.push({
      effectKind: firstEffect.effectKind,
      spellId: firstEffect.spellId,
      spellName: firstEffect.spellName,
      datasets,
      commonCandidates,
      candidateSetsIdentical,
      missingDatasetIds,
      conflictingItemIds: conflictingItemIds.sort((a, b) => a - b),
    });
  }

  return result.sort((a, b) =>
    a.effectKind.localeCompare(b.effectKind)
    || a.spellName.localeCompare(b.spellName)
    || a.spellId - b.spellId,
  );
}
