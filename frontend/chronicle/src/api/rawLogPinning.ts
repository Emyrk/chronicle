import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateRawFilesPinnedRequest } from "./typesGenerated";

async function putRawFilesPinned(logId: string, pinned: boolean): Promise<UpdateRawFilesPinnedRequest> {
  const response = await fetch(`/api/v1/raidlogs/logs/${encodeURIComponent(logId)}/raw-files-pinned`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned }),
  });
  if (!response.ok) throw new Error("Failed to update raw-log pin");
  return response.json() as Promise<UpdateRawFilesPinnedRequest>;
}

export function useUpdateRawFilesPinned(logId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pinned: boolean) => putRawFilesPinned(logId, pinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logGroup", logId] });
      queryClient.invalidateQueries({ queryKey: ["logGroups"] });
    },
  });
}

const BULK_PIN_CONCURRENCY = 5;

export interface BulkPinResult {
  succeeded: number;
  failed: number;
}

/** Pins or unpins many logs through the per-log endpoint, a few requests at a time. */
export function useBulkUpdateRawFilesPinned() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ logIds, pinned }: { logIds: string[]; pinned: boolean }): Promise<BulkPinResult> => {
      let succeeded = 0;
      let failed = 0;
      for (let i = 0; i < logIds.length; i += BULK_PIN_CONCURRENCY) {
        const results = await Promise.allSettled(
          logIds.slice(i, i + BULK_PIN_CONCURRENCY).map((id) => putRawFilesPinned(id, pinned)),
        );
        for (const result of results) {
          if (result.status === "fulfilled") succeeded++;
          else failed++;
        }
      }
      return { succeeded, failed };
    },
    onSettled: (_data, _error, { logIds }) => {
      for (const id of logIds) queryClient.invalidateQueries({ queryKey: ["logGroup", id] });
      queryClient.invalidateQueries({ queryKey: ["logGroups"] });
    },
  });
}
