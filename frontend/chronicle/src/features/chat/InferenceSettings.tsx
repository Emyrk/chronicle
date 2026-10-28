import { useEffect, type ReactNode } from "react";
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
  const statusBadge = settings.isLoading ? (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs"><LoaderCircle className="size-3.5 animate-spin" /> Checking…</span>
  ) : settings.error ? (
    <span className="text-destructive text-xs">Could not load AI status.</span>
  ) : (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${status.className}`}><StatusIcon className="size-3.5" /> {status.label}</span>
  );

  if (preference && !preference.available) {
    return (
      <SettingsSection title="General">
        <Row title="AI features" description="Your account has not been granted AI assistant access, so there are no AI settings or actions for it." aside={statusBadge} />
      </SettingsSection>
    );
  }

  const connectionList = connections.data?.connections ?? [];
  return (
    <div className="space-y-8">
      <SettingsSection title="General">
        <Row
          title={<label htmlFor="allow-inference">Allow AI features on my account</label>}
          description="Turn this off to hide every AI control and block assistant requests for your account."
          aside={<>
            {statusBadge}
            {preference && (
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
            )}
          </>}
        />
      </SettingsSection>

      {preference && preference.assistants?.length > 0 && (
        <SettingsSection
          title="Assistants"
          description={preference.disabled ? "Turn on AI features to choose assistants." : "Choose which assistants appear. A turned-off assistant is hidden and cannot run for your account."}
        >
          {preference.assistants.map((assistant) => (
            <Row
              key={assistant.id}
              muted={preference.disabled}
              title={<label htmlFor={`assistant-${assistant.id}`}>{assistant.name}</label>}
              description={assistant.description}
              aside={
                <Switch
                  id={`assistant-${assistant.id}`}
                  checked={assistant.enabled}
                  disabled={preference.disabled || updateSettings.isPending}
                  onCheckedChange={(checked) => updateSettings.mutate(
                    { assistants: { [assistant.id]: checked } },
                    { onError: (error) => toast.error(`Could not update ${assistant.name}`, { description: error.message }) },
                  )}
                  aria-label={assistant.name}
                />
              }
            />
          ))}
        </SettingsSection>
      )}

      {preference?.enabled && (
        <SettingsSection
          title="Provider"
          description="Assistant requests are paid for by your own OpenRouter account. Authorization happens on OpenRouter; Chronicle never sees your password and stores no API key in this browser."
          action={
            <Button size="sm" onClick={() => void connect()} disabled={authorize.isPending}>
              {authorize.isPending ? <LoaderCircle className="animate-spin" /> : <ExternalLink />}
              Connect OpenRouter
            </Button>
          }
        >
          {connections.isLoading ? (
            <Row title={<span className="text-muted-foreground flex items-center gap-2 font-normal"><LoaderCircle className="size-4 animate-spin" /> Loading connections…</span>} />
          ) : connections.error ? (
            <Row title={<span className="text-destructive font-normal">{connections.error.message}</span>} />
          ) : connectionList.length ? connectionList.map((connection) => (
            <Row
              key={connection.id}
              title={connection.label}
              description={<span className="capitalize">{connection.status}</span>}
              aside={
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disconnect.isPending}
                  onClick={() => disconnect.mutate(connection.id, {
                    onSuccess: () => toast.success("AI connection removed."),
                    onError: (error) => toast.error("Could not disconnect provider", { description: error.message }),
                  })}
                >
                  <Trash2 /> Disconnect
                </Button>
              }
            />
          )) : (
            <Row title={<span className="text-muted-foreground font-normal">No AI provider is connected yet.</span>} />
          )}
        </SettingsSection>
      )}
    </div>
  );
}

/** A titled group of settings rows: one bordered list, rows separated by dividers. */
function SettingsSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="divide-y rounded-lg border">{children}</div>
    </section>
  );
}

function Row({ title, description, aside, muted }: { title: ReactNode; description?: ReactNode; aside?: ReactNode; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${muted ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="text-muted-foreground mt-0.5 text-xs">{description}</div>}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-3">{aside}</div>}
    </div>
  );
}
