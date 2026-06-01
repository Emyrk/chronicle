import type { ArmoryPlayer } from "@/api/typesGenerated";
import {
  TalentTreeViewer,
  type TalentAllocation,
} from "@/components/ui/TalentTreeViewer/TalentTreeViewer";
import { useMemo } from "react";

const CLASS_NAME_TO_ID: Record<string, number> = {
  Warrior: 1,
  Paladin: 2,
  Hunter: 3,
  Rogue: 4,
  Priest: 5,
  Shaman: 7,
  Mage: 8,
  Warlock: 9,
  Druid: 11,
};

export function TalentsTab({ player }: { player: ArmoryPlayer }) {
  const classId = CLASS_NAME_TO_ID[player.class] ?? CLASS_NAME_TO_ID[player.class.charAt(0) + player.class.slice(1).toLowerCase()];

  const allocations = useMemo<TalentAllocation[] | undefined>(() => {
    if (!player.talents) return undefined;
    return player.talents.trees.map((tab) => ({
      tabName: tab.tab_name ?? "",
      pointsSpent: tab.points_spent,
      rankDigits: tab.ranks,
    }));
  }, [player.talents]);

  if (!classId) {
    return (
      <div className="text-sm text-zinc-500 py-8 text-center">
        Unknown class: {player.class}
      </div>
    );
  }

  if (!player.talents) {
    return (
      <div className="text-sm text-zinc-500 py-8 text-center">
        No talent data available for this character yet.
      </div>
    );
  }

  return (
    <TalentTreeViewer
      classId={classId}
      allocations={allocations}
      datasetId={player.dataset_id || undefined}
    />
  );
}
