import { useState, useMemo, useRef } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
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
  Youtube,
  Download,
  Timer,
  ChevronRight,
  AlertTriangle,
  Fingerprint,
} from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { useAuth } from "@/hooks/useAuth";
import { LOG_FORMAT_OPTIONS } from "@/config/serverCapabilities";
import { 
  useLogGroup,
  useLogGroupByFileHash,
  useDeleteLogGroup,
  useFlavors,
  useReparseLogGroup,
  useDeleteLogFiles,
  useDeleteLogInstance,
  useAuthorizationCheck,
  useUploadInstanceYoutube,
  type WoWLogGroupState, 
  type WoWLogFile, 
  type RiverJobState,
  type WoWParsedLogJobOutput,
  type WoWEncounter,
  type Video,
} from "@/api/queries";
import type { WoWSimpleParsedInstance, LogParseReport, IdentityReport, Duration } from "@/api/typesGenerated";
import { formatStorageBytes } from "@/utils/storage";

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

// River job states - these match rivertype.JobState values
const REPARSE_LOG_TYPES = [
  { value: "v1", label: "V1" },
  { value: "v2", label: "V2" },
  { value: "azerothcore-clientside", label: "AzerothCore Client-Side" },
  { value: "epoch", label: "Epoch" },
  { value: "kronos", label: "Kronos" },
  { value: "azerothcore", label: "AzerothCore" },
] as const;


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

function StatusBadge({ state, errors }: { state: RiverJobState; errors?: readonly { error: string }[] }) {
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
    case RIVER_STATES.discarded: {
      const hasErrors = errors && errors.length > 0;
      if (!hasErrors) {
        return (
          <div className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Log Expired</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Failed</span>
        </div>
      );
    }
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

// Format milliseconds to human-readable duration
function formatMs(ms: Duration): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function TimingSection({ report }: { report: LogParseReport }) {
  return (
    <Card className="p-6">
      <details className="group">
        <summary className="cursor-pointer flex items-center gap-2 font-semibold text-lg list-none [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-90" />
          <Timer className="h-5 w-5 text-muted-foreground" />
          Timing Report
        </summary>
        
        <div className="mt-4 space-y-4">
          {/* Overview Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Total Duration</p>
              <p className="text-xl font-semibold">{formatMs(report.total_duration_ms)}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Lines Processed</p>
              <p className="text-xl font-semibold">{report.total_lines.toLocaleString()}</p>
            </div>
            {report.instances && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Instances</p>
                <p className="text-xl font-semibold">{report.instances.length}</p>
              </div>
            )}
          </div>

          {/* Parse Axes */}
          {(report.format || report.flavor?.length) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {report.format && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Format</span>
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{report.format}</code>
                </div>
              )}
              {report.flavor && report.flavor.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Flavor</span>
                  <div className="flex gap-1">
                    {report.flavor.map((tag) => (
                      <code key={tag} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{tag}</code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stage Breakdown */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Stage Breakdown</h4>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between p-2 bg-muted/50 rounded">
                <span>Load Files</span>
                <span className="font-mono">{formatMs(report.load_file_duration_ms)}</span>
              </div>
              <div className="flex justify-between p-2 bg-muted/50 rounded">
                <span>Parse Log</span>
                <span className="font-mono">{formatMs(report.parse_duration_ms)}</span>
              </div>
              <div className="flex justify-between p-2 bg-muted/50 rounded">
                <span>Finalize Instances</span>
                <span className="font-mono">{formatMs(report.finalize_duration_ms)}</span>
              </div>
              <div className="flex justify-between p-2 bg-muted/50 rounded">
                <span>Database Insert</span>
                <span className="font-mono">{formatMs(report.db_insert_duration_ms)}</span>
              </div>
            </div>
          </div>

          {/* Per-Instance Breakdown */}
          {report.instances && report.instances.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Per-Instance Timing</h4>
              <div className="space-y-1">
                {report.instances.map((inst, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center p-2 bg-muted/50 rounded text-sm">
                      <span className="flex items-center gap-2">
                        <Castle className="h-4 w-4 text-muted-foreground" />
                        {inst.name}
                        <span className="text-muted-foreground">({inst.encounter_count} encounters)</span>
                      </span>
                      <span className="font-mono text-muted-foreground">
                        finalize: {formatMs(inst.finalize_duration_ms)}, db: {formatMs(inst.db_insert_duration_ms)}
                      </span>
                    </div>
                    {inst.unknown_units && Object.keys(inst.unknown_units).length > 0 && (
                      <div className="ml-6 p-2 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
                        <div className="flex items-center gap-1 text-yellow-700 dark:text-yellow-400 font-medium mb-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Unknown Units ({Object.keys(inst.unknown_units).length})
                        </div>
                        <div className="grid gap-1 text-xs">
                          {Object.entries(inst.unknown_units)
                            .sort(([, a], [, b]) => b.count - a.count)
                            .map(([entryId, unit]) => (
                            <div key={entryId} className="flex justify-between font-mono text-yellow-800 dark:text-yellow-300">
                              <span>{unit.name || `Entry ${entryId}`} <span className="text-yellow-600 dark:text-yellow-500">({entryId})</span></span>
                              <span className="text-yellow-600 dark:text-yellow-500">{unit.count}× lookups</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Consumer Times */}
          {report.consumer_times && Object.keys(report.consumer_times).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Consumer Processing</h4>
              <div className="grid gap-2 text-sm">
                {Object.entries(report.consumer_times)
                  .sort(([left], [right]) => left.localeCompare(right))
                  .map(([name, duration]) => (
                  <div key={name} className="flex justify-between p-2 bg-muted/50 rounded">
                    <span className="font-mono text-xs">{name}</span>
                    <span className="font-mono">{formatMs(duration)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Missed Spells */}
          {report.missed_spells && Object.keys(report.missed_spells).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Missed Spells ({Object.keys(report.missed_spells).length})
              </h4>
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded">
                <div className="grid gap-1 text-xs max-h-60 overflow-y-auto">
                  {Object.entries(report.missed_spells)
                    .sort(([, a], [, b]) => b.count - a.count)
                    .map(([spellId, spell]) => (
                    <div key={spellId} className="flex justify-between font-mono text-yellow-800 dark:text-yellow-300">
                      <span>{spell.name || `Spell ${spellId}`} <span className="text-yellow-600 dark:text-yellow-500">({spellId})</span></span>
                      <span className="text-yellow-600 dark:text-yellow-500">{spell.count}× lookups</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </details>
    </Card>
  );
}

function IdentitySection({ identity }: { identity: IdentityReport }) {
  const zonedUnits = identity.zoned_units ? Object.entries(identity.zoned_units) : [];
  const zoneSpells = identity.zone_spells ? Object.entries(identity.zone_spells) : [];
  const unitSpells = identity.unit_spells ? Object.entries(identity.unit_spells) : [];
  const goCode = (identity as Record<string, unknown>).go_code as string | undefined;
  const [copied, setCopied] = useState(false);

  // Build a name lookup from zonedUnits for unit_spells (keyed by entry ID)
  const creatureNames = new Map<string, string>();
  for (const [, creatures] of zonedUnits) {
    for (const c of creatures) {
      creatureNames.set(String(c.entry_id), c.name);
    }
  }

  const totalCreatures = zonedUnits.reduce((sum, [, creatures]) => sum + creatures.length, 0);
  const totalSpells = zoneSpells.reduce((sum, [, spells]) => sum + spells.length, 0);

  return (
    <Card className="p-6">
      <details className="group">
        <summary className="cursor-pointer flex items-center gap-2 font-semibold text-lg list-none [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-90" />
          <Fingerprint className="h-5 w-5 text-blue-500" />
          Identity Report
          <span className="text-sm font-normal text-muted-foreground">
            ({totalCreatures} creatures, {totalSpells} spells)
          </span>
        </summary>

        <div className="mt-4 space-y-4">
          {/* Generated Go Code */}
          {goCode && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-muted-foreground">Generated Go Code</h4>
                <button
                  className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(goCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="text-xs font-mono bg-muted/50 rounded p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre">
                {goCode}
              </pre>
            </div>
          )}
          {/* Creatures by Zone */}
          {zonedUnits.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Creatures by Zone</h4>
              <div className="space-y-3">
                {zonedUnits
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([zone, creatures]) => (
                  <details key={zone}>
                    <summary className="cursor-pointer text-sm font-medium p-2 bg-muted/50 rounded hover:bg-muted transition-colors">
                      {zone} <span className="text-muted-foreground">({creatures.length} creatures)</span>
                    </summary>
                    <div className="mt-1 ml-4 grid gap-1 text-xs max-h-80 overflow-y-auto">
                      {creatures
                        .sort((a, b) => a.entry_id - b.entry_id)
                        .map((c) => (
                        <div key={c.entry_id} className="flex justify-between font-mono p-1 bg-muted/30 rounded">
                          <span>
                            {c.name} <span className="text-muted-foreground">({c.entry_id})</span>
                          </span>
                          <span className="text-muted-foreground">{c.unique_count}× unique</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Spells by Zone */}
          {zoneSpells.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Spells by Zone</h4>
              <div className="space-y-3">
                {zoneSpells
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([zone, spells]) => (
                  <details key={zone}>
                    <summary className="cursor-pointer text-sm font-medium p-2 bg-muted/50 rounded hover:bg-muted transition-colors">
                      {zone} <span className="text-muted-foreground">({spells.length} spells)</span>
                    </summary>
                    <div className="mt-1 ml-4 grid gap-1 text-xs max-h-80 overflow-y-auto">
                      {spells
                        .sort((a, b) => a.spell_id - b.spell_id)
                        .map((s) => (
                        <div key={s.spell_id} className="flex justify-between font-mono p-1 bg-muted/30 rounded">
                          <span>Spell {s.spell_id}</span>
                          <span className="text-muted-foreground">{s.count}× seen</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Spells by Creature */}
          {unitSpells.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Spells by Creature</h4>
              <div className="space-y-3">
                {unitSpells
                  .sort(([a], [b]) => {
                    const nameA = creatureNames.get(a) ?? a;
                    const nameB = creatureNames.get(b) ?? b;
                    return nameA.localeCompare(nameB);
                  })
                  .map(([entryId, spells]) => (
                  <details key={entryId}>
                    <summary className="cursor-pointer text-sm font-medium p-2 bg-muted/50 rounded hover:bg-muted transition-colors">
                      {creatureNames.get(entryId) ?? `Creature ${entryId}`}{" "}
                      <span className="text-muted-foreground">({entryId}) — {spells.length} spells</span>
                    </summary>
                    <div className="mt-1 ml-4 grid gap-1 text-xs max-h-80 overflow-y-auto">
                      {spells.sort().map((spell) => (
                        <div key={spell} className="font-mono p-1 bg-muted/30 rounded">
                          {spell}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
    </Card>
  );
}

function BossEncounterRow({ encounter }: { encounter: WoWEncounter }) {
  const badgeStyle = 
    encounter.kill_type === "clean" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" :
    encounter.kill_type === "partial" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300" :
    encounter.kill_type === "reset" ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" :
    "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
  const badgeText = 
    encounter.kill_type === "clean" ? "Kill" :
    encounter.kill_type === "partial" ? "Partial" :
    encounter.kill_type === "reset" ? "Reset" :
    "Wipe";
  const icon =
    encounter.kill_type === "clean" ? <Skull className="h-3.5 w-3.5 text-green-600 flex-shrink-0" /> :
    encounter.kill_type === "partial" ? <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0" /> :
    encounter.kill_type === "reset" ? <RotateCcw className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" /> :
    <Shield className="h-3.5 w-3.5 text-destructive flex-shrink-0" />;
  
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="font-medium text-sm truncate">{encounter.name}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <span className="text-xs text-muted-foreground">
          {formatDuration(encounter.start_time, encounter.end_time)}
        </span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${badgeStyle}`}>
          {badgeText}
        </span>
      </div>
    </div>
  );
}

interface RealmRejection {
  type: "realm_rejection";
  realm?: string;
  message: string;
  upload_url?: string;
  addon_url?: string;
}

function tryParseRealmRejection(error: string): RealmRejection | null {
  if (!error.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(error);
    if (parsed.type === "realm_rejection") return parsed as RealmRejection;
  } catch { /* not JSON, fall through */ }
  return null;
}

function InstanceFailureCard({ name, error }: { name: string; error: string }) {
  const rejection = tryParseRealmRejection(error);

  // Plain string error — legacy/non-realm failures
  if (!rejection) {
    return (
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
        <p className="text-sm">
          <span className="font-medium text-destructive">{name}</span>
          <span className="text-muted-foreground ml-1.5">{error}</span>
        </p>
      </div>
    );
  }

  // Structured realm rejection
  const displayName = name.replace(/_\d+$/, "");
  return (
    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">{displayName}</p>
          <p className="text-sm text-muted-foreground">{rejection.message}</p>
        </div>
      </div>

      <div className="pl-6 space-y-1.5 text-sm">
        {rejection.upload_url && (() => {
          // Show just the hostname in the link text, but keep the
          // full path (e.g. /logs/<id>) in the href.
          const displayHost = rejection.upload_url.replace(/\/.*$/, "");
          return (
            <p className="text-muted-foreground">
              You can try parsing this log on{" "}
              <a
                href={`https://${rejection.upload_url}`}
                className="text-link underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                {displayHost}
              </a>
              . Logs parsed there will only appear on that server&apos;s site.
            </p>
          );
        })()}
        {rejection.addon_url && (
          <p className="text-muted-foreground">
            A common issue is not using the latest{" "}
            <a
              href={rejection.addon_url}
              className="text-link underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              ChronicleCompanion addon
            </a>
            .
          </p>
        )}
        <p className="text-muted-foreground">
          Try deleting your <span className="font-mono text-xs">WoWCombatLog.txt</span> and recording a fresh log.
        </p>
      </div>
    </div>
  );
}

function InstanceCard({ 
  instance, 
  canUploadYoutube,
  canDeleteInstance,
  onDeleteInstance,
  isDeletingInstance,
}: { 
  instance: WoWSimpleParsedInstance;
  canUploadYoutube: boolean;
  canDeleteInstance: boolean;
  onDeleteInstance: (instanceId: string, instanceName: string) => void;
  isDeletingInstance: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadInstanceYoutube();
  
  const bossFights = instance.encounters.filter(e => e.boss);
  const trashFights = instance.encounters.filter(e => !e.boss);
  
  // Stub URL for now - will be replaced with actual route
  const instanceUrl = `/instances/${instance.slug || instance.id}`;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Video;
      // Basic validation
      if (!data.url || !Array.isArray(data.results)) {
        throw new Error("Invalid JSON format: missing 'url' or 'results' field");
      }
      await uploadMutation.mutateAsync({ instanceId: instance.id, data });
      toast.success("YouTube sync data uploaded successfully");
    } catch (err) {
      toast.error("Failed to upload sync data", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
    // Reset input for re-selection
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-3 bg-muted/30 border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Castle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <h3 className="font-semibold truncate">{instance.name}</h3>
            {instance.realm_name && instance.realm_name !== "Unknown" && (
              <span className="text-xs text-muted-foreground shrink-0">{instance.realm_name}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {canUploadYoutube && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                >
                  <Youtube className="h-3.5 w-3.5 mr-1" />
                  {uploadMutation.isPending ? "Uploading..." : "Upload Sync"}
                </Button>
              </>
            )}
            {canDeleteInstance && (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  const confirmed = window.confirm(
                    `Delete parsed instance "${instance.name}"? This keeps the log group but removes this instance and its encounters.`
                  );
                  if (!confirmed) return;
                  onDeleteInstance(instance.id, instance.name);
                }}
                disabled={isDeletingInstance}
              >
                {isDeletingInstance ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <Link to={instanceUrl}>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                View
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Addon-missing warning */}
      {!instance.versions?.["addon"] && !instance.capabilities?.includes("server-side") && (
        <div className="px-3 pt-2">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span>This log was recorded without the ChronicleCompanion addon.</span>
          </div>
        </div>
      )}
      
      {/* Content Grid */}
      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Boss Fights Section */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Swords className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Boss Fights
            </span>
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

function ParsedInstancesSection({ 
  log,
  canUploadYoutube,
  canDeleteInstance,
  onDeleteInstance,
  isDeletingInstance,
}: { 
  log: WoWLogGroupState;
  canUploadYoutube: boolean;
  canDeleteInstance: boolean;
  onDeleteInstance: (instanceId: string, instanceName: string) => void;
  isDeletingInstance: boolean;
}) {
  const parsedOutput = parseLogParseOutput(log.status.output, log.status.kind);
  
  // Only show for log-parse jobs with output
  if (!parsedOutput) {
    return null;
  }
  
  const { instances, instance_failures: instanceFailures, complete } = parsedOutput;
  const hasFailures = Object.keys(instanceFailures || {}).length > 0;
  
  return (
    <Card className="p-6">
      <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
        <Swords className="h-5 w-5 text-muted-foreground" />
        Detected Instances
      </h2>
      
      {instances.length === 0 && !hasFailures ? (
        complete ? (
          <p className="text-muted-foreground text-sm">
            No instances were found in this log.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Processing log...
          </p>
        )
      ) : (
        <div className="space-y-4">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              canUploadYoutube={canUploadYoutube}
              canDeleteInstance={canDeleteInstance}
              onDeleteInstance={onDeleteInstance}
              isDeletingInstance={isDeletingInstance}
            />
          ))}
          
          {hasFailures && (
            <div className="space-y-2">
              {Object.entries(instanceFailures || {}).map(([name, error]) => (
                <InstanceFailureCard key={name} name={name} error={error} />
              ))}
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
  onReparse: (verbose: boolean, identityMode?: boolean, logType?: string, format?: string, flavor?: string) => void;
  isReparsing: boolean;
  canReparse: boolean;
  onDeleteFiles: () => void;
  isDeletingFiles: boolean;
  canDeleteFiles: boolean;
  canDownloadFiles: boolean;
  canUploadYoutube: boolean;
  canDeleteInstance: boolean;
  onDeleteInstance: (instanceId: string, instanceName: string) => void;
  isDeletingInstance: boolean;
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
  canDownloadFiles,
  canUploadYoutube,
  canDeleteInstance,
  onDeleteInstance,
  isDeletingInstance,
  onRefresh,
  isRefreshing,
}: LogDetailViewProps) {
  const location = useLocation();
  const { data: allFlavorTags = [] } = useFlavors();
  const [showReparseAxis, setShowReparseAxis] = useState(false);
  const [reparseFormat, setReparseFormat] = useState("");
  const [reparseFlavor, setReparseFlavor] = useState("");
  // Open the axis panel, seeding the selects from the log's current values.
  const openReparseAxis = () => {
    setReparseFormat(log?.format ?? "");
    setReparseFlavor((log?.flavor ?? []).join(","));
    setShowReparseAxis(true);
  };
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
            <Link to={`/login?from=${encodeURIComponent(location.pathname)}`}>
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
              <StatusBadge state={log.status.state} errors={log.status.errors} />
            </div>
          </div>

          {log.status.state === RIVER_STATES.discarded && (!log.status.errors || log.status.errors.length === 0) && (
            <p className="text-sm text-muted-foreground">
              The processing record for this log has expired, but all parsed data is still available below.
            </p>
          )}

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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
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
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onReparse(false)}>
                    <Play className="h-4 w-4 mr-2" />
                    Reparse
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onReparse(true)}>
                    <Play className="h-4 w-4 mr-2 text-yellow-500" />
                    Reparse (Verbose)
                  </DropdownMenuItem>
                  {canDownloadFiles && (
                    <>
                      <DropdownMenuItem onClick={() => onReparse(false, true)}>
                        <Play className="h-4 w-4 mr-2 text-blue-500" />
                        Reparse (Identity)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Play className="h-4 w-4 mr-2 text-purple-500" />
                          Reparse as...
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {REPARSE_LOG_TYPES.map((opt) => (
                            <DropdownMenuItem
                              key={opt.value}
                              onClick={() => onReparse(false, false, opt.value)}
                            >
                              {opt.label}
                              {log?.log_type === opt.value && (
                                <span className="ml-2 text-xs text-muted-foreground">(current)</span>
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuItem onClick={openReparseAxis}>
                        <Play className="h-4 w-4 mr-2 text-purple-500" />
                        Reparse format + flavor...
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Reparse format + flavor panel (admin) */}
          {showReparseAxis && (
            <Card className="p-4 space-y-3 border-purple-500/40">
              <h3 className="font-medium text-sm">Reparse with format + flavor</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Format</label>
                  <select
                    value={reparseFormat}
                    onChange={(e) => setReparseFormat(e.target.value)}
                    className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                  >
                    <option value="">(keep current)</option>
                    {LOG_FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Flavor</label>
                  <div className="flex flex-wrap gap-1.5">
                    {allFlavorTags.map((tag) => {
                      const selected = reparseFlavor.split(",").filter(Boolean);
                      const isChecked = selected.includes(tag);
                      return (
                        <label
                          key={tag}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono cursor-pointer select-none transition-colors ${
                            isChecked
                              ? "bg-primary/10 border-primary text-primary"
                              : "border-input text-muted-foreground hover:border-foreground/30"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={isChecked}
                            onChange={() => {
                              const next = isChecked
                                ? selected.filter((t) => t !== tag)
                                : [...selected, tag];
                              setReparseFlavor(next.join(","));
                            }}
                          />
                          {tag}
                        </label>
                      );
                    })}
                  </div>
                  {!reparseFlavor && (
                    <p className="text-[10px] text-muted-foreground">No tags selected — keeps current flavor.</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={isReparsing || (!reparseFormat && !reparseFlavor)}
                  onClick={() => {
                    onReparse(false, false, undefined, reparseFormat || undefined, reparseFlavor || undefined);
                    setShowReparseAxis(false);
                  }}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Reparse
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowReparseAxis(false)}>
                  Cancel
                </Button>
              </div>
            </Card>
          )}

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
                  <StatusBadge state={log.status.state} errors={log.status.errors} />
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
          <ParsedInstancesSection
            log={log}
            canUploadYoutube={canUploadYoutube}
            canDeleteInstance={canDeleteInstance}
            onDeleteInstance={onDeleteInstance}
            isDeletingInstance={isDeletingInstance}
          />

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
            
            {/* Warning about deleting files */}
            {log.files && log.files.length > 0 && !log.files.every(f => f.storage_deleted_at) && (
              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm text-amber-200">
                  <strong>Before deleting:</strong> These are your raw combat log files. Chronicle stores a compressed version of the parsed data, but if there are any parsing errors or missing data, the raw files are needed to investigate and re-parse.
                </p>
                <p className="text-sm text-amber-200/80 mt-2">
                  Only delete if:
                </p>
                <ul className="text-sm text-amber-200/80 list-disc list-inside ml-2">
                  <li>You need more storage space (feel free to ask for more!)</li>
                  <li>The instance page looks perfect with no issues</li>
                </ul>
              </div>
            )}
            
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
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm text-muted-foreground">
                        {file.compressed_size_bytes != null ? (
                          <>
                            <p className="text-xs">
                              <span className="text-muted-foreground/70">Original:</span> {formatStorageBytes(file.size_bytes)}
                            </p>
                            <p>
                              <span className="text-muted-foreground/70">Stored:</span> {formatStorageBytes(file.compressed_size_bytes)}
                            </p>
                          </>
                        ) : (
                          <p>{formatStorageBytes(file.size_bytes)}</p>
                        )}
                        <p className="text-xs">{formatDate(file.created_at)}</p>
                        {file.storage_deleted_at && (
                          <p className="text-xs text-destructive">
                            Deleted: {formatDate(file.storage_deleted_at)}
                          </p>
                        )}
                      </div>
                      {canDownloadFiles && !file.storage_deleted_at && (
                        <a
                          href={`/api/v1/raidlogs/logs/${log.id}/files/${file.id}/download`}
                          download
                        >
                          <Button variant="outline" size="sm" title="Download file">
                            <Download className="h-4 w-4" />
                          </Button>
                        </a>
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
                  {log.files ? (
                    (() => {
                      const totalOriginal = log.files.reduce((acc, f) => acc + f.size_bytes, 0);
                      const totalStored = log.files.reduce(
                        (acc, f) => acc + (f.compressed_size_bytes ?? f.size_bytes),
                        0
                      );
                      const hasCompressed = log.files.some(f => f.compressed_size_bytes != null);
                      
                      if (hasCompressed && totalStored !== totalOriginal) {
                        return (
                          <span>
                            {formatStorageBytes(totalStored)}{" "}
                            <span className="text-muted-foreground/70 text-xs">
                              ({formatStorageBytes(totalOriginal)} uncompressed)
                            </span>
                          </span>
                        );
                      }
                      return formatStorageBytes(totalOriginal);
                    })()
                  ) : (
                    "0 B"
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Timing Report - only shows for completed log-parse jobs with report */}
          {(() => {
            const parsedOutput = parseLogParseOutput(log.status.output, log.status.kind);
            return parsedOutput?.report ? (
              <>
                <TimingSection report={parsedOutput.report} />
                {parsedOutput.report.identity && (
                  <IdentitySection identity={parsedOutput.report.identity} />
                )}
              </>
            ) : null;
          })()}

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
  const deleteLogInstance = useDeleteLogInstance();

  // Check permissions
  const authzChecks = useMemo(() => ({
    reparse: `raid_log:${logId}#reparse`,
    deleteFiles: `raid_log:${logId}#delete_files`,
    delete: `raid_log:${logId}#delete`,
    uploadYoutube: `raid_log:${logId}#upload_youtube`,
    adminLogs: "chronicle:chronicle#admin_logs",
  }), [logId]);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated && !!logId,
  });
  const canReparse = authz?.reparse ?? false;
  const canDeleteFiles = authz?.deleteFiles ?? false;
  const canDeleteInstance = authz?.delete ?? false;
  const canDownloadFiles = authz?.adminLogs ?? false;
  const canUploadYoutube = authz?.uploadYoutube ?? false;

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

  const handleReparse = (withDebug = false, identityMode = false, logType?: string, format?: string, flavor?: string) => {
    if (!logId) return;
    reparseLogGroup.mutate({ logId, withDebug, identityMode, logType, format, flavor }, {
      onSuccess: () => {
        const axis = logType ?? format ?? flavor;
        const label = axis
          ? `Reparse as ${axis} started`
          : identityMode ? "Identity reparse started" : withDebug ? "Debug reparse started" : "Reparse started";
        const desc = axis
          ? `Your log is being reprocessed as ${axis}.`
          : identityMode
            ? "Your log is being reprocessed to collect all creatures and spells."
            : withDebug
              ? "Your log is being reprocessed with debug annotations."
              : "Your log is being reprocessed.";
        toast.success(label, { description: desc });
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

  const handleDeleteInstance = (instanceId: string, instanceName: string) => {
    if (!logId) return;
    deleteLogInstance.mutate({ logId, instanceId }, {
      onSuccess: () => {
        toast.success(`Deleted instance: ${instanceName}`);
        refetch();
      },
      onError: (error) => {
        toast.error("Failed to delete instance", {
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
      canDownloadFiles={canDownloadFiles}
      canUploadYoutube={canUploadYoutube}
      canDeleteInstance={canDeleteInstance}
      onDeleteInstance={handleDeleteInstance}
      isDeletingInstance={deleteLogInstance.isPending}
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
  const deleteLogInstance = useDeleteLogInstance();

  const handleDeleteInstance = (instanceId: string, instanceName: string) => {
    if (!logId) return;
    deleteLogInstance.mutate({ logId, instanceId }, {
      onSuccess: () => {
        toast.success(`Deleted instance: ${instanceName}`);
        refetch();
      },
      onError: (error) => {
        toast.error("Failed to delete instance", {
          description: error.message,
        });
      },
    });
  };

  // Check permissions (only when we have the logId)
  const authzChecks = useMemo(() => ({
    reparse: `raid_log:${logId}#reparse`,
    deleteFiles: `raid_log:${logId}#delete_files`,
    delete: `raid_log:${logId}#delete`,
    uploadYoutube: `raid_log:${logId}#upload_youtube`,
    adminLogs: "chronicle:chronicle#admin_logs",
  }), [logId]);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated && !!logId,
  });
  const canReparse = authz?.reparse ?? false;
  const canDeleteFiles = authz?.deleteFiles ?? false;
  const canDeleteInstance = authz?.delete ?? false;
  const canDownloadFiles = authz?.adminLogs ?? false;
  const canUploadYoutube = authz?.uploadYoutube ?? false;

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

  const handleReparse = (withDebug = false, identityMode = false, logType?: string, format?: string, flavor?: string) => {
    if (!logId) return;
    reparseLogGroup.mutate({ logId, withDebug, identityMode, logType, format, flavor }, {
      onSuccess: () => {
        const axis = logType ?? format ?? flavor;
        const label = axis
          ? `Reparse as ${axis} started`
          : identityMode ? "Identity reparse started" : withDebug ? "Debug reparse started" : "Reparse started";
        const desc = axis
          ? `Your log is being reprocessed as ${axis}.`
          : identityMode
            ? "Your log is being reprocessed to collect all creatures and spells."
            : withDebug
              ? "Your log is being reprocessed with debug annotations."
              : "Your log is being reprocessed.";
        toast.success(label, { description: desc });
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
      canDownloadFiles={canDownloadFiles}
      canUploadYoutube={canUploadYoutube}
      canDeleteInstance={canDeleteInstance}
      onDeleteInstance={handleDeleteInstance}
      isDeletingInstance={deleteLogInstance.isPending}
      onRefresh={handleRefresh}
      isRefreshing={isRefetching}
    />
  );
}
