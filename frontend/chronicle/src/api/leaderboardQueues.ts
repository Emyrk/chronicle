import { useQuery } from "@tanstack/react-query";
import { operationJSON } from "./leaderboardOperations";

import type { LeaderboardQueueDiagnostics } from "./typesGenerated";
export type {
  LeaderboardQueueDiagnostics,
  LeaderboardQueueStatus,
} from "./typesGenerated";

export const leaderboardQueueKey = (tenantID: string) =>
  ["admin", "leaderboard-queues", tenantID] as const;
export async function fetchLeaderboardQueues(tenantID: string) {
  const snapshot = await operationJSON<LeaderboardQueueDiagnostics>(
    `/api/v1/admin/leaderboard-queues?tenant_id=${encodeURIComponent(tenantID)}`,
  );
  if (snapshot.tenant_id !== tenantID)
    throw new Error("Queue snapshot belongs to a different tenant");
  return snapshot;
}
export function useLeaderboardQueues(tenantID: string) {
  return useQuery({
    queryKey: leaderboardQueueKey(tenantID),
    queryFn: () => fetchLeaderboardQueues(tenantID),
    enabled: !!tenantID,
    refetchInterval: 15_000,
    retry: false,
  });
}

/** Age at the database snapshot time, not a client-maintained counter. */
export function queueWorkAge(
  oldest: string | undefined,
  collectedAt: string,
): string {
  if (!oldest) return "—";
  const start = Date.parse(oldest),
    end = Date.parse(collectedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Unavailable";
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
export function queueFamilyLabel(family: string): string {
  const labels: Record<string, string> = {
    runs: "D1 · Canonical runs",
    player_boss_benchmarks: "D2 · Player boss benchmarks",
    player_boss_subjects: "D2 · Player boss summaries",
    guild_boss_benchmarks: "D2 · Guild boss benchmarks",
    guild_boss_subjects: "D2 · Guild boss summaries",
    guild_clear_benchmarks: "D2 · Guild clear benchmarks",
    guild_clear_subjects: "D2 · Guild clear summaries",
    player_renown: "D2 · Player Renown counts",
    guild_renown: "D2 · Guild Renown counts",
  };
  return labels[family] ?? family.replaceAll("_", " ");
}
