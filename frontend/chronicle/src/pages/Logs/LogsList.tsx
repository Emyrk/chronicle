import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileText, LogIn, Loader2, Upload as UploadIcon, Castle, AlertCircle, ChevronRight, Filter, X, HardDrive } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLogGroups, useSession, type WoWLogGroup, type WoWParsedLogJobOutput } from "@/api/queries";
import type { WoWSimpleParsedInstance } from "@/api/typesGenerated";

function formatShortDate(timestamp: unknown): string {
  if (!timestamp) return "Unknown";
  const ts = timestamp as { Time?: string; Valid?: boolean } | string;
  const dateStr = typeof ts === "string" ? ts : ts.Valid && ts.Time ? ts.Time : null;
  if (!dateStr) return "Unknown";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getInstanceDate(inst: WoWSimpleParsedInstance): string | null {
  const firstEncounter = inst.encounters?.[0];
  if (!firstEncounter?.start_time) return null;
  const date = new Date(firstEncounter.start_time);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const REALM_NAMES: Record<string, string> = {
  "851d2fd3-f9c5-4623-b714-924b59d916aa": "Ambershire",
  "f94d3103-1cd8-40e9-ad91-a2366de33354": "Tel Abim",
  "bcf173a7-c94a-49fe-8930-27435d722fb7": "Nordanaar",
};

function getRealmName(realmId: string): string | null {
  return REALM_NAMES[realmId] ?? null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function parseParsedOutput(output: unknown): WoWParsedLogJobOutput | null {
  if (!output || typeof output !== "object") {
    return null;
  }
  const parsed = output as WoWParsedLogJobOutput;
  // Check if it has the expected shape
  if (!Array.isArray(parsed.instances)) {
    return null;
  }
  return parsed;
}

// Get all unique instance names from logs
function getUniqueInstanceNames(logs: WoWLogGroup[]): string[] {
  const names = new Set<string>();
  for (const log of logs) {
    const parsed = parseParsedOutput(log.processing_output);
    if (parsed?.instances) {
      for (const inst of parsed.instances) {
        names.add(inst.name);
      }
    }
  }
  return Array.from(names).sort();
}

function StorageUsageCard({ consumed, max }: { consumed: number; max: number }) {
  const percentage = max > 0 ? Math.min((consumed / max) * 100, 100) : 0;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 95;
  
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <HardDrive className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Storage Usage</span>
            <span className="text-sm text-muted-foreground">
              {formatBytes(consumed)} / {formatBytes(max)}
            </span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${
                isAtLimit 
                  ? "bg-destructive" 
                  : isNearLimit 
                    ? "bg-yellow-500" 
                    : "bg-primary"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className={`text-xs mt-2 ${isNearLimit ? "text-foreground" : "text-muted-foreground"}`}>
            {isAtLimit 
              ? "You've reached your storage limit. Delete stored log files from your logs to free up space."
              : isNearLimit
                ? "You're approaching your storage limit. Consider deleting stored log files to free up space."
                : "To help control server costs, you can delete stored log files from your logs after they've been parsed. Your parsed data will be preserved."
            }
          </p>
        </div>
      </div>
    </Card>
  );
}

interface LogRowProps {
  log: WoWLogGroup;
  instances: WoWSimpleParsedInstance[];
  failedCount: number;
}

function LogRow({ log, instances, failedCount }: LogRowProps) {
  const totalBytes = log.files?.reduce((acc, f) => acc + f.size_bytes, 0) ?? 0;
  const filesDeleted = log.files?.some((f) => f.storage_deleted_at) ?? false;
  
  // Check if all instances share the same realm
  const realmIds = new Set(instances.map((inst) => inst.realm_id));
  const sharedRealm = realmIds.size === 1 ? getRealmName(instances[0]?.realm_id) : null;
  
  return (
    <div className="group py-2">
      {/* Main row - log info */}
      <Link
        to={`/logs/${log.id}`}
        className="flex items-center gap-3 px-4 hover:bg-accent/50 transition-colors"
      >
        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm flex-1">
          {formatShortDate(log.created_at)}
          {sharedRealm && (
            <span className="text-xs text-muted-foreground ml-2">({sharedRealm})</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {filesDeleted ? (
            <span className="italic">files removed from storage</span>
          ) : (
            formatBytes(totalBytes)
          )}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
      {/* Instance links - separate row for easy clicking */}
      {(instances.length > 0 || failedCount > 0) && (
        <div className="flex items-center gap-2 flex-wrap px-4 pt-1 pl-12">
          {instances.map((inst) => {
            const instanceDate = getInstanceDate(inst);
            // Only show realm in badge if instances have different realms
            const realmName = sharedRealm ? null : getRealmName(inst.realm_id);
            return (
              <Link
                key={inst.id}
                to={`/instances/${inst.slug || inst.id}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-500/15 hover:bg-green-500/25 text-green-400 rounded text-sm transition-colors"
              >
                <Castle className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{inst.name}</span>
                {(instanceDate || realmName) && (
                  <span className="text-xs text-muted-foreground">
                    ({[realmName, instanceDate].filter(Boolean).join(" · ")})
                  </span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            );
          })}
          {failedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-destructive/10 text-destructive rounded text-sm">
              <AlertCircle className="h-3.5 w-3.5" />
              {failedCount} failed
            </span>
          )}
        </div>
      )}
      {instances.length === 0 && failedCount === 0 && (
        <div className="px-4 pt-1 pl-12">
          <span className="text-sm text-muted-foreground italic">Processing...</span>
        </div>
      )}
    </div>
  );
}

export interface LogsListViewProps {
  isAuthenticated: boolean;
  authLoading: boolean;
  logs: WoWLogGroup[] | undefined;
  logsLoading: boolean;
  logsError: Error | null;
  maxStorageBytes: number;
  consumedStorageBytes: number;
}

export function LogsListView({
  isAuthenticated,
  authLoading,
  logs,
  logsLoading,
  logsError,
  maxStorageBytes,
  consumedStorageBytes,
}: LogsListViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const instanceFilter = searchParams.get("instance");
  
  const uniqueInstances = useMemo(() => {
    return logs ? getUniqueInstanceNames(logs) : [];
  }, [logs]);
  
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    if (!instanceFilter) return logs;
    
    return logs.filter((log) => {
      const parsed = parseParsedOutput(log.processing_output);
      return parsed?.instances.some((inst) => inst.name === instanceFilter);
    });
  }, [logs, instanceFilter]);
  
  const setInstanceFilter = (name: string | null) => {
    if (name) {
      setSearchParams({ instance: name });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Logs</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your uploaded raid logs.
          </p>
        </div>
        <Link to="/upload">
          <Button>
            <UploadIcon className="h-4 w-4 mr-2" />
            Upload New
          </Button>
        </Link>
      </div>

      {/* Auth Check */}
      {!authLoading && !isAuthenticated ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <h2 className="font-semibold text-lg">Authentication Required</h2>
              <p className="text-muted-foreground mt-1">
                You must be logged in to view your logs.
              </p>
            </div>
            <Link to="/login?from=/logs">
              <Button>
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            </Link>
          </div>
        </Card>
      ) : logsLoading ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading your logs...</p>
          </div>
        </Card>
      ) : logsError ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <h2 className="font-semibold text-lg text-destructive">Error Loading Logs</h2>
              <p className="text-muted-foreground mt-1">
                {logsError.message}
              </p>
            </div>
          </div>
        </Card>
      ) : logs && logs.length === 0 ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <div>
              <h2 className="font-semibold text-lg">No Logs Found</h2>
              <p className="text-muted-foreground mt-1">
                You haven't uploaded any logs yet.
              </p>
            </div>
            <Link to="/upload">
              <Button>
                <UploadIcon className="h-4 w-4 mr-2" />
                Upload Your First Log
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* Storage usage */}
          {maxStorageBytes > 0 && (
            <StorageUsageCard consumed={consumedStorageBytes} max={maxStorageBytes} />
          )}

          {/* Instance filter */}
          {uniqueInstances.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filter by instance:</span>
              {instanceFilter ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setInstanceFilter(null)}
                  className="h-7 gap-1"
                >
                  <Castle className="h-3 w-3" />
                  {instanceFilter}
                  <X className="h-3 w-3" />
                </Button>
              ) : (
                <select
                  className="text-sm bg-secondary border-0 rounded px-2 py-1 cursor-pointer"
                  value=""
                  onChange={(e) => setInstanceFilter(e.target.value || null)}
                >
                  <option value="">All instances</option>
                  {uniqueInstances.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
              {instanceFilter && (
                <span className="text-sm text-muted-foreground">
                  ({filteredLogs.length} {filteredLogs.length === 1 ? "log" : "logs"})
                </span>
              )}
            </div>
          )}

          {/* Log list */}
          <Card className="overflow-hidden divide-y divide-border/50 pb-2 pt-6">
            {filteredLogs.map((log) => {
              const parsedOutput = parseParsedOutput(log.processing_output);
              const instances = parsedOutput?.instances ?? [];
              const failedCount = Object.keys(parsedOutput?.instance_failures ?? {}).length;
              
              return (
                <LogRow
                  key={log.id}
                  log={log}
                  instances={instances as WoWSimpleParsedInstance[]}
                  failedCount={failedCount}
                />
              );
            })}
            {filteredLogs.length === 0 && instanceFilter && (
              <div className="p-4 text-center text-muted-foreground">
                No logs found for "{instanceFilter}"
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export function LogsList() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: logs, isLoading: logsLoading, error: logsError } = useLogGroups({
    enabled: isAuthenticated,
  });
  const { data: session } = useSession({
    enabled: isAuthenticated,
  });

  return (
    <LogsListView
      isAuthenticated={isAuthenticated}
      authLoading={authLoading}
      logs={logs}
      logsLoading={logsLoading}
      logsError={logsError}
      maxStorageBytes={session?.max_storage_bytes ?? 0}
      consumedStorageBytes={session?.consumed_storage_bytes ?? 0}
    />
  );
}
