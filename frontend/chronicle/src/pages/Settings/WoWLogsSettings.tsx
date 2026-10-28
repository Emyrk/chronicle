import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSiteConfig } from "@/api/queries";
import type { SetWoWLogsTokenRequest, WoWLogsSettings as WoWLogsSettingsResponse } from "@/api/typesGenerated";

const QUERY_KEY = ["me", "wow-logs"];

async function readSettings(response: Response): Promise<WoWLogsSettingsResponse> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "Request failed");
  }
  return response.json();
}

// WoWLogsSettings lets an uploader opt their own uploads into forwarding by
// saving their personal token. It only renders on tenants with forwarding
// enabled, so it stays out of sight everywhere else.
export function WoWLogsSettings() {
  const { data: siteConfig } = useSiteConfig();
  const enabled = siteConfig?.tenant?.wow_logs_forwarding_enabled ?? false;
  const queryClient = useQueryClient();
  const [token, setToken] = useState("");

  const { data: settings } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => readSettings(await fetch("/api/v1/me/wow-logs")),
    enabled,
  });

  const save = useMutation({
    mutationFn: async (value: string) => {
      const body: SetWoWLogsTokenRequest = { token: value };
      return readSettings(await fetch("/api/v1/me/wow-logs/token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }));
    },
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
      setToken("");
      toast.success("Token saved.");
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async () => readSettings(await fetch("/api/v1/me/wow-logs/token", { method: "DELETE" })),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
      toast.success("Token removed.");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!enabled || !settings?.available) return null;

  const busy = save.isPending || remove.isPending;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">wow-logs.co.in</h3>
        <p className="text-xs text-muted-foreground">
          Save your own wow-logs.co.in API token to also send your uploads there. Only your uploads use your
          token. Remove it at any time to stop.
        </p>
      </div>
      {settings.token_set && (
        <div className="flex items-center gap-2 text-sm">
          <span>
            Token saved
            {settings.token_updated_at && (
              <span className="text-muted-foreground"> · {new Date(settings.token_updated_at).toLocaleDateString()}</span>
            )}
          </span>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => remove.mutate()}>
            Remove
          </Button>
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) save.mutate(token.trim());
        }}
      >
        <Input
          type="password"
          autoComplete="off"
          placeholder={settings.token_set ? "Replace token" : "API token"}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          maxLength={512}
        />
        <Button type="submit" size="sm" disabled={busy || !token.trim()}>
          Save
        </Button>
      </form>
    </div>
  );
}
