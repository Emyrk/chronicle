import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek, subWeeks } from "date-fns";
import type { ArmoryPlayer, RecentInstancesResponse } from "@/api/typesGenerated";
import { ACTIVITY_WEEKS, computeActivityStats } from "./util";

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

/** The character's raid activity over the heatmap window, with stats. */
export function useRecentActivity(player: ArmoryPlayer) {
  const start = useMemo(() => subWeeks(startOfWeek(new Date()), ACTIVITY_WEEKS - 1), []);
  const query = useQuery({
    queryKey: ["armory-recent-activity", player.realm_id, player.id],
    queryFn: () => fetchRecentActivity(player, start),
    staleTime: 60_000,
  });
  const stats = useMemo(
    () => computeActivityStats(query.data?.instances ?? [], start),
    [query.data, start],
  );
  return { start, query, stats };
}
