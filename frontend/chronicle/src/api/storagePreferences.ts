import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Preferences, Session } from "./typesGenerated";

export function useUpdateAutoDeleteRawLogsPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await fetch("/api/v1/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_delete_raw_logs_at_storage_capacity: enabled }),
      });
      if (!response.ok) throw new Error("Failed to update automatic raw-log cleanup preference");
      return response.json() as Promise<Preferences>;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData<Session | null>(["session"], (session) => (
        session ? { ...session, preferences } : session
      ));
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
}
