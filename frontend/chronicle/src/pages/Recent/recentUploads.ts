import { useQuery } from "@tanstack/react-query";
import type { RecentInstancesResponse } from "@/api/typesGenerated";

// Shared by Home and the /start landing; kept out of Home so /start doesn't load the Home chunk.
export function useRecentUploads() {
  return useQuery({
    queryKey: ["home", "recent-uploads"],
    queryFn: async () => {
      const response = await fetch("/api/v1/raidlogs/recent?days=60&limit=12");
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      return response.json() as Promise<RecentInstancesResponse>;
    },
    staleTime: 60 * 1000,
  });
}
