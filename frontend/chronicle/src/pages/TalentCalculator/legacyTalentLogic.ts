import type { LegacyTalentEntry, LegacyTalentTreeData } from "@/components/ui/TalentTreeViewer/talentLogic";

export type LegacyTalentRanks = Record<number, number>;

export function legacyTreePoints(tree: LegacyTalentTreeData, ranks: LegacyTalentRanks) {
  return tree.talents.reduce((sum, talent) => sum + (ranks[talent.id] ?? 0), 0);
}

export function legacyTotalPoints(ranks: LegacyTalentRanks) {
  return Object.values(ranks).reduce((sum, rank) => sum + rank, 0);
}

function pointsBeforeColumn(tree: LegacyTalentTreeData, ranks: LegacyTalentRanks, columnIndex: number) {
  return tree.talents.reduce((sum, talent) => {
    if (talent.columnIndex >= columnIndex) return sum;
    return sum + (ranks[talent.id] ?? 0);
  }, 0);
}

function prerequisitesMet(talent: LegacyTalentEntry, tree: LegacyTalentTreeData, ranks: LegacyTalentRanks) {
  const byId = new Map(tree.talents.map((candidate) => [candidate.id, candidate]));
  const required = (talent.prereqTalent ?? []).every((id) => {
    const prereq = byId.get(id);
    return !prereq || (ranks[id] ?? 0) >= prereq.maxRank;
  });
  if (!required) return false;

  const alternatives = (talent.prereqAnyTalent ?? [])
    .map((id) => byId.get(id))
    .filter((candidate): candidate is LegacyTalentEntry => Boolean(candidate));
  return alternatives.length === 0 || alternatives.some(
    (prereq) => (ranks[prereq.id] ?? 0) >= prereq.maxRank,
  );
}

export function canUseLegacyTalent(
  talent: LegacyTalentEntry,
  tree: LegacyTalentTreeData,
  ranks: LegacyTalentRanks,
  pointsPerColumn: number,
) {
  return pointsBeforeColumn(tree, ranks, talent.columnIndex) >= talent.columnIndex * pointsPerColumn
    && prerequisitesMet(talent, tree, ranks);
}

function spentLegacyTalentsValid(
  trees: LegacyTalentTreeData[],
  ranks: LegacyTalentRanks,
  pointsPerColumn: number,
) {
  return trees.every((tree) => tree.talents.every(
    (talent) => (ranks[talent.id] ?? 0) === 0
      || canUseLegacyTalent(talent, tree, ranks, pointsPerColumn),
  ));
}

export function updateLegacyTalentRank(
  talent: LegacyTalentEntry,
  nextRank: number,
  trees: LegacyTalentTreeData[],
  ranks: LegacyTalentRanks,
  maxPoints: number,
  pointsPerColumn: number,
) {
  const tree = trees.find((candidate) => candidate.talents.some((node) => node.id === talent.id));
  if (!tree) return ranks;

  const currentRank = ranks[talent.id] ?? 0;
  const clampedRank = Math.max(0, Math.min(talent.maxRank, nextRank));
  if (clampedRank === currentRank) return ranks;
  if (clampedRank > currentRank) {
    if (!canUseLegacyTalent(talent, tree, ranks, pointsPerColumn)) return ranks;
    if (legacyTotalPoints(ranks) + clampedRank - currentRank > maxPoints) return ranks;
  }

  const candidate = { ...ranks, [talent.id]: clampedRank };
  if (clampedRank === 0) delete candidate[talent.id];
  if (!spentLegacyTalentsValid(trees, candidate, pointsPerColumn)) return ranks;
  return candidate;
}

export function encodeLegacyBuild(trees: LegacyTalentTreeData[], ranks: LegacyTalentRanks) {
  return [...trees]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((tree) => tree.talents.map((talent) => ranks[talent.id] ?? 0).join(""))
    .join("-");
}

export function decodeLegacyBuild(raw: string | null, trees: LegacyTalentTreeData[]) {
  const ranks: LegacyTalentRanks = {};
  const sections = (raw ?? "").split("-");
  [...trees]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .forEach((tree, treeIndex) => {
      const section = sections[treeIndex] ?? "";
      tree.talents.forEach((talent, talentIndex) => {
        const rank = Number.parseInt(section[talentIndex] ?? "0", 10);
        if (rank > 0) ranks[talent.id] = Math.min(rank, talent.maxRank);
      });
    });
  return ranks;
}

export function normalizeLegacyBuild(
  raw: string | null,
  trees: LegacyTalentTreeData[],
  maxPoints: number,
  pointsPerColumn: number,
) {
  const decoded = decodeLegacyBuild(raw, trees);
  let normalized: LegacyTalentRanks = {};
  for (const tree of [...trees].sort((a, b) => a.orderIndex - b.orderIndex)) {
    for (const talent of tree.talents) {
      const wanted = decoded[talent.id] ?? 0;
      for (let rank = 1; rank <= wanted; rank += 1) {
        normalized = updateLegacyTalentRank(
          talent,
          rank,
          trees,
          normalized,
          maxPoints,
          pointsPerColumn,
        );
      }
    }
  }
  return normalized;
}

export function legacyTalentLockReason(
  talent: LegacyTalentEntry,
  tree: LegacyTalentTreeData,
  ranks: LegacyTalentRanks,
  pointsPerColumn: number,
  pointsRemaining: number,
) {
  if (pointsRemaining <= 0) return "No Legacy Points remaining.";
  const required = talent.columnIndex * pointsPerColumn;
  const spentBefore = pointsBeforeColumn(tree, ranks, talent.columnIndex);
  if (spentBefore < required) return `Spend ${required} points in earlier columns of ${tree.name}.`;
  if (!prerequisitesMet(talent, tree, ranks)) return "Complete the connected prerequisite talent.";
  return null;
}
