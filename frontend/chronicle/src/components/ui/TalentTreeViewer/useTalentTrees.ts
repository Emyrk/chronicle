import { useQuery } from "@tanstack/react-query";
import type { TalentTreeJSON } from "./talentLogic";

/**
 * Fetches talent trees for a dataset. A 404 means the dataset has no talent
 * data imported yet; that resolves to `null` (handled as a graceful empty
 * state) rather than throwing.
 */
export function useTalentTrees(datasetId?: string) {
  return useQuery<TalentTreeJSON | null>({
    queryKey: ["talent-trees", datasetId ?? "default"],
    queryFn: async () => {
      const url = datasetId
        ? `/api/v1/wowdb/talent-trees?dataset_id=${encodeURIComponent(datasetId)}`
        : "/api/v1/wowdb/talent-trees";
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch talent trees");
      return res.json();
    },
    staleTime: Infinity,
  });
}
