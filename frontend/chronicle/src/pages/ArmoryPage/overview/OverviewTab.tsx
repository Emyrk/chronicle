import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { subWeeks, startOfWeek } from "date-fns";
import type { ArmoryLootItem, ArmoryPlayer, RecentInstancesResponse } from "@/api/typesGenerated";
import { useArmoryGearHistory, useArmoryLoot, useSupportedInstanceBossCounts } from "@/api/queries";
import { useCharacterEncounters, useCharacterParses } from "@/api/rankingsQueries";
import { Button } from "@/components/ui/button";
import { bestScoreByInstance, summarizeProgress, summarizeRaids, topEncounters } from "../parseAggregation";
import { ACTIVITY_WEEKS, computeActivityStats, defaultMetric, type ParseMetric } from "./util";
import { IdentityHeader } from "./IdentityHeader";
import { ScoreCard } from "./ScoreCard";
import { TalentsCard } from "./TalentsCard";
import { GearStripCard } from "./GearStripCard";
import { RaidCalendarCard } from "./RaidCalendarCard";
import { RaidScoresCard } from "./RaidScoresCard";
import { RecentNightsCard } from "./RecentNightsCard";
import { JourneyStatsCard } from "./JourneyStatsCard";
import { ProgressionCard } from "./ProgressionCard";
import { FirstKillsCard } from "./FirstKillsCard";
import { GearTrendCard } from "./GearTrendCard";
import { LootCard } from "./LootCard";

type OverviewMode = "journey" | "performance";

const MODES: Array<[OverviewMode, string]> = [
  ["journey", "Journey"],
  ["performance", "Performance"],
];

function fetchRecentActivity(player: ArmoryPlayer, start: Date): Promise<RecentInstancesResponse> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: new Date().toISOString(),
    player_guid: player.id,
    realm_id: player.realm_id,
    limit: "200",
  });
  return fetch(`/api/v1/raidlogs/range?${params}`).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch activity: ${r.status}`);
    return r.json();
  });
}

interface OverviewTabProps {
  player: ArmoryPlayer;
  onOpenTab: (tab: "gear" | "talents" | "activity") => void;
}

export function OverviewTab({ player, onOpenTab }: OverviewTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: OverviewMode =
    searchParams.get("mode") === "performance" ? "performance" : "journey";
  const isPerformance = mode === "performance";

  const setMode = (next: OverviewMode) => {
    const params = new URLSearchParams(searchParams);
    if (next === "journey") {
      params.delete("mode");
    } else {
      params.set("mode", next);
    }
    setSearchParams(params, { replace: true });
  };

  const [metric, setMetric] = useState<ParseMetric>(() => defaultMetric(player));

  // Shared data.
  const gearHistory = useArmoryGearHistory(player.realm_name, player.id);
  const activityStart = useMemo(
    () => subWeeks(startOfWeek(new Date()), ACTIVITY_WEEKS - 1),
    [],
  );
  const activityQuery = useQuery({
    queryKey: ["armory-recent-activity", player.realm_id, player.id],
    queryFn: () => fetchRecentActivity(player, activityStart),
    staleTime: 60_000,
  });
  const activityStats = useMemo(
    () => computeActivityStats(activityQuery.data?.instances ?? [], activityStart),
    [activityQuery.data, activityStart],
  );

  // Performance mode: parse scores.
  const parsesQuery = useCharacterParses(player.id, metric);
  const raids = useMemo(
    () => summarizeRaids(parsesQuery.data?.parses ?? []),
    [parsesQuery.data],
  );
  const top3 = useMemo(() => topEncounters(raids, 3), [raids]);
  const nightScores = useMemo(
    () =>
      isPerformance
        ? bestScoreByInstance(parsesQuery.data?.parses ?? [])
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

  const timeInRaid = formatHours(activityStats.totalMs);

  const modeSelector = (
    <div className="flex items-center gap-2">
      {MODES.map(([key, label]) => (
        <Button
          key={key}
          variant={mode === key ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setMode(key)}
        >
          {label}
        </Button>
      ))}
    </div>
  );

  return (
    <div>
      <IdentityHeader player={player} actions={modeSelector}>
        <div className="lg:w-[480px]">
          {isPerformance ? (
            <ScoreCard
              score={parsesQuery.data?.score}
              top3={top3}
              metric={metric}
              onMetricChange={setMetric}
              isLoading={parsesQuery.isLoading}
            />
          ) : (
            <JourneyStatsCard
              timeInRaid={timeInRaid}
              itemsLooted={
                lootQuery.data
                  ? lootQuery.data.items.length >= 200
                    ? "200+"
                    : String(lootQuery.data.items.length)
                  : null
              }
            />
          )}
        </div>
      </IdentityHeader>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
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
              <RaidScoresCard raids={raids} metric={metric} isLoading={parsesQuery.isLoading} />
            </div>
            <div className="lg:col-span-12">
              <RecentNightsCard
                instances={activityQuery.data?.instances}
                nightScores={nightScores}
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
    </div>
  );
}

function formatHours(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}
