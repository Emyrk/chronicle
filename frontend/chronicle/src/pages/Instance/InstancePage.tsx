import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Youtube, Timer, TriangleAlert } from "lucide-react";
import { useInstance, useInstanceYoutube, useAuthorizationCheck } from "@/api/queries";
import { useAuth } from "@/hooks/useAuth";
import { InstanceEventsProvider } from "@/hooks/instanceEvents";
import { DatasetProvider } from "@/hooks/useDatasetId";
import type { ActivityPeriod, InstancePlayer, InstanceUnit, WoWEncounterWithHostiles, KillType } from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { InstancePageView } from "./InstancePageView";
import { YouTubeOverlay } from "./YouTubeOverlay";
import { SyncModeProvider, useSyncModeContext } from "./SyncModeContext";
import { ReplayControlOverlay } from "./ReplayControlOverlay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { TimeRangeProvider } from "./TimeRangeContext";
import { TimeRangeController } from "./TimeRangeController";
import { useTenantGate } from "./TenantGate";

// Types for the Instance page
export interface EnemyUnit {
  id: string;
  name: string;
  boss: boolean;       // is this a boss creature
  damageTaken: number; // damage taken from players
  damageDone: number;  // damage done to players
  periods: readonly ActivityPeriod[]; // activity periods for debugging
}

export interface Encounter {
  id: string;
  name: string;
  boss: boolean;
  kill_type: KillType;
  start_time: string;
  end_time: string;
  enemies?: EnemyUnit[];
  remaining?: string[]; // GUIDs of enemies that did not die
}

export interface Instance {
  id: string;
  slug?: string;
  name: string;
  realm?: string;
  // Resolved game-data dataset for this instance's realm. Used to fetch
  // matching talent/spell data regardless of the tenant domain.
  datasetId?: string;
  iconBaseUrl?: string;
  guild?: { id: string; name: string };
  startTime: string;
  endTime?: string;
  encounters: Encounter[];
  // GUID -> player info lookup
  players?: Record<string, InstancePlayer>;
  // GUID -> unit info lookup (creatures, pets, etc.)
  units?: Record<string, InstanceUnit>;
  // Server-computed feature flags for this instance
  capabilities: readonly string[];
  // Parse format and server-mechanics flavor of the source log group
  format?: string;
  flavor?: readonly string[];
  // Addon/dependency version metadata from the combat log header
  versions?: Record<string, string>;
  // Name of the player who recorded the combat log
  recorderName?: string;
  // GUID of the player who recorded the combat log
  recorderGuid?: string;
  // Difficulty info
  difficultyName?: string;
  maxPlayers?: number;
  dynamicDifficulty?: number;
  // Tenant info for cross-tenant gating
  serverName?: string;
  tenantName?: string;
  tenantSlug?: string;
  tenantIncludeInAll?: boolean;
}

// Helper to get unit name from lookup, with fallback
function getUnitName(guidStr: string, units: Record<string, InstanceUnit>): string {
  const unit = units[guidStr];
  if (unit) {
    return unit.name;
  }
  // Fallback: try to show a short version of the GUID
  return `Enemy ${guidStr}`;
}

function normalizeRecord<T>(value: Record<string, T> | null | undefined): Record<string, T> {
  return value ?? {};
}

function normalizeArray<T>(value: readonly T[] | null | undefined): readonly T[] {
  return value ?? [];
}

// Helper to transform API data to view data
function transformToInstance(
  apiInstance: {
    id: string;
    slug?: string;
    name: string;
    start_time?: string;
    end_time?: string;
    realm_name?: string;
    dataset_id?: string;
    icon_base_url?: string;
    guild?: { id: string; name: string };
    encounters: readonly WoWEncounterWithHostiles[] | null;
    players: Record<string, InstancePlayer> | null;
    units: Record<string, InstanceUnit> | null;
    capabilities?: readonly string[];
    format?: string;
    flavor?: readonly string[];
    versions?: Record<string, string>;
    recorder_name?: string;
    recorder_guid?: string;
    difficulty_name?: string;
    max_players?: number;
    dynamic_difficulty?: number;
    server_name?: string;
    tenant_name?: string;
    tenant_slug?: string;
    tenant_include_in_all?: boolean;
  },
): Instance {
  const players = normalizeRecord(apiInstance.players);
  const units = normalizeRecord(apiInstance.units);
  const apiEncounters = normalizeArray(apiInstance.encounters);

  // Map encounters
  const encounters: Encounter[] = apiEncounters.map((enc) => {
    // Build enemies from encounter hostiles
    const enemies: EnemyUnit[] = normalizeArray(enc.hostiles)
      .map((hostile) => {
        const guidStr = String(hostile.id);
        return {
          id: guidStr,
          name: getUnitName(guidStr, units),
          boss: hostile.boss,
          damageTaken: 0,
          damageDone: 0,
          periods: hostile.periods,
        };
      });

    return {
      id: enc.id,
      name: enc.name,
      boss: enc.boss,
      kill_type: enc.kill_type,
      start_time: enc.start_time,
      end_time: enc.end_time,
      players,
      enemies,
      remaining: enc.remaining as string[] | undefined,
    };
  });

  // Compute instance timing from encounters
  const sortedEncounters = [...apiEncounters].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  const startTime = apiInstance.start_time || sortedEncounters[0]?.start_time || new Date().toISOString();
  const endTime = apiInstance.end_time || sortedEncounters[sortedEncounters.length - 1]?.end_time;

  return {
    id: apiInstance.id,
    slug: apiInstance.slug,
    name: apiInstance.name,
    realm: apiInstance.realm_name,
    datasetId: apiInstance.dataset_id,
    iconBaseUrl: apiInstance.icon_base_url,
    guild: apiInstance.guild,
    startTime,
    endTime,
    encounters,
    players,
    units,
    capabilities: apiInstance.capabilities ?? [],
    format: apiInstance.format,
    flavor: apiInstance.flavor,
    versions: apiInstance.versions,
    recorderName: apiInstance.recorder_name,
    recorderGuid: apiInstance.recorder_guid,
    difficultyName: apiInstance.difficulty_name,
    maxPlayers: apiInstance.max_players,
    dynamicDifficulty: apiInstance.dynamic_difficulty,
    serverName: apiInstance.server_name,
    tenantName: apiInstance.tenant_name,
    tenantSlug: apiInstance.tenant_slug,
    tenantIncludeInAll: apiInstance.tenant_include_in_all,
  };
}

/**
 * Inner component that has access to SyncModeContext.
 * Must be rendered inside SyncModeProvider.
 */
function InstancePageInner({ 
  instance, 
  selectedEncounterIds,
  onSelectEncounters,
  youtubeData,
  selectedEncounterTimes,
  logDetailUrl,
  rawEncounters,
  canAdminLogs,
  duplicateGroupId,
}: {
  instance: Instance;
  selectedEncounterIds?: string[];
  onSelectEncounters: (ids: string[] | null) => void;
  youtubeData: { url: string; results: readonly import("@/api/typesGenerated").VideoTimestamp[] } | null | undefined;
  selectedEncounterTimes: { start: string | undefined; end: string | undefined };
  logDetailUrl?: string;
  rawEncounters?: readonly import("@/api/typesGenerated").WoWEncounterWithHostiles[];
  canAdminLogs?: boolean;
  duplicateGroupId?: string;
}) {
  const [showYoutube, setShowYoutube] = useState(false);
  const [showReplayPanel, setShowReplayPanel] = useState(false);
  const [showTimeRange, setShowTimeRange] = useState(false);
  const { setEncounterBounds, enabled: syncEnabled } = useSyncModeContext();
  const isMobile = useIsMobile();
  // Replay is disabled on mobile - never show the panel there
  const replayPanelVisible = showReplayPanel && !isMobile;
  
  // Update sync mode encounter bounds when selection changes
  useEffect(() => {
    if (selectedEncounterTimes.start && selectedEncounterTimes.end) {
      setEncounterBounds({
        start: new Date(selectedEncounterTimes.start),
        end: new Date(selectedEncounterTimes.end),
      });
    } else {
      setEncounterBounds(null);
    }
  }, [selectedEncounterTimes.start, selectedEncounterTimes.end, setEncounterBounds]);
  
  return (
    <>
      <InstancePageView
        instance={instance}
        selectedEncounterIds={selectedEncounterIds}
        onSelectEncounters={onSelectEncounters}
        logDetailUrl={logDetailUrl}
        canAdminLogs={canAdminLogs}
        duplicateGroupId={duplicateGroupId}
        onOpenTimeRange={() => setShowTimeRange(true)}
        suppressActionBar={replayPanelVisible}
        youtubeButton={
          <div className="flex gap-1.5">
            {/* Replay button (desktop only - replay is disabled on mobile) */}
            {!isMobile && (
              <Button
                variant={showReplayPanel || syncEnabled ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setShowReplayPanel((prev) => !prev)}
              >
                <Timer className="h-4 w-4" />
                Replay
              </Button>
            )}
            {/* YouTube button - only if video available */}
            {youtubeData?.url && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowYoutube(true)}
              >
                <Youtube className="h-4 w-4 text-red-500" />
                Video
              </Button>
            )}
          </div>
        }
      />
      {replayPanelVisible && (
        <ReplayControlOverlay
          initialTimestamp={selectedEncounterTimes.start ? new Date(selectedEncounterTimes.start) : undefined}
        />
      )}
      {showTimeRange && (
        <TimeRangeController onClose={() => setShowTimeRange(false)} />
      )}
      {showYoutube && youtubeData?.url && (
        <YouTubeOverlay
          videoUrl={youtubeData.url}
          timestamps={youtubeData.results}
          targetTime={selectedEncounterTimes.start}
          pauseTime={selectedEncounterTimes.end}
          onClose={() => setShowYoutube(false)}
          encounters={rawEncounters}
          onEncounterChange={(id) => onSelectEncounters([id])}
        />
      )}
    </>
  );
}

// Connected component that fetches data
export function InstancePage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  // Track user selection; null means use default
  const [userSelectedEncounterIds, setUserSelectedEncounterIds] = useState<string[] | null>(null);

  const { data: apiInstance, isLoading: instanceLoading, error: instanceError } = useInstance(
    instanceId || "",
    { enabled: !!instanceId }
  );

  const { data: youtubeData } = useInstanceYoutube(
    instanceId || "",
    { enabled: !!instanceId }
  );

  // Canonicalize URL: redirect from UUID to slug when available
  useEffect(() => {
    if (apiInstance?.slug && instanceId !== apiInstance.slug) {
      navigate(`/instances/${apiInstance.slug}${window.location.search}`, { replace: true });
    }
  }, [apiInstance?.slug, instanceId, navigate]);

  // Check if user can delete this log (uploader or admin) - if so, show link to log detail
  const { isAuthenticated } = useAuth();
  const logGroupId = apiInstance?.log_group_id;
  const authzChecks = useMemo(() => ({
    delete: logGroupId ? `raid_log:${logGroupId}#delete` : "",
    adminLogs: "chronicle:chronicle#admin_logs",
  }), [logGroupId]);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated && !!logGroupId,
  });
  const canDeleteLog = authz?.delete ?? false;
  const canAdminLogs = authz?.adminLogs ?? false;
  const logDetailUrl = canDeleteLog && logGroupId ? `/logs/${logGroupId}` : undefined;

  const instance = useMemo(() => {
    if (!apiInstance) return null;
    return transformToInstance(apiInstance);
  }, [apiInstance]);

  // Compute default encounter IDs (all encounters)
  const defaultEncounterIds = useMemo(() => {
    if (!instance) return [];
    return instance.encounters.filter(e => e.kill_type !== "wipe" && e.kill_type !== "reset").map(e => e.id);
  }, [instance]);

  // Use user selection if set, otherwise use default (all)
  const selectedEncounterIds = useMemo(() => {
    if (userSelectedEncounterIds !== null) return userSelectedEncounterIds;
    return defaultEncounterIds;
  }, [userSelectedEncounterIds, defaultEncounterIds]);

  // Get the start/end time of selected encounters for video sync
  // When multiple selected: start of first, end of last (by time order)
  const selectedEncounterTimes = useMemo(() => {
    if (!instance || selectedEncounterIds.length === 0) return { start: undefined, end: undefined };
    
    const selectedEncounters = instance.encounters
      .filter(e => selectedEncounterIds.includes(e.id))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    
    if (selectedEncounters.length === 0) return { start: undefined, end: undefined };
    
    const first = selectedEncounters[0];
    const last = selectedEncounters[selectedEncounters.length - 1];
    
    return { start: first.start_time, end: last.end_time };
  }, [instance, selectedEncounterIds]);

  const totalEncounterDurationMs = useMemo(() => {
    if (!selectedEncounterTimes.start || !selectedEncounterTimes.end) return 0;
    return new Date(selectedEncounterTimes.end).getTime() - new Date(selectedEncounterTimes.start).getTime();
  }, [selectedEncounterTimes.start, selectedEncounterTimes.end]);

  const isLoading = instanceLoading;
  const tenantGate = useTenantGate(instance);

  if (isLoading) {
    return (
      <div className="w-full px-4 py-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading instance data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (instanceError || !instance) {
    return (
      <div className="w-full px-4 py-6">
        <Link
          to="/logs"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Logs
        </Link>
        <Card className="p-6">
          <p className="text-destructive">
            {instanceError?.message || "Failed to load instance"}
          </p>
        </Card>
      </div>
    );
  }

  if (tenantGate.blocked) {
    return <>{tenantGate.blocked}</>;
  }

  return (
    <DatasetProvider datasetId={instance.datasetId} iconBaseUrl={instance.iconBaseUrl}>
    <SyncModeProvider>
      <TimeRangeProvider totalDurationMs={totalEncounterDurationMs}>
        <InstanceEventsProvider instanceId={instance.id}>
          {tenantGate.banner && (
            <div className="w-full px-4 pt-4">
              {tenantGate.banner}
            </div>
          )}
          <AddonMissingBanner instance={instance} />
          <InstancePageInner
            instance={instance}
            selectedEncounterIds={selectedEncounterIds}
            onSelectEncounters={setUserSelectedEncounterIds}
            youtubeData={youtubeData}
            selectedEncounterTimes={selectedEncounterTimes}
            logDetailUrl={logDetailUrl}
            rawEncounters={apiInstance?.encounters}
            canAdminLogs={canAdminLogs}
            duplicateGroupId={apiInstance?.duplicate_group_id}
          />
        </InstanceEventsProvider>
      </TimeRangeProvider>
    </SyncModeProvider>
    </DatasetProvider>
  );
}

function AddonMissingBanner({ instance }: { instance: Instance }) {
  const hasAddon = !!instance.versions?.["addon"] || !!instance.versions?.["chronicle_companion"];
  const isServerSide = instance.capabilities?.includes("server-side");

  if (hasAddon || isServerSide) return null;

  return (
    <div className="w-full px-4 pt-4">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
        <TriangleAlert className="h-4 w-4 text-amber-500 shrink-0" />
        <span>
          This log was recorded without the ChronicleCompanion addon. The addon
          improves accuracy and removes guesswork. Data is not guaranteed.
        </span>
      </div>
    </div>
  );
}
