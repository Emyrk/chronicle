import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { ArmoryLootItem, ArmoryPlayer } from "@/api/typesGenerated";
import { useArmoryGearHistory, useArmoryLoot, useSupportedInstanceBossCounts } from "@/api/queries";
import { useCharacterEncounters, useCharacterParses } from "@/api/rankingsQueries";
import { averageScoreByInstance, bestScoreByInstance, summarizeProgress, summarizeRaids } from "../parseAggregation";
import type { ParseMetric } from "./util";
import { useRecentActivity } from "./useRecentActivity";
import { TalentsCard } from "./TalentsCard";
import { GearStripCard } from "./GearStripCard";
import { RaidCalendarCard } from "./RaidCalendarCard";
import { RaidScoresCard } from "./RaidScoresCard";
import { RecentNightsCard } from "./RecentNightsCard";
import { ProgressionCard } from "./ProgressionCard";
import { FirstKillsCard } from "./FirstKillsCard";
import { GearTrendCard } from "./GearTrendCard";
import { LootCard } from "./LootCard";

interface OverviewTabProps {
  player: ArmoryPlayer;
  onOpenTab: (tab: "gear" | "talents" | "activity") => void;
  metric: ParseMetric;
}

export function OverviewTab({ player, onOpenTab, metric }: OverviewTabProps) {
  const [searchParams] = useSearchParams();
  const isPerformance = searchParams.get("mode") === "performance";

  // Shared data.
  const gearHistory = useArmoryGearHistory(player.realm_name, player.id);
  const {
    start: activityStart,
    query: activityQuery,
    stats: activityStats,
  } = useRecentActivity(player);

  // Performance mode: parse scores.
  const parsesQuery = useCharacterParses(player.id, metric);
  const raids = useMemo(
    () => summarizeRaids(parsesQuery.data?.parses ?? []),
    [parsesQuery.data],
  );
  const nightScores = useMemo(
    () =>
      isPerformance
        ? bestScoreByInstance(parsesQuery.data?.parses ?? [])
        : new Map<string, number>(),
    [parsesQuery.data, isPerformance],
  );
  const nightAverages = useMemo(
    () =>
      isPerformance
        ? averageScoreByInstance(parsesQuery.data?.parses ?? [])
        : new Map<string, number>(),
    [parsesQuery.data, isPerformance],
  );

  // Journey mode: participation, progression, and loot.
  const encountersQuery = useCharacterEncounters(player.id, !isPerformance);
  const lootQuery = useArmoryLoot(player.realm_name, player.id, !isPerformance);
  const { data: bossCounts } = useSupportedInstanceBossCounts();
  const progress = useMemo(
    () => summarizeProgress(encountersQuery.data?.encounters ?? []),
    [encountersQuery.data],
  );
  const lootByInstance = useMemo(() => {
    const map = new Map<string, ArmoryLootItem[]>();
    for (const item of lootQuery.data?.items ?? []) {
      const arr = map.get(item.instance_id);
      if (arr) {
        arr.push(item);
      } else {
        map.set(item.instance_id, [item]);
      }
    }
    return map;
  }, [lootQuery.data]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-12">
        <GearStripCard
          player={player}
          latestSnapshot={gearHistory.data?.snapshots[0]}
          onOpenGear={() => onOpenTab("gear")}
        />
      </div>

      <div className="lg:col-span-5">
        <TalentsCard player={player} onOpenTalents={() => onOpenTab("talents")} />
      </div>
      <div className="lg:col-span-7">
        <RaidCalendarCard
          instances={activityQuery.data?.instances}
          nightScores={nightScores}
          start={activityStart}
          stats={activityStats}
          onOpenActivity={() => onOpenTab("activity")}
        />
      </div>

        {isPerformance ? (
        <>
          <div className="lg:col-span-12">
            <RaidScoresCard
              raids={raids}
              metric={metric}
              bossCounts={bossCounts}
              isLoading={parsesQuery.isLoading}
            />
          </div>
          <div className="lg:col-span-12">
            <RecentNightsCard
              instances={activityQuery.data?.instances}
              nightScores={nightAverages}
              onOpenActivity={() => onOpenTab("activity")}
            />
          </div>
        </>
      ) : (
        <>
          <div className="lg:col-span-4">
            <ProgressionCard
              progress={progress}
              bossCounts={bossCounts}
              isLoading={encountersQuery.isLoading}
            />
          </div>
          <div className="lg:col-span-5">
            <FirstKillsCard
              encounters={encountersQuery.data?.encounters}
              isLoading={encountersQuery.isLoading}
            />
          </div>
          <div className="lg:col-span-3">
            <GearTrendCard
              snapshots={gearHistory.data?.snapshots}
              isLoading={gearHistory.isLoading}
            />
          </div>
          <div className="lg:col-span-7">
            <RecentNightsCard
              instances={activityQuery.data?.instances}
              nightScores={nightScores}
              lootByInstance={lootByInstance}
              onOpenActivity={() => onOpenTab("activity")}
            />
          </div>
          <div className="lg:col-span-5">
            <LootCard items={lootQuery.data?.items} isLoading={lootQuery.isLoading} />
          </div>
        </>
      )}
    </div>
  );
}
