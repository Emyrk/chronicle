import { useMutation, useQueryClient } from "@tanstack/react-query";

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  return new Error(body?.message ?? fallback);
}

export function useMarkLogUnlisted(logId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/logs/${encodeURIComponent(logId)}/unlisted`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlisted: true }),
      });
      if (!response.ok) throw await readError(response, "Failed to make log unlisted");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logGroup", logId] });
      queryClient.invalidateQueries({ queryKey: ["logGroups"] });
      queryClient.invalidateQueries({ queryKey: ["instance"] });
    },
  });
}
