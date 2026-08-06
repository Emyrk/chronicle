import { useQuery } from "@tanstack/react-query";
import type { SpeedrunResult } from "@/api/typesGenerated";
import type { PanelContext } from "../../types";
import { capabilitiesFromSpeedrun, type LeaderboardCapabilities } from "./capabilities";

export function useLeaderboardCapabilities(
  context: PanelContext,
): Partial<LeaderboardCapabilities> {
  const instanceId = context.instance.id;
  const { data } = useQuery({
    queryKey: ["instance-speedrun", instanceId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/raidlogs/instances/${encodeURIComponent(instanceId)}/speedrun`,
      );
      if (!response.ok) return null;
      return response.json() as Promise<SpeedrunResult>;
    },
    staleTime: Infinity,
    retry: false,
  });

  return capabilitiesFromSpeedrun(data);
}
