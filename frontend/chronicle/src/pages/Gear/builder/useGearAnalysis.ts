import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useSimItems } from "@/api/gamedata";
import type { GearStage } from "./gearListModel";
import {
  aggregateItemStats,
  evaluateTargets,
  scoreItem,
  type StatWeights,
  type TargetEvaluation,
} from "./gearScoring";
import type { AnalysisProfile } from "./GearAnalysisSheet";

export interface GearAnalysisState {
  profileId: string | null;
  selection: AnalysisProfile | null;
  setSelection: (profile: AnalysisProfile | null) => void;
  scores?: Map<number, number>;
  totalScore?: number;
  statTotals?: StatWeights;
  targetEvaluations?: TargetEvaluation[];
}

/** Optional profile selection plus live analysis for one displayed stage. */
export function useGearAnalysis(
  stage: GearStage | undefined,
  savedProfileId?: string,
  onProfileIdChange?: (profileId: string | null) => void,
): GearAnalysisState {
  const [searchParams, setSearchParams] = useSearchParams();
  const profileId = searchParams.get("profile") ?? savedProfileId ?? null;
  const [selection, setSelectionState] = useState<AnalysisProfile | null>(null);
  const setSelection = useCallback(
    (profile: AnalysisProfile | null) => {
      setSelectionState(profile);
      onProfileIdChange?.(profile?.id ?? null);
      const next = new URLSearchParams(searchParams);
      if (profile) next.set("profile", profile.id);
      else next.delete("profile");
      setSearchParams(next, { replace: true });
    },
    [onProfileIdChange, searchParams, setSearchParams],
  );

  const itemIds =
    stage && selection
      ? Object.values(stage.slots)
          .filter((entry) => !!entry)
          .map((entry) => entry!.item_id)
      : [];
  const simItems = useSimItems(itemIds);
  if (!stage || !selection) return { profileId, selection, setSelection };

  const scores = new Map<number, number>();
  let totalScore = 0;
  for (const [slot, entry] of Object.entries(stage.slots)) {
    if (!entry) continue;
    const item = simItems.get(entry.item_id);
    if (!item) continue;
    const score = scoreItem(item, selection.weights);
    scores.set(Number(slot), score);
    totalScore += score;
  }

  const complete = itemIds.every((itemId) => simItems.has(itemId));
  const statTotals = complete
    ? aggregateItemStats(itemIds.map((itemId) => simItems.get(itemId)!))
    : undefined;
  const targetEvaluations = statTotals
    ? evaluateTargets(statTotals, selection.targets)
    : undefined;

  return {
    profileId,
    selection,
    setSelection,
    scores,
    totalScore,
    statTotals,
    targetEvaluations,
  };
}
