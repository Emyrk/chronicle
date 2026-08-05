import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subWeeks, startOfWeek } from "date-fns";
import type { ArmoryPlayer, RecentInstancesResponse } from "@/api/typesGenerated";
import { useArmoryGearHistory } from "@/api/queries";
import { ACTIVITY_WEEKS, defaultMetric, type ParseMetric } from "./util";
import { useCharacterParses } from "@/api/rankingsQueries";
import { bestScoreByInstance, summarizeRaids, topEncounters } from "../parseAggregation";
import { ScoreCard } from "./ScoreCard";
import { TalentsCard } from "./TalentsCard";
import { GearStripCard } from "./GearStripCard";
import { RaidCalendarCard } from "./RaidCalendarCard";
import { RaidScoresCard } from "./RaidScoresCard";
import { RecentNightsCard } from "./RecentNightsCard";

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
  const [metric, setMetric] = useState<ParseMetric>(() => defaultMetric(player));

  const parsesQuery = useCharacterParses(player.id, metric);
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

  const raids = useMemo(
    () => summarizeRaids(parsesQuery.data?.parses ?? []),
    [parsesQuery.data],
  );
  const top3 = useMemo(() => topEncounters(raids, 3), [raids]);
  const nightScores = useMemo(
    () => bestScoreByInstance(parsesQuery.data?.parses ?? []),
    [parsesQuery.data],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <ScoreCard
          score={parsesQuery.data?.score}
          top3={top3}
          metric={metric}
          onMetricChange={setMetric}
          isLoading={parsesQuery.isLoading}
        />
      </div>
      <div className="lg:col-span-5">
        <TalentsCard player={player} onOpenTalents={() => onOpenTab("talents")} />
      </div>

      <div className="lg:col-span-12">
        <GearStripCard
          player={player}
          latestSnapshot={gearHistory.data?.snapshots[0]}
          onOpenGear={() => onOpenTab("gear")}
        />
      </div>

      <div className="lg:col-span-12">
        <RaidCalendarCard
          instances={activityQuery.data?.instances}
          nightScores={nightScores}
          start={activityStart}
          onOpenActivity={() => onOpenTab("activity")}
        />
      </div>

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
    </div>
  );
}
