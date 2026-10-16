import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FolderOpen,
  Globe2,
  Laptop,
  Loader2,
  Pencil,
  PlugZap,
  Unplug,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import type { SidekickInstallation } from "@/api/typesGenerated";
import { useDisconnectSidekick, useMySidekicks, useRenameSidekick } from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatTimestamp(value?: string): string {
  if (!value) return "Never";
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absoluteSeconds < 60) return formatter.format(seconds, "second");
  if (absoluteSeconds < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absoluteSeconds < 86_400) return formatter.format(Math.round(seconds / 3600), "hour");
  if (absoluteSeconds < 604_800) return formatter.format(Math.round(seconds / 86_400), "day");
  return date.toLocaleString();
}

function tenantHost(baseURL: string): string {
  try {
    return new URL(baseURL).host;
  } catch {
    return baseURL;
  }
}

function StatusDatum({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function SidekickCard({
  sidekick,
  readOnly,
  onRename,
  onDisconnect,
  busy,
}: {
  sidekick: SidekickInstallation;
  readOnly?: boolean;
  onRename?: (id: string, name: string) => Promise<void>;
  onDisconnect?: (id: string) => Promise<void>;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sidekick.name);
  const activeIssues = sidekick.issues.filter((issue) => !issue.resolved_at);
  const resolvedIssues = sidekick.issues.filter((issue) => issue.resolved_at);
  const disconnected = Boolean(sidekick.disconnected_at);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || !onRename) return;
    await onRename(sidekick.id, trimmed);
    setEditing(false);
  };

  const disconnect = async () => {
    if (!onDisconnect || !confirm(`Disconnect ${sidekick.name}? It will need to be authorized again before it can upload.`)) return;
    await onDisconnect(sidekick.id);
  };

  return (
    <Card className={`overflow-hidden border ${activeIssues.length > 0 ? "border-amber-500/40" : ""}`}>
      <div className="flex flex-col gap-4 border-b bg-muted/20 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`mt-0.5 rounded-xl border p-2.5 ${sidekick.online ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "bg-background text-muted-foreground"}`}>
            <Laptop className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            {editing ? (
              <div className="flex max-w-md items-center gap-2">
                <Input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void saveName()} autoFocus />
                <Button size="sm" onClick={() => void saveName()} disabled={busy || !name.trim()}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(sidekick.name); }}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-semibold">{sidekick.name}</h2>
                {!readOnly && !disconnected ? (
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setEditing(true)} aria-label={`Rename ${sidekick.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className={`inline-flex items-center gap-1 font-medium ${sidekick.online ? "text-emerald-500" : disconnected ? "text-muted-foreground" : "text-amber-500"}`}>
                {sidekick.online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {disconnected ? "Disconnected" : sidekick.online ? "Running" : "Offline"}
              </span>
              {sidekick.platform ? <span>{sidekick.platform}</span> : null}
              {sidekick.version ? <span>Version {sidekick.version}</span> : null}
            </div>
          </div>
        </div>
        {!readOnly && !disconnected ? (
          <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" disabled={busy} onClick={() => void disconnect()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
            Disconnect
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-3">
        <StatusDatum icon={<Clock3 className="h-3.5 w-3.5" />} label="Last seen" value={formatTimestamp(sidekick.last_seen_at)} />
        <StatusDatum icon={<Upload className="h-3.5 w-3.5" />} label="Last upload" value={formatTimestamp(sidekick.last_upload_at)} />
        <StatusDatum icon={<PlugZap className="h-3.5 w-3.5" />} label="Connected" value={formatTimestamp(sidekick.created_at)} />
      </div>

      <div className="border-t px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            World of Warcraft folders
          </h3>
          <span className="text-xs text-muted-foreground">
            {sidekick.wow_directories.length} configured
          </span>
        </div>
        {sidekick.wow_directories.length > 0 ? (
          <div className="divide-y rounded-lg border">
            {sidekick.wow_directories.map((directory) => (
              <div key={directory.path} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="break-all font-mono text-xs text-foreground">{directory.path}</div>
                  {directory.realmlist ? (
                    <div className="mt-1 text-xs text-muted-foreground">Realmlist: {directory.realmlist}</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 sm:justify-end">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {directory.tenant_name}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={directory.tenant_base_url}>
                    <Globe2 className="h-3.5 w-3.5" />
                    {tenantHost(directory.tenant_base_url)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No WoW folders have been reported yet.</p>
        )}
      </div>

      <div className="border-t px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Reported issues</h3>
          {activeIssues.length > 0 ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              {activeIssues.length} active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> No active issues
            </span>
          )}
        </div>

        {activeIssues.length > 0 ? (
          <div className="space-y-2">
            {activeIssues.map((issue) => (
              <div key={issue.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{issue.message}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{issue.code} · reported {formatTimestamp(issue.last_reported_at)}</div>
                    {issue.details ? <pre className="styled-scrollbar mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded bg-background/80 p-2 text-xs text-muted-foreground">{issue.details}</pre> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {resolvedIssues.length > 0 ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
              {resolvedIssues.length} resolved {resolvedIssues.length === 1 ? "issue" : "issues"}
            </summary>
            <div className="mt-2 space-y-2">
              {resolvedIssues.map((issue) => (
                <div key={issue.id} className="rounded-md border px-3 py-2 text-muted-foreground">
                  <div className="text-sm">{issue.message}</div>
                  <div className="text-xs">{issue.code} · resolved {formatTimestamp(issue.resolved_at)}</div>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

export function SidekickCards({ sidekicks, readOnly = false }: { sidekicks: readonly SidekickInstallation[]; readOnly?: boolean }) {
  const rename = useRenameSidekick();
  const disconnect = useDisconnectSidekick();

  if (sidekicks.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center">
        <Laptop className="mx-auto h-9 w-9 text-muted-foreground" />
        <h2 className="mt-4 font-semibold">No Sidekicks connected</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Connected Chronicle Sidekick installations will appear here after authorization.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sidekicks.map((sidekick) => (
        <SidekickCard
          key={sidekick.id}
          sidekick={sidekick}
          readOnly={readOnly}
          busy={rename.isPending || disconnect.isPending}
          onRename={readOnly ? undefined : async (id, name) => {
            try {
              await rename.mutateAsync({ id, name });
              toast.success("Sidekick renamed");
            } catch {
              toast.error("Could not rename Sidekick");
            }
          }}
          onDisconnect={readOnly ? undefined : async (id) => {
            try {
              await disconnect.mutateAsync(id);
              toast.success("Sidekick disconnected");
            } catch {
              toast.error("Could not disconnect Sidekick");
            }
          }}
        />
      ))}
    </div>
  );
}

export function SidekickSettings() {
  const { data, isLoading, error } = useMySidekicks();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sidekick</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor every Chronicle Sidekick connected to your account and disconnect devices you no longer use.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading Sidekicks...
        </div>
      ) : error ? (
        <Card className="border-destructive/40 p-5 text-sm text-destructive">Could not load your Sidekicks.</Card>
      ) : (
        <SidekickCards sidekicks={data?.sidekicks ?? []} />
      )}
    </div>
  );
}
