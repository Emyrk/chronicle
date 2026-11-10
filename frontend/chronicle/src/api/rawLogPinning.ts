import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateRawFilesPinnedRequest } from "./typesGenerated";

export function useUpdateRawFilesPinned(logId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pinned: boolean) => {
      const response = await fetch(`/api/v1/raidlogs/logs/${encodeURIComponent(logId)}/raw-files-pinned`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      if (!response.ok) throw new Error("Failed to update raw-log pin");
      return response.json() as Promise<UpdateRawFilesPinnedRequest>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logGroup", logId] });
      queryClient.invalidateQueries({ queryKey: ["logGroups"] });
    },
  });
}
