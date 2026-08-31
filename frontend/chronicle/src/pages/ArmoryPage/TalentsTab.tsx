import type { ArmoryPlayer } from "@/api/typesGenerated";
import {
  TalentTreeViewerLegacy as TalentTreeViewer,
  type TalentAllocation,
} from "@/components/ui/TalentTreeViewer/TalentTreeViewer";
import { classNameToId } from "@/pages/Rankings/classDisplay";
import { useMemo } from "react";

export function TalentsTab({ player }: { player: ArmoryPlayer }) {
  const classId = classNameToId(player.class);

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
