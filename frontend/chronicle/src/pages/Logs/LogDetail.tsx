import { useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { 
  FileText, 
  Clock, 
  LogIn, 
  Loader2, 
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  HardDrive,
  Server,
  Trash2,
  PauseCircle,
  XCircle,
  RotateCcw,
  RefreshCw,
  Play,
  Swords,
  Castle,
  ExternalLink,
  Skull,
  Shield,
} from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { 
  useLogGroup,
  useLogGroupByFileHash,
  useDeleteLogGroup, 
  useReparseLogGroup,
  useDeleteLogFiles,
  useAuthorizationCheck,
  type WoWLogGroupState, 
  type WoWLogFile, 
  type RiverJobState,
  type WoWParsedLogJobOutput,
  type WoWEncounter,
} from "@/api/queries";
import type { WoWSimpleParsedInstance } from "@/api/typesGenerated";

function formatDate(timestamp: unknown): string {
  if (!timestamp) return "Unknown";
  // Handle the pgtype.Timestamptz format or ISO string
  const ts = timestamp as { Time?: string; Valid?: boolean } | string;
  if (typeof ts === "string") {
    return new Date(ts).toLocaleString();
  }
  if (ts.Valid && ts.Time) {
    return new Date(ts.Time).toLocaleString();
  }
  return "Unknown";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// River job states - these match rivertype.JobState values
const RIVER_STATES = {
  available: "available",
  cancelled: "cancelled", 
  completed: "completed",
  discarded: "discarded",
  pending: "pending",
  retryable: "retryable",
  running: "running",
  scheduled: "scheduled",
} as const;

// Terminal states where no more processing will occur
const TERMINAL_STATES = [
  RIVER_STATES.completed,
  RIVER_STATES.discarded,
  RIVER_STATES.cancelled,
];

// Job kinds
const JOB_KINDS = {
  logParse: "log-parse",
} as const;

function isJobComplete(state: RiverJobState): boolean {
  return TERMINAL_STATES.includes(state as typeof TERMINAL_STATES[number]);
}

function parseLogParseOutput(output: Record<string, string> | undefined, kind: string): WoWParsedLogJobOutput | null {
  if (kind !== JOB_KINDS.logParse || !output) {
    return null;
  }
  // The output from the API is Record<string, string>, but it's actually WoWParsedLogJobOutput
  // Cast it appropriately
  const parsed = output as unknown as WoWParsedLogJobOutput;
  if (!parsed.instances) {
    return null;
  }
  return parsed;
}

function formatDuration(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const seconds = Math.floor((diffMs % 60000) / 1000);
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatJobKind(kind: string): string {
  // Convert snake_case or camelCase to readable format
  return kind
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function StatusBadge({ state }: { state: RiverJobState }) {
  switch (state) {
    case RIVER_STATES.completed:
      return (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Completed</span>
        </div>
      );
    case RIVER_STATES.running:
      return (
        <div className="flex items-center gap-2 text-blue-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm font-medium">Processing</span>
        </div>
      );
    case RIVER_STATES.discarded:
      return (
        <div className="flex items-center gap-2 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Failed</span>
        </div>
      );
    case RIVER_STATES.cancelled:
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <PauseCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Cancelled</span>
        </div>
      );
    case RIVER_STATES.retryable:
      return (
        <div className="flex items-center gap-2 text-yellow-600">
          <RotateCcw className="h-4 w-4" />
          <span className="text-sm font-medium">Retrying</span>
        </div>
      );
    case RIVER_STATES.scheduled:
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span className="text-sm font-medium">Scheduled</span>
        </div>
      );
    case RIVER_STATES.available:
    case RIVER_STATES.pending:
    default:
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span className="text-sm font-medium">Pending</span>
        </div>
      );
  }
}

function BossEncounterRow({ encounter }: { encounter: WoWEncounter }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {encounter.kill ? (
          <Skull className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
        ) : (
          <Shield className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
        )}
        <span className="font-medium text-sm truncate">{encounter.name}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className="text-xs text-muted-foreground">
          {formatDuration(encounter.start_time, encounter.end_time)}
        </span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
          encounter.kill 
            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" 
            : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
        }`}>
          {encounter.kill ? "Kill" : "Wipe"}
        </span>
      </div>
    </div>
  );
}

function InstanceCard({ instance }: { instance: WoWSimpleParsedInstance }) {
  const bossFights = instance.encounters.filter(e => e.boss);
  const trashFights = instance.encounters.filter(e => !e.boss);
  const bossKills = bossFights.filter(e => e.kill).length;
  const bossWipes = bossFights.filter(e => !e.kill).length;
  const trashKills = trashFights.filter(e => e.kill).length;
  const trashWipes = trashFights.filter(e => !e.kill).length;
  
  // Stub URL for now - will be replaced with actual route
  const instanceUrl = `/instances/${instance.slug || instance.id}`;
  
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-3 bg-muted/30 border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Castle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <h3 className="font-semibold truncate">{instance.name}</h3>
          </div>
          <Link to={instanceUrl}>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              View
            </Button>
          </Link>
        </div>
      </div>
      
      {/* Content Grid */}
      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Boss Fights Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Swords className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Boss Fights
            </span>
            {bossFights.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ({bossKills} kill{bossKills !== 1 ? "s" : ""}, {bossWipes} wipe{bossWipes !== 1 ? "s" : ""})
              </span>
            )}
          </div>
          {bossFights.length > 0 ? (
            <div className="space-y-0.5">
              {bossFights.map((encounter) => (
                <BossEncounterRow key={encounter.id} encounter={encounter} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic px-2">No boss fights</p>
          )}
        </div>
        
        {/* Trash Fights Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Trash
            </span>
              <span className="text-xs text-muted-foreground ml-1">
                ({trashKills} kill{trashKills !== 1 ? "s" : ""}, {trashWipes} wipe{trashWipes !== 1 ? "s" : ""})
              </span>
          </div>
          {trashFights.length > 0 ? (
            <div className="px-2 py-1.5 bg-muted/30 rounded text-sm">
              {trashFights.length} Trash fight{trashFights.length !== 1 ? "s" : ""}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic px-2">No trash fights</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ParsedInstancesSection({ log }: { log: WoWLogGroupState }) {
  const parsedOutput = parseLogParseOutput(log.status.output, log.status.kind);
  
  // Only show for log-parse jobs with output
  if (!parsedOutput) {
    return null;
  }
  
  const { instances, instance_failures: instanceFailures } = parsedOutput;
  const hasFailures = Object.keys(instanceFailures || {}).length > 0;
  
  return (
    <Card className="p-6">
      <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
        <Swords className="h-5 w-5 text-muted-foreground" />
        Detected Instances
      </h2>
      
      {instances.length === 0 && !hasFailures ? (
        <p className="text-muted-foreground text-sm">
          No instances were found in this log.
        </p>
      ) : (
        <div className="space-y-4">
          {instances.map((instance) => (
            <InstanceCard key={instance.id} instance={instance} />
          ))}
          
          {hasFailures && (
            <div className="p-4 bg-destructive/10 rounded-lg">
              <p className="text-sm font-medium text-destructive mb-2">
                Some instances failed to parse
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {Object.entries(instanceFailures || {}).map(([name, error]) => (
                  <li key={name}>
                    <span className="font-mono">{name}</span>: {error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export interface LogDetailViewProps {
  isAuthenticated: boolean;
  authLoading: boolean;
  log: WoWLogGroupState | undefined;
  logLoading: boolean;
  logError: Error | null;
  onDelete: () => void;
  isDeleting: boolean;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (show: boolean) => void;
  onReparse: () => void;
  isReparsing: boolean;
  canReparse: boolean;
  onDeleteFiles: () => void;
  isDeletingFiles: boolean;
  canDeleteFiles: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function LogDetailView({
  isAuthenticated,
  authLoading,
  log,
  logLoading,
  logError,
  onDelete,
  isDeleting,
  showDeleteConfirm,
  setShowDeleteConfirm,
  onReparse,
  isReparsing,
  canReparse,
  onDeleteFiles,
  isDeletingFiles,
  canDeleteFiles,
  onRefresh,
  isRefreshing,
}: LogDetailViewProps) {
  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      {/* Back link */}
      <Link 
        to="/logs" 
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Logs
      </Link>

      {/* Auth Check */}
      {!authLoading && !isAuthenticated ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <h2 className="font-semibold text-lg">Authentication Required</h2>
              <p className="text-muted-foreground mt-1">
                You must be logged in to view log details.
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
      ) : logLoading ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading log details...</p>
          </div>
        </Card>
      ) : logError ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div>
              <h2 className="font-semibold text-lg text-destructive">Error Loading Log</h2>
              <p className="text-muted-foreground mt-1">
                {logError.message}
              </p>
            </div>
            <Link to="/logs">
              <Button variant="outline">
                Return to Logs
              </Button>
            </Link>
          </div>
        </Card>
      ) : !log ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <div>
              <h2 className="font-semibold text-lg">Log Not Found</h2>
              <p className="text-muted-foreground mt-1">
                This log doesn't exist or you don't have access to it.
              </p>
            </div>
            <Link to="/logs">
              <Button variant="outline">
                Return to Logs
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">Log Upload</h1>
              <p className="text-muted-foreground mt-1">
                Uploaded {formatDate(log.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge state={log.status.state} />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
{canReparse && (
              <Button 
                variant="outline" 
                onClick={onReparse}
                disabled={isReparsing || !isJobComplete(log.status.state)}
              >
                {isReparsing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reparsing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Reparse
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Processing Status Card */}
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              Processing Status
              {log.status.finalized_at && (
                <span className="text-sm font-normal text-muted-foreground">
                  (Total: {formatDuration(log.status.created_at, log.status.finalized_at)}
                  {log.status.attempted_at && `, Processing: ${formatDuration(log.status.attempted_at, log.status.finalized_at)}`})
                </span>
              )}
            </h2>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <StatusBadge state={log.status.state} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Attempt</p>
                  <p className="font-medium">{log.status.attempt} / {log.status.max_attempts}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Job Type</p>
                  <p className="font-medium">{formatJobKind(log.status.kind)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Job ID</p>
                  <p className="font-mono text-sm">{log.status.id}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{formatDate(log.status.created_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Scheduled</p>
                  <p>{formatDate(log.status.scheduled_at)}</p>
                </div>
                {log.status.attempted_at && (
                  <div>
                    <p className="text-muted-foreground">Started</p>
                    <p>{formatDate(log.status.attempted_at)}</p>
                  </div>
                )}
                {log.status.finalized_at && (
                  <div>
                    <p className="text-muted-foreground">Completed</p>
                    <p>{formatDate(log.status.finalized_at)}</p>
                  </div>
                )}
              </div>

              {(log.status.state === RIVER_STATES.pending || 
                log.status.state === RIVER_STATES.available || 
                log.status.state === RIVER_STATES.scheduled) && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Your logs are queued for processing. This may take a few minutes depending on the file size.
                  </p>
                </div>
              )}

              {log.status.state === RIVER_STATES.running && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Your logs are currently being processed. Check back shortly for results.
                  </p>
                </div>
              )}

              {log.status.state === RIVER_STATES.retryable && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    Processing encountered an issue and will be retried automatically.
                  </p>
                </div>
              )}

              {(log.status.state === RIVER_STATES.discarded || log.status.state === RIVER_STATES.cancelled) && log.status.errors.length > 0 && (() => {
                const currentAttemptErrors = log.status.errors.filter(e => e.attempt === log.status.attempt);
                const previousAttemptErrors = log.status.errors.filter(e => e.attempt !== log.status.attempt);
                
                const renderError = (error: typeof log.status.errors[number], idx: number) => (
                  <div key={idx} className="text-sm">
                    <p className="text-muted-foreground">
                      Attempt {error.attempt} at {formatDate(error.at)}:
                    </p>
                    <p className="font-mono text-xs text-destructive whitespace-pre-wrap break-words">
                      {error.error}
                    </p>
                    {error.trace && (
                      <details className="mt-1">
                        <summary className="text-xs text-muted-foreground cursor-pointer">
                          Stack trace
                        </summary>
                        <pre className="text-xs text-muted-foreground mt-1 overflow-x-auto">
                          {error.trace}
                        </pre>
                      </details>
                    )}
                  </div>
                );
                
                return (
                  <div className="p-4 bg-destructive/10 rounded-lg space-y-3">
                    <p className="text-sm font-medium text-destructive">
                      {log.status.state === RIVER_STATES.cancelled ? "Job was cancelled" : "Processing failed"}
                      {" "}(Attempt {log.status.attempt})
                    </p>
                    
                    {currentAttemptErrors.length > 0 && (
                      <div className="space-y-2">
                        {currentAttemptErrors.map(renderError)}
                      </div>
                    )}
                    
                    {previousAttemptErrors.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer">
                          Previous attempt errors ({previousAttemptErrors.length})
                        </summary>
                        <div className="mt-2 space-y-2 pl-2 border-l-2 border-muted">
                          {previousAttemptErrors.map(renderError)}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })()}
            </div>
          </Card>

          {/* Parsed Instances Section - only shows for log-parse jobs with output */}
          <ParsedInstancesSection log={log} />

          {/* Files Card */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-muted-foreground" />
                Uploaded Files
              </h2>
              {canDeleteFiles && log.files && log.files.length > 0 && !log.files.some(f => f.storage_deleted_at) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDeleteFiles}
                  disabled={isDeletingFiles}
                  className="text-destructive hover:text-destructive"
                >
                  {isDeletingFiles ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Files
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {log.files && log.files.length > 0 ? (
                log.files.map((file: WoWLogFile) => (
                  <div 
                    key={file.id} 
                    className={`flex items-center justify-between p-3 rounded-lg border ${file.storage_deleted_at ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{file.mime_type || "Log File"}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {file.id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{formatBytes(file.size_bytes)}</p>
                      <p className="text-xs">{formatDate(file.created_at)}</p>
                      {file.storage_deleted_at && (
                        <p className="text-xs text-destructive">
                          Deleted: {formatDate(file.storage_deleted_at)}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">No files found</p>
              )}
            </div>
          </Card>

          {/* Log Details Card */}
          <Card className="p-6">
            <h2 className="font-semibold text-lg mb-4">Details</h2>
            <dl className="grid gap-4 md:grid-cols-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Log ID</dt>
                <dd className="font-mono text-xs mt-1 break-all">{log.id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Owner ID</dt>
                <dd className="font-mono text-xs mt-1 break-all">{log.owner}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="mt-1">{formatDate(log.created_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last Updated</dt>
                <dd className="mt-1">{formatDate(log.updated_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total Files</dt>
                <dd className="mt-1">{log.files?.length || 0}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total Size</dt>
                <dd className="mt-1">
                  {log.files 
                    ? formatBytes(log.files.reduce((acc, f) => acc + f.size_bytes, 0))
                    : "0 B"
                  }
                </dd>
              </div>
            </dl>
          </Card>

          {/* Delete Section */}
          <Card className="p-6 border-destructive/50">
            <h2 className="font-semibold text-lg mb-4 text-destructive">Danger Zone</h2>
            {showDeleteConfirm ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete this log? This action cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="destructive" 
                    onClick={onDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Yes, Delete
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Permanently delete this log and all associated files.
                </p>
                <Button 
                  variant="destructive" 
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Log
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export function LogDetail() {
  const { logId } = useParams<{ logId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { 
    data: log, 
    isLoading: logLoading, 
    error: logError,
    refetch,
    isRefetching,
  } = useLogGroup(logId || "", {
    enabled: isAuthenticated && !!logId,
  });

  const deleteLogGroup = useDeleteLogGroup();
  const reparseLogGroup = useReparseLogGroup();
  const deleteLogFiles = useDeleteLogFiles();

  // Check permissions
  const authzChecks = useMemo(() => ({
    reparse: `raid_log:${logId}#reparse`,
    deleteFiles: `raid_log:${logId}#delete_files`,
  }), [logId]);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated && !!logId,
  });
  const canReparse = authz?.reparse ?? false;
  const canDeleteFiles = authz?.deleteFiles ?? false;

  const handleDelete = () => {
    if (!logId) return;
    deleteLogGroup.mutate(logId, {
      onSuccess: () => {
        toast.success("Log deleted");
        navigate("/logs");
      },
      onError: (error) => {
        toast.error("Failed to delete log", {
          description: error.message,
        });
      },
    });
  };

  const handleReparse = () => {
    if (!logId) return;
    reparseLogGroup.mutate(logId, {
      onSuccess: () => {
        toast.success("Reparse started", {
          description: "Your log is being reprocessed.",
        });
        refetch();
      },
      onError: (error) => {
        toast.error("Failed to reparse", {
          description: error.message,
        });
      },
    });
  };

  const handleDeleteFiles = () => {
    if (!logId) return;
    deleteLogFiles.mutate(logId, {
      onSuccess: () => {
        toast.success("Files deleted", {
          description: "The uploaded files have been removed from storage.",
        });
        refetch();
      },
      onError: (error) => {
        toast.error("Failed to delete files", {
          description: error.message,
        });
      },
    });
  };

  const handleRefresh = () => {
    refetch();
  };

  return (
    <LogDetailView
      isAuthenticated={isAuthenticated}
      authLoading={authLoading}
      log={log}
      logLoading={logLoading}
      logError={logError}
      onDelete={handleDelete}
      isDeleting={deleteLogGroup.isPending}
      showDeleteConfirm={showDeleteConfirm}
      setShowDeleteConfirm={setShowDeleteConfirm}
      onReparse={handleReparse}
      isReparsing={reparseLogGroup.isPending}
      canReparse={canReparse}
      onDeleteFiles={handleDeleteFiles}
      isDeletingFiles={deleteLogFiles.isPending}
      canDeleteFiles={canDeleteFiles}
      onRefresh={handleRefresh}
      isRefreshing={isRefetching}
    />
  );
}

export function LogDetailByHash() {
  const { fileHash } = useParams<{ fileHash: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { 
    data: log, 
    isLoading: logLoading, 
    error: logError,
    refetch,
    isRefetching,
  } = useLogGroupByFileHash(fileHash || "", {
    enabled: isAuthenticated && !!fileHash,
  });

  const logId = log?.id;

  const deleteLogGroup = useDeleteLogGroup();
  const reparseLogGroup = useReparseLogGroup();
  const deleteLogFiles = useDeleteLogFiles();

  // Check permissions (only when we have the logId)
  const authzChecks = useMemo(() => ({
    reparse: `raid_log:${logId}#reparse`,
    deleteFiles: `raid_log:${logId}#delete_files`,
  }), [logId]);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated && !!logId,
  });
  const canReparse = authz?.reparse ?? false;
  const canDeleteFiles = authz?.deleteFiles ?? false;

  const handleDelete = () => {
    if (!logId) return;
    deleteLogGroup.mutate(logId, {
      onSuccess: () => {
        toast.success("Log deleted");
        navigate("/logs");
      },
      onError: (error) => {
        toast.error("Failed to delete log", {
          description: error.message,
        });
      },
    });
  };

  const handleReparse = () => {
    if (!logId) return;
    reparseLogGroup.mutate(logId, {
      onSuccess: () => {
        toast.success("Reparse started", {
          description: "Your log is being reprocessed.",
        });
        refetch();
      },
      onError: (error) => {
        toast.error("Failed to reparse", {
          description: error.message,
        });
      },
    });
  };

  const handleDeleteFiles = () => {
    if (!logId) return;
    deleteLogFiles.mutate(logId, {
      onSuccess: () => {
        toast.success("Files deleted", {
          description: "The uploaded files have been removed from storage.",
        });
        refetch();
      },
      onError: (error) => {
        toast.error("Failed to delete files", {
          description: error.message,
        });
      },
    });
  };

  const handleRefresh = () => {
    refetch();
  };

  return (
    <LogDetailView
      isAuthenticated={isAuthenticated}
      authLoading={authLoading}
      log={log}
      logLoading={logLoading}
      logError={logError}
      onDelete={handleDelete}
      isDeleting={deleteLogGroup.isPending}
      showDeleteConfirm={showDeleteConfirm}
      setShowDeleteConfirm={setShowDeleteConfirm}
      onReparse={handleReparse}
      isReparsing={reparseLogGroup.isPending}
      canReparse={canReparse}
      onDeleteFiles={handleDeleteFiles}
      isDeletingFiles={deleteLogFiles.isPending}
      canDeleteFiles={canDeleteFiles}
      onRefresh={handleRefresh}
      isRefreshing={isRefetching}
    />
  );
}
