import { useQueries } from "@tanstack/react-query";
import type { GuildInfo, GuildRaidClearsResponse, GuildSpeedrunHistoryResponse } from "@/api/typesGenerated";

const STALE_TIME = 5 * 60 * 1000;

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Guild history request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export function useGuildInfos(guildIds: readonly string[]) {
  return useQueries({
    queries: guildIds.map((guildId) => ({
      queryKey: ["guild-info", guildId],
      queryFn: () => fetchJSON<GuildInfo>(`/api/v1/guilds/${encodeURIComponent(guildId)}`),
      staleTime: STALE_TIME,
    })),
  });
}

/** Per-instance clear counts, used to list the raids a guild has cleared. */
export function useGuildRaidClearsList(guildIds: readonly string[]) {
  return useQueries({
    queries: guildIds.map((guildId) => ({
      queryKey: ["guild-raid-clears", guildId],
      queryFn: () => fetchJSON<GuildRaidClearsResponse>(`/api/v1/guilds/${encodeURIComponent(guildId)}/speedruns/clears`),
      staleTime: STALE_TIME,
    })),
  });
}

export function useGuildSpeedrunHistories(guildIds: readonly string[], instanceName: string | undefined) {
  return useQueries({
    queries: guildIds.map((guildId) => ({
      queryKey: ["guild-speedrun-history", guildId, instanceName],
      queryFn: () => {
        // The longest date range the page offers; shorter ranges filter client-side.
        const search = new URLSearchParams({ instance_name: instanceName ?? "", since_days: "180" });
        return fetchJSON<GuildSpeedrunHistoryResponse>(
          `/api/v1/guilds/${encodeURIComponent(guildId)}/speedruns/history?${search.toString()}`,
        );
      },
      staleTime: STALE_TIME,
      enabled: !!instanceName,
    })),
  });
}
