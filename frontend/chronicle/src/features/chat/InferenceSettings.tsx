import { useEffect } from "react";
import { CircleCheck, CircleMinus, ExternalLink, LoaderCircle, ServerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/Switch/Switch";
import { useAuth } from "@/hooks/useAuth";
import {
  useAuthorizeOpenRouter,
  useDeleteInferenceConnection,
  useInferenceConnections,
  useInferenceSettings,
  useUpdateInferenceSettings,
} from "./api";
import { parseInferenceOAuthResult, safeLocalReturnPath } from "./inference";
import { inferenceStatus, type InferenceStatus } from "./inferencePreference";

const statusPresentation: Record<InferenceStatus, { icon: typeof CircleCheck; label: string; className: string }> = {
  unavailable: { icon: ServerOff, label: "Unavailable on this server", className: "text-muted-foreground" },
  "not-capable": { icon: CircleMinus, label: "Not enabled for this account", className: "text-muted-foreground" },
  disabled: { icon: CircleMinus, label: "Disabled by you", className: "text-amber-500" },
  enabled: { icon: CircleCheck, label: "Enabled", className: "text-emerald-500" },
};

export function InferenceSettings() {
  const { isAuthenticated } = useAuth();
  const settings = useInferenceSettings(isAuthenticated);
  const updateSettings = useUpdateInferenceSettings();
  const connections = useInferenceConnections({ enabled: isAuthenticated && Boolean(settings.data?.enabled) });
  const authorize = useAuthorizeOpenRouter();
  const disconnect = useDeleteInferenceConnection();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const result = parseInferenceOAuthResult(searchParams);
    if (!result) return;
    if (result.type === "success") toast.success(result.message);
    else toast.error("OpenRouter connection failed", { description: result.message });
    const cleaned = new URLSearchParams(searchParams);
    result.keys.forEach((key) => cleaned.delete(key));
    setSearchParams(cleaned, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!isAuthenticated) return null;

  const connect = async () => {
    try {
      const result = await authorize.mutateAsync({
        return_path: safeLocalReturnPath(location.pathname, location.search),
      });
      window.location.assign(result.authorize_url);
    } catch (error) {
      toast.error("Could not connect OpenRouter", { description: error instanceof Error ? error.message : undefined });
    }
  };

  const preference = settings.data;
  const status = statusPresentation[preference ? inferenceStatus(preference) : "unavailable"];
  const StatusIcon = status.icon;

  return (
    <section className="rounded-lg border p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h3 className="font-medium">AI assistant</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Control whether Chronicle AI features appear for your account. When enabled, you can connect your own OpenRouter account to fund assistant requests.
          </p>
        </div>
        {settings.isLoading ? (
          <span className="text-muted-foreground flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" /> Checking status…</span>
        ) : settings.error ? (
          <span className="text-destructive text-sm">Could not load AI status.</span>
        ) : (
          <span className={`flex items-center gap-2 text-sm font-medium ${status.className}`}>
            <StatusIcon className="size-4" /> {status.label}
          </span>
        )}
      </div>

      {preference && (
        <div className="bg-muted/30 mt-4 flex items-start justify-between gap-4 rounded-md border px-3 py-3">
          <div>
            <label htmlFor="allow-inference" className="text-sm font-medium">Allow AI features on my account</label>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {!preference.available
                ? "Your preference will be saved and applied if AI access is granted later."
                : "Turn this off to hide AI controls and block assistant requests for your account."}
            </p>
          </div>
          <Switch
            id="allow-inference"
            checked={!preference.disabled}
            disabled={updateSettings.isPending}
            onCheckedChange={(checked) => updateSettings.mutate(
              { disabled: !checked },
              { onError: (error) => toast.error("Could not update AI preference", { description: error.message }) },
            )}
            aria-label="Allow AI features on my account"
          />
        </div>
      )}

      {preference?.enabled && (
        <div className="mt-4 border-t pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-muted-foreground max-w-2xl text-sm">
              Authorization happens on OpenRouter; Chronicle never receives your OpenRouter password, and no API key is stored in this browser.
            </p>
            <Button onClick={() => void connect()} disabled={authorize.isPending}>
              {authorize.isPending ? <LoaderCircle className="animate-spin" /> : <ExternalLink />}
              Connect OpenRouter
            </Button>
          </div>

          {connections.isLoading ? (
            <p className="text-muted-foreground mt-4 flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" /> Loading connections…</p>
          ) : connections.error ? (
            <p className="text-destructive mt-4 text-sm">{connections.error.message}</p>
          ) : connections.data?.connections.length ? (
            <div className="mt-4 space-y-2">
              {connections.data.connections.map((connection) => (
                <div key={connection.id} className="bg-muted/30 flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{connection.label}</p>
                    <p className="text-muted-foreground text-xs capitalize">{connection.provider} · {connection.status}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate(connection.id, {
                      onSuccess: () => toast.success("AI connection removed."),
                      onError: (error) => toast.error("Could not disconnect provider", { description: error.message }),
                    })}
                  >
                    <Trash2 /> Disconnect
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground mt-4 text-sm">No AI provider is connected yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
