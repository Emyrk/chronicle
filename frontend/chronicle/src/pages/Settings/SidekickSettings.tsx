import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  BellRing,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FolderOpen,
  Globe2,
  Laptop,
  Loader2,
  LogIn,
  Pencil,
  PlugZap,
  RefreshCw,
  Settings2,
  Trash2,
  Unplug,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  SidekickArchiveRetentionDaysDefault,
  SidekickArchiveRetentionDaysMax,
  SidekickArchiveRetentionDaysMin,
} from "@/api/typesGenerated";
import type {
  SidekickAutoUploadMode,
  SidekickConfig,
  SidekickDirectoryConfig,
  SidekickGameFormat,
  SidekickInstallation,
} from "@/api/typesGenerated";
import {
  SIDEKICK_REFRESH_INTERVAL_MS,
  useDeleteSidekick,
  useDisconnectSidekick,
  useMyNotificationSettings,
  useMySidekicks,
  useRenameSidekick,
  useUpdateSidekickConfig,
} from "@/api/queries";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/Switch/Switch";
import { DiscordIcon } from "@/components/icons/DiscordIcon";

const EMPTY_CONFIG: SidekickConfig = {
  version: 1,
  archive: { enabled: true, retention_days: SidekickArchiveRetentionDaysDefault },
  wow_directories: {},
};
const WOTLK_FORMAT: SidekickGameFormat = "wotlk_3.3.5a";
// Sidekick reports status every minute. The server marks it offline after
// chroniclesdk.SidekickOnlineThreshold (3m) without a heartbeat.
const SIDEKICK_HEARTBEAT_INTERVAL_MS = 60_000;

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function HeartbeatStatus({ sidekick, now }: { sidekick: SidekickInstallation; now: number }) {
  if (!sidekick.last_seen_at) return <span>Never seen</span>;
  const lastSeen = new Date(sidekick.last_seen_at).getTime();
  const sinceLastSeen = now - lastSeen;
  const untilNext = lastSeen + SIDEKICK_HEARTBEAT_INTERVAL_MS - now;
  if (sidekick.disconnected_at || sinceLastSeen > 60 * 60 * 1000) {
    return <span title={new Date(lastSeen).toLocaleString()}>Last seen {formatTimestamp(sidekick.last_seen_at)}</span>;
  }
  // We only learn about a new check-in on the next page refresh, so don't call it late until that has had a chance to happen.
  const late = -untilNext > SIDEKICK_REFRESH_INTERVAL_MS;
  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      title={`Sidekick checks in every ${SIDEKICK_HEARTBEAT_INTERVAL_MS / 1000}s. Last check-in: ${new Date(lastSeen).toLocaleString()}`}
    >
      <span className="relative inline-flex size-3.5">
        {untilNext >= 0 ? (
          <CountdownRing key={lastSeen} startedAt={lastSeen} durationMs={SIDEKICK_HEARTBEAT_INTERVAL_MS} className="size-3.5" />
        ) : (
          <svg className="absolute inset-0 size-3.5" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="10" fill="none" strokeWidth="3" className={late ? "stroke-amber-500" : "stroke-muted-foreground/25"} />
          </svg>
        )}
      </span>
      Last seen {formatDuration(sinceLastSeen)} ago
      {" · "}
      {untilNext >= 0 ? (
        <>next check-in ~{formatDuration(untilNext)}</>
      ) : late ? (
        <span className="text-amber-500">check-in late by {formatDuration(-untilNext)}</span>
      ) : (
        <>check-in due</>
      )}
      <span className="text-muted-foreground/60">(every {SIDEKICK_HEARTBEAT_INTERVAL_MS / 1000}s)</span>
    </span>
  );
}

// Drains a ring over durationMs starting at startedAt. Key it on startedAt so it restarts each cycle.
function CountdownRing({ startedAt, durationMs, className = "size-6" }: { startedAt: number; durationMs: number; className?: string }) {
  const [delayMs] = useState(() => startedAt - Date.now());
  return (
    <svg className={`absolute inset-0 -rotate-90 ${className}`} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2.5" className="stroke-muted-foreground/25" />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        className="stroke-sky-400"
        style={{ animation: `countdown-drain ${durationMs}ms linear ${delayMs}ms forwards` }}
      />
    </svg>
  );
}

function RefreshStatus({ updatedAt, fetching, onRefresh }: { updatedAt: number; fetching: boolean; onRefresh: () => void }) {
  const now = useNow();
  const untilRefresh = updatedAt + SIDEKICK_REFRESH_INTERVAL_MS - now;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
      <span>
        {fetching ? "Refreshing..." : `Updated ${formatDuration(now - updatedAt)} ago · auto-refresh in ${formatDuration(untilRefresh)}`}
      </span>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" disabled={fetching} onClick={onRefresh}>
        <span className="relative inline-flex size-6 items-center justify-center">
          {!fetching ? <CountdownRing key={updatedAt} startedAt={updatedAt} durationMs={SIDEKICK_REFRESH_INTERVAL_MS} /> : null}
          <RefreshCw className={`size-3 ${fetching ? "animate-spin" : ""}`} />
        </span>
        Refresh
      </Button>
    </div>
  );
}

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

function tenantHost(baseURL?: string): string {
  if (!baseURL) return "";
  try {
    return new URL(baseURL).host;
  } catch {
    return baseURL;
  }
}

function gameFormatLabel(format?: string): string {
  switch (format) {
    case WOTLK_FORMAT:
      return "Wrath 3.3.5a";
    default:
      return "Not configured";
  }
}

function updateDirectoryConfig(
  config: SidekickConfig,
  directoryID: string,
  next?: SidekickDirectoryConfig,
): SidekickConfig {
  const wowDirectories = { ...config.wow_directories };
  if (next) wowDirectories[directoryID] = next;
  else delete wowDirectories[directoryID];
  return { ...config, wow_directories: wowDirectories };
}

function ArchiveSettings({
  config,
  disabled,
  onConfigChange,
}: {
  config: SidekickConfig;
  disabled: boolean;
  onConfigChange?: (config: SidekickConfig) => Promise<void>;
}) {
  const [retentionDays, setRetentionDays] = useState(String(config.archive.retention_days));

  const saveRetentionDays = async () => {
    if (!onConfigChange) return;
    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days < SidekickArchiveRetentionDaysMin || days > SidekickArchiveRetentionDaysMax) {
      setRetentionDays(String(config.archive.retention_days));
      toast.error(`Archive retention must be between ${SidekickArchiveRetentionDaysMin} and ${SidekickArchiveRetentionDaysMax} days`);
      return;
    }
    if (days === config.archive.retention_days) return;
    await onConfigChange({
      ...config,
      archive: { ...config.archive, retention_days: days },
    });
  };

  return (
    <div className="grid gap-4 rounded-lg border bg-background/60 p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
      <div className="flex items-start gap-3">
        <Archive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            Keep uploaded files locally
            <Switch
              size="sm"
              checked={config.archive.enabled}
              disabled={disabled || !onConfigChange}
              onCheckedChange={(enabled) => {
                if (!onConfigChange) return;
                void onConfigChange({ ...config, archive: { ...config.archive, enabled } });
              }}
              aria-label="Keep uploaded files locally"
            />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Disable this to delete local snapshots after successful uploads. Pending and failed uploads are always retained.
          </p>
        </div>
      </div>
      <label className="space-y-1.5 text-xs font-medium">
        <span className="text-muted-foreground">Retention days</span>
        <Input
          type="number"
          min={SidekickArchiveRetentionDaysMin}
          max={SidekickArchiveRetentionDaysMax}
          value={retentionDays}
          disabled={disabled || !onConfigChange}
          onChange={(event) => setRetentionDays(event.target.value)}
          onBlur={() => void saveRetentionDays()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      </label>
    </div>
  );
}

function StatusDatum({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
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

function DirectorySettings({
  sidekick,
  config,
  readOnly,
  busy,
  onConfigChange,
}: {
  sidekick: SidekickInstallation;
  config: SidekickConfig;
  readOnly: boolean;
  busy: boolean;
  onConfigChange?: (config: SidekickConfig) => Promise<void>;
}) {
  const disconnected = Boolean(sidekick.disconnected_at);

  if (sidekick.wow_directories.length === 0) {
    return <p className="text-sm text-muted-foreground">No WoW folders have been reported yet.</p>;
  }

  return (
    <div className="divide-y rounded-lg border">
      {sidekick.wow_directories.map((directory) => {
        const hasID = Boolean(directory.id);
        const desired = hasID ? config.wow_directories[directory.id] : undefined;
        const supportedModes = sidekick.auto_upload_capabilities[desired?.game_format ?? WOTLK_FORMAT] ?? [];
        const applied = directory.game_format ?? "";
        const desiredFormat = desired?.game_format ?? "";
        const waitingForApply = !hasID || applied !== desiredFormat;
        const controlsDisabled = readOnly || disconnected || busy || !onConfigChange || !hasID;

        const setFormat = async (value: string) => {
          if (!onConfigChange) return;
          if (!value) {
            await onConfigChange(updateDirectoryConfig(config, directory.id));
            return;
          }
          await onConfigChange(updateDirectoryConfig(config, directory.id, {
            game_format: value as SidekickGameFormat,
            auto_upload: desired?.auto_upload ?? "disabled",
          }));
        };

        const setAutoUpload = async (value: string) => {
          if (!onConfigChange || !desired) return;
          await onConfigChange(updateDirectoryConfig(config, directory.id, {
            ...desired,
            auto_upload: value as SidekickAutoUploadMode,
          }));
        };

        return (
          <div key={directory.id || directory.path} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.9fr)] lg:items-center">
            <div className="min-w-0">
              <div className="break-all font-mono text-xs text-foreground">{directory.path}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {directory.realmlist ? <span>Realmlist: {directory.realmlist}</span> : null}
                {directory.tenant_name ? <span className="font-medium text-primary">{directory.tenant_name}</span> : null}
                {directory.tenant_base_url ? (
                  <span className="inline-flex items-center gap-1" title={directory.tenant_base_url}>
                    <Globe2 className="h-3.5 w-3.5" />
                    {tenantHost(directory.tenant_base_url)}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>Applied: {gameFormatLabel(directory.game_format)}</span>
                {waitingForApply ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400">
                    Waiting for Sidekick
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                    Applied
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium">
                <span className="text-muted-foreground">Game format</span>
                <select
                  value={desiredFormat}
                  disabled={controlsDisabled}
                  onChange={(event) => void setFormat(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Not configured</option>
                  <option value={WOTLK_FORMAT}>Wrath 3.3.5a</option>
                </select>
              </label>
              <label className="space-y-1.5 text-xs font-medium">
                <span className="text-muted-foreground">Automatic upload</span>
                <select
                  value={desired?.auto_upload ?? "disabled"}
                  disabled={controlsDisabled || !desired}
                  onChange={(event) => void setAutoUpload(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="disabled">Disabled</option>
                  {supportedModes.includes("on_game_exit") ? (
                    <option value="on_game_exit">When this game exits</option>
                  ) : null}
                </select>
                {desired && !supportedModes.includes("on_game_exit") ? (
                  <span className="block font-normal text-muted-foreground">This Sidekick version does not support automatic uploads for this format.</span>
                ) : null}
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SidekickCard({
  sidekick,
  readOnly = false,
  onRename,
  onDisconnect,
  onDelete,
  onConfigChange,
  busy = false,
  defaultExpanded = true,
}: {
  sidekick: SidekickInstallation;
  readOnly?: boolean;
  defaultExpanded?: boolean;
  onRename?: (id: string, name: string) => Promise<void>;
  onDisconnect?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onConfigChange?: (id: string, config: SidekickConfig) => Promise<void>;
  busy?: boolean;
}) {
  const now = useNow();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sidekick.name);
  const activeIssues = sidekick.issues.filter((issue) => !issue.resolved_at);
  const resolvedIssues = sidekick.issues.filter((issue) => issue.resolved_at);
  const configuration = sidekick.configuration?.config ?? EMPTY_CONFIG;
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

  const deleteSidekick = async () => {
    if (!onDelete || !confirm(`Delete ${sidekick.name}? This permanently removes its saved settings and history, and immediately revokes its Chronicle authorization. The app must register again as a new Sidekick.`)) return;
    await onDelete(sidekick.id);
  };

  return (
    <Card className={`gap-0 overflow-hidden border py-0 ${activeIssues.length > 0 ? "border-amber-500/40" : ""}`}>
      <div className={`flex flex-col gap-4 bg-muted/20 sm:flex-row sm:items-start sm:justify-between ${expanded ? "border-b p-5" : "px-4 py-3"}`}>
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            className="mt-1.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${sidekick.name}`}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`} />
          </button>
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
                <h2 className="cursor-pointer truncate text-lg font-semibold" onClick={() => setExpanded((value) => !value)}>{sidekick.name}</h2>
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
              <HeartbeatStatus sidekick={sidekick} now={now} />
              {expanded && sidekick.platform ? <span>{sidekick.platform}</span> : null}
              {expanded && sidekick.sidekick_version ? <span>Version {sidekick.sidekick_version}</span> : null}
            </div>
          </div>
        </div>
        {!expanded ? (
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:pt-1.5">
            <span>{sidekick.wow_directories.length} {sidekick.wow_directories.length === 1 ? "folder" : "folders"}</span>
            {activeIssues.length > 0 ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400">{activeIssues.length} active {activeIssues.length === 1 ? "issue" : "issues"}</span>
            ) : null}
          </div>
        ) : !readOnly ? (
          <div className="flex items-center gap-2">
            {!disconnected ? (
              <Button variant="outline" size="sm" className="gap-2" disabled={busy} onClick={() => void disconnect()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                Disconnect
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" disabled={busy} onClick={() => void deleteSidekick()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatusDatum
              icon={<Clock3 className="h-3.5 w-3.5" />}
              label="Last seen"
              value={sidekick.last_seen_at ? (
                <span className="tabular-nums">
                  {formatDuration(now - new Date(sidekick.last_seen_at).getTime())} ago
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">expected every {SIDEKICK_HEARTBEAT_INTERVAL_MS / 1000}s</span>
                </span>
              ) : "Never"}
            />
            <StatusDatum icon={<Upload className="h-3.5 w-3.5" />} label="Last upload" value={formatTimestamp(sidekick.last_upload_at)} />
            <StatusDatum icon={<PlugZap className="h-3.5 w-3.5" />} label="Connected" value={formatTimestamp(sidekick.created_at)} />
            <StatusDatum icon={<LogIn className="h-3.5 w-3.5" />} label="Start at login" value={sidekick.start_at_login ? "Enabled locally" : "Disabled locally"} />
          </div>

          <div className="border-t px-5 py-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold">Local archive</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose whether Sidekick keeps uploaded snapshots on this computer and how long it retains them.
              </p>
            </div>
            <ArchiveSettings
              key={`${sidekick.id}:${configuration.archive.retention_days}`}
              config={configuration}
              disabled={readOnly || disconnected || busy}
              onConfigChange={onConfigChange ? (config) => onConfigChange(sidekick.id, config) : undefined}
            />
          </div>

          <div className="border-t px-5 py-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  World of Warcraft folders
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Assign a format to enable parsing. Automatic uploads are configured independently for every installation.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{sidekick.wow_directories.length} reported</span>
            </div>
            <DirectorySettings
              sidekick={sidekick}
              config={configuration}
              readOnly={readOnly}
              busy={busy}
              onConfigChange={onConfigChange ? (config) => onConfigChange(sidekick.id, config) : undefined}
            />
          </div>

          <div className="border-t px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Reported issues</h3>
              {activeIssues.length > 0 ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">{activeIssues.length} active</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> No active issues</span>
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
                <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">{resolvedIssues.length} resolved {resolvedIssues.length === 1 ? "issue" : "issues"}</summary>
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
        </>
      ) : null}
    </Card>
  );
}

export function SidekickCards({ sidekicks, readOnly = false }: { sidekicks: readonly SidekickInstallation[]; readOnly?: boolean }) {
  const rename = useRenameSidekick();
  const disconnect = useDisconnectSidekick();
  const deleteSidekick = useDeleteSidekick();
  const updateConfig = useUpdateSidekickConfig();

  if (sidekicks.length === 0) {
    return (
      <Card className="border-dashed p-10 text-center">
        <Laptop className="mx-auto h-9 w-9 text-muted-foreground" />
        <h2 className="mt-4 font-semibold">No Sidekicks connected</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Connected Chronicle Sidekick installations will appear here after authorization.</p>
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
          defaultExpanded={sidekicks.length === 1}
          busy={rename.isPending || disconnect.isPending || deleteSidekick.isPending || updateConfig.isPending}
          onConfigChange={readOnly ? undefined : async (id, config) => {
            try {
              await updateConfig.mutateAsync({ id, config });
              toast.success("Sidekick settings updated");
            } catch {
              toast.error("Could not update Sidekick settings");
            }
          }}
          onRename={readOnly ? undefined : async (id, name) => {
            try {
              await rename.mutateAsync({ id, name });
              toast.success("Sidekick renamed");
            } catch {
              toast.error("Could not rename Sidekick");
            }
          }}
          onDelete={readOnly ? undefined : async (id) => {
            try {
              await deleteSidekick.mutateAsync(id);
              toast.success("Sidekick deleted. It must register again before it can upload.");
            } catch {
              toast.error("Could not delete Sidekick");
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

// Nudges Discord users who haven't turned on the "upload processed" DM yet.
function NotificationsCallout() {
  const { data } = useMyNotificationSettings();
  if (!data?.discord_linked) return null;
  const enabled = data.settings.some((setting) => setting.channel === "discord" && setting.event === "upload_processed" && setting.enabled);
  if (enabled) return null;
  return (
    <Card className="flex flex-col gap-3 border-[#5865F2]/40 bg-[#5865F2]/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[#5865F2]" />
        <div>
          <div className="font-medium">Know the moment your logs are ready</div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Get a Discord DM with a link as soon as Sidekick's uploads finish processing.
          </p>
        </div>
      </div>
      <Link to="/account/notifications" className="shrink-0">
        <Button variant="outline" size="sm" className="gap-2">
          <DiscordIcon className="size-4 text-[#5865F2]" />
          Turn on notifications
        </Button>
      </Link>
    </Card>
  );
}

export function SidekickSettings() {
  const { sidekickID } = useParams<{ sidekickID?: string }>();
  const { data, isLoading, error, dataUpdatedAt, isFetching, refetch } = useMySidekicks();
  const sidekicks = data?.sidekicks ?? [];
  const visibleSidekicks = sidekickID
    ? sidekicks.filter((sidekick) => sidekick.id === sidekickID)
    : sidekicks;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Sidekick</h1>
          </div>
          {dataUpdatedAt ? (
            <RefreshStatus updatedAt={dataUpdatedAt} fetching={isFetching} onRefresh={() => void refetch()} />
          ) : null}
        </div>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Manage game formats and automatic uploads for each WoW installation reported by Chronicle Sidekick.
        </p>
      </div>

      <NotificationsCallout />

      {isLoading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Sidekicks...</div>
      ) : error ? (
        <Card className="border-destructive/40 p-5 text-sm text-destructive">Could not load your Sidekicks.</Card>
      ) : sidekickID && visibleSidekicks.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <Laptop className="mx-auto h-9 w-9 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Sidekick not found</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            This installation is no longer connected to your Chronicle account.
          </p>
        </Card>
      ) : (
        <SidekickCards sidekicks={visibleSidekicks} />
      )}
    </div>
  );
}
