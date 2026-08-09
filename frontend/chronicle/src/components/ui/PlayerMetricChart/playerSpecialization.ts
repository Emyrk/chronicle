import type { ClassTalentData } from "@/components/ui/TalentTreeViewer/talentLogic";

export interface PlayerTalentSnapshot {
  heroClass: string;
  summary: readonly number[];
}

export interface PlayerSpecialization {
  name: string;
  iconTexture: string;
}

const CLASS_NAME_TO_ID: Record<string, number> = {
  warrior: 1,
  paladin: 2,
  hunter: 3,
  rogue: 4,
  priest: 5,
  deathknight: 6,
  shaman: 7,
  mage: 8,
  warlock: 9,
  druid: 11,
};

function normalizedClassName(heroClass: string): string {
  return heroClass.toLowerCase().replace(/[^a-z]/g, "");
}

export function dominantTalentTreeIndex(summary: readonly number[]): number | null {
  if (summary.length === 0) return null;

  const maximum = Math.max(...summary);
  if (maximum <= 0) return null;

  const dominantTrees = summary
    .map((points, index) => ({ points, index }))
    .filter(({ points }) => points === maximum);

  return dominantTrees.length === 1 ? dominantTrees[0].index : null;
}

export function resolvePlayerSpecialization(
  snapshot: PlayerTalentSnapshot,
  classes: Record<string, ClassTalentData>,
): PlayerSpecialization | null {
  const classID = CLASS_NAME_TO_ID[normalizedClassName(snapshot.heroClass)];
  const classTalents = classID === undefined ? undefined : classes[String(classID)];
  const treeIndex = dominantTalentTreeIndex(snapshot.summary);
  if (!classTalents || treeIndex === null) return null;

  const orderedTabs = [...classTalents.tabs].sort(
    (left, right) => left.orderIndex - right.orderIndex,
  );
  const tab = orderedTabs[treeIndex];
  if (!tab?.name || !tab.iconTexture) return null;

  return {
    name: tab.name,
    iconTexture: tab.iconTexture,
  };
}
