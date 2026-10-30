import { useMemo, useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Youtube, Timer, TriangleAlert } from "lucide-react";
import { useInstance, useInstanceYoutube, useAuthorizationCheck, useSession } from "@/api/queries";
import { useAuth } from "@/hooks/useAuth";
import { InstanceEventsProvider } from "@/hooks/instanceEvents";
import { DatasetProvider } from "@/hooks/useDatasetId";
import { PlayerSpecializationProvider } from "@/components/ui/PlayerMetricChart/PlayerSpecializationContext";
import { PlayerCosmeticsProvider } from "@/components/ui/PlayerMetricChart/PlayerCosmeticsContext";
import type { ActivityPeriod, InstancePlayer, InstanceUnit, WoWEncounterWithHostiles, KillType, VehicleControlMetadata } from "@/api/typesGenerated";
import { resolveInstanceUnits, type ResolvedInstanceUnit } from "./instanceUnits";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shouldShowChronicleCompanionWarning } from "@/lib/logReliability";
import { InstancePageView } from "./InstancePageView";
import { YouTubeOverlay } from "./YouTubeOverlay";
import { SyncModeProvider, useSyncModeContext } from "./SyncModeContext";
import { LiveSessionProvider } from "./LiveSessionContext";
import { ReplayControlOverlay, useReplayPosition } from "./ReplayControlOverlay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { TimeRangeProvider } from "./TimeRangeContext";
import { InstanceKeybindProvider } from "./InstanceKeybinds";
import { TimeRangeController } from "./TimeRangeController";
import { useTenantGate } from "./TenantGate";
import { useFocusMode } from "@/hooks/useFocusMode";
import { InstanceAssistantChat } from "@/features/chat/InferenceChats";
import { AdSuppressionProvider } from "@/components/Ads/AdSuppressionProvider";
import { AdRailStack } from "@/components/Ads/AdRailStack";
import { shouldShowAdPreview } from "@/components/Ads/adPreview";
import { useAdSiteConfig } from "@/components/Ads/useAdSiteConfig";
import { getReplayResetTimestamp, type SelectedEncounterTimes } from "./replaySelection";
import { shouldShowInstanceAdRail } from "./instanceAdRail";
import { defaultPositionCoordinateSpace, type PositionCoordinateSpace } from "./positionCoordinateSpace";

// Types for the Instance page
export interface EnemyUnit {
  id: string;
  name: string;
  boss: boolean;       // is this a boss creature
  damageTaken: number; // damage taken from players
  damageDone: number;  // damage done to players
  periods: readonly ActivityPeriod[]; // activity periods for debugging
}

/** A named sub-range within an encounter (e.g. boss phases). */
export interface EncounterPhase {
  id: string;
  encounter_id: string;
  key: string;
  name: string;
  order: number;
  start_offset_ms: number;
  end_offset_ms: number;
  start_time: string;
  end_time: string;
  kill_type: KillType;
}

export interface Encounter {
  id: string;
  name: string;
  boss: boolean;
  mapId: number;
  kill_type: KillType;
  start_time: string;
  end_time: string;
  enemies?: EnemyUnit[];
  remaining?: string[]; // GUIDs of enemies that did not die
  /** Optional phases within this encounter (sorted by order). */
  phases?: EncounterPhase[];
  /** Interval scored for boss rankings, when shorter than the full encounter. */
  ranking_window?: EncounterRankingWindow;
}

/** Ranked interval as offsets from the encounter start. */
export interface EncounterRankingWindow {
  start_offset_ms: number;
  end_offset_ms: number;
}

export interface Instance {
  id: string;
  slug?: string;
  logGroupId?: string;
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
  // GUID -> resolved unit info lookup (creatures, pets, etc.)
  units?: Record<string, ResolvedInstanceUnit>;
  // Server-computed feature flags for this instance
  capabilities: readonly string[];
  // Coordinate system used by unit-position telemetry.
  positionCoordinateSpace?: PositionCoordinateSpace;
  // Unlisted logs preserve combat analysis for authorized users but omit public ranking features.
  unlisted?: boolean;
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
  invalidatedAt?: string;
  invalidReason?: string;
  // Timestamped vehicle-to-controller intervals and transport diagnostics
  vehicleControlIntervals?: VehicleControlMetadata;
  // Tenant info for cross-tenant gating
  serverName?: string;
  tenantName?: string;
  tenantSlug?: string;
  tenantIncludeInAll?: boolean;
}

// Helper to get unit name from lookup, with fallback
function getUnitName(guidStr: string, units: Record<string, ResolvedInstanceUnit>): string {
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
export function transformToInstance(
  apiInstance: {
    id: string;
    slug?: string;
    owner_ads_free: boolean;
    log_group_id: string;
    name: string;
    start_time?: string;
    end_time?: string;
    realm_name?: string;
    dataset_id?: string | null;
    icon_base_url?: string;
    guild?: { id: string; name: string };
    encounters: readonly WoWEncounterWithHostiles[] | null;
    players: Record<string, InstancePlayer> | null;
    units: Record<string, InstanceUnit> | null;
    names_by_entry?: Record<number, string>;
    summons_by_owner?: Record<string, readonly string[]>;
    capabilities?: readonly string[];
    position_coordinate_space?: PositionCoordinateSpace;
    unlisted?: boolean;
    format?: string;
    flavor?: readonly string[];
    versions?: Record<string, string>;
    recorder_name?: string;
    recorder_guid?: string;
    difficulty_name?: string;
    max_players?: number;
    dynamic_difficulty?: number;
    invalidated_at?: string;
    invalid_reason?: string;
    vehicle_control_intervals?: VehicleControlMetadata;
    server_name?: string;
    tenant_name?: string;
    tenant_slug?: string;
    tenant_include_in_all?: boolean;
  },
): Instance {
  const players = normalizeRecord(apiInstance.players);
  const units = resolveInstanceUnits(
    apiInstance.units,
    apiInstance.names_by_entry,
    apiInstance.summons_by_owner,
  );
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
      mapId: enc.map_id,
      kill_type: enc.kill_type,
      start_time: enc.start_time,
      end_time: enc.end_time,
      players,
      enemies,
      remaining: enc.remaining as string[] | undefined,
      phases: normalizeArray(enc.phases).map((phase) => ({
        id: phase.id,
        encounter_id: enc.id,
        key: phase.key,
        name: phase.name,
        order: phase.order,
        start_offset_ms: phase.start_offset_ms,
        end_offset_ms: phase.end_offset_ms,
        start_time: new Date(new Date(enc.start_time).getTime() + phase.start_offset_ms).toISOString(),
        end_time: new Date(new Date(enc.start_time).getTime() + phase.end_offset_ms).toISOString(),
        kill_type: phase.kill_type,
      })),
      ranking_window: enc.ranking_window && {
        start_offset_ms: enc.ranking_window.start_offset_ms,
        end_offset_ms: enc.ranking_window.end_offset_ms,
      },
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
    logGroupId: apiInstance.log_group_id,
    name: apiInstance.name,
    realm: apiInstance.realm_name,
    datasetId: apiInstance.dataset_id ?? undefined,
    iconBaseUrl: apiInstance.icon_base_url,
    guild: apiInstance.guild,
    startTime,
    endTime,
    encounters,
    players,
    units,
    capabilities: apiInstance.capabilities ?? [],
    positionCoordinateSpace: apiInstance.position_coordinate_space
      ?? defaultPositionCoordinateSpace(apiInstance.format),
    unlisted: apiInstance.unlisted,
    format: apiInstance.format,
    flavor: apiInstance.flavor,
    versions: apiInstance.versions,
    recorderName: apiInstance.recorder_name,
    recorderGuid: apiInstance.recorder_guid,
    difficultyName: apiInstance.difficulty_name,
    maxPlayers: apiInstance.max_players,
    dynamicDifficulty: apiInstance.dynamic_difficulty,
    invalidatedAt: apiInstance.invalidated_at,
    invalidReason: apiInstance.invalid_reason,
    vehicleControlIntervals: apiInstance.vehicle_control_intervals,
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
  canInvalidateLogs,
  duplicateGroupId,
}: {
  instance: Instance;
  selectedEncounterIds?: string[];
  onSelectEncounters: (ids: string[] | null) => void;
  youtubeData: { url: string; results: readonly import("@/api/typesGenerated").VideoTimestamp[] } | null | undefined;
  selectedEncounterTimes: SelectedEncounterTimes;
  logDetailUrl?: string;
  rawEncounters?: readonly import("@/api/typesGenerated").WoWEncounterWithHostiles[];
  canAdminLogs?: boolean;
  canInvalidateLogs?: boolean;
  duplicateGroupId?: string;
}) {
  const [showYoutube, setShowYoutube] = useState(false);
  const [showReplayPanel, setShowReplayPanel] = useState(false);
  const [showTimeRange, setShowTimeRange] = useState(false);
  const { setEncounterBounds, setTimestamp, enabled: syncEnabled } = useSyncModeContext();
  const previousEncounterTimesRef = useRef(selectedEncounterTimes);
  const isMobile = useIsMobile();
  const showReplayControls = !isMobile;
  const replayPanelVisible = showReplayPanel && showReplayControls;
  // When pinned to the top, the replay controls no longer occupy the action
  // bar's space, so the spellbook can show again.
  const [replayPosition] = useReplayPosition();
  // One-shot jiggle to acknowledge the Replay button was clicked.
  const [replayJiggle, setReplayJiggle] = useState(false);
  
  // Update sync mode encounter bounds when selection changes. If replay is
  // already active, reset its cursor to the new selection's start.
  useEffect(() => {
    const resetTimestamp = getReplayResetTimestamp(
      previousEncounterTimesRef.current,
      selectedEncounterTimes,
      syncEnabled,
    );

    if (selectedEncounterTimes.start && selectedEncounterTimes.end) {
      setEncounterBounds({
        start: new Date(selectedEncounterTimes.start),
        end: new Date(selectedEncounterTimes.end),
      });
      if (resetTimestamp) setTimestamp(resetTimestamp);
    } else {
      setEncounterBounds(null);
    }

    previousEncounterTimesRef.current = selectedEncounterTimes;
  }, [selectedEncounterTimes, setEncounterBounds, setTimestamp, syncEnabled]);
  
  // Replay is desktop-only. Shown in the header, and beside Exit focus in focus mode.
  const replayButton = showReplayControls && (
    <Button
      variant={showReplayPanel || syncEnabled ? "default" : "outline"}
      size="sm"
      className={cn("gap-1.5", replayJiggle && "animate-button-jiggle")}
      onClick={() => {
        setShowReplayPanel((prev) => !prev);
        setReplayJiggle(true);
      }}
      onAnimationEnd={() => setReplayJiggle(false)}
    >
      <Timer className="h-4 w-4" />
      Replay
    </Button>
  );

  return (
    <InstanceKeybindProvider>
      <InstancePageView
        instance={instance}
        selectedEncounterIds={selectedEncounterIds}
        onSelectEncounters={onSelectEncounters}
        logDetailUrl={logDetailUrl}
        canAdminLogs={canAdminLogs}
        canInvalidateLogs={canInvalidateLogs}
        duplicateGroupId={duplicateGroupId}
        onOpenTimeRange={() => setShowTimeRange(true)}
        suppressActionBar={replayPanelVisible && replayPosition === "bottom"}
        supportsOverview
        focusActions={replayButton}
        onOpenReplay={showReplayControls ? () => setShowReplayPanel(true) : undefined}
        youtubeButton={
          <div className="flex gap-1.5">
            {replayButton}
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
    </InstanceKeybindProvider>
  );
}

// Connected component that fetches data
/** Encounter sidebar for an API instance, used by tools outside the instance page (e.g. the Lua preview). */
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
    invalidateLogs: "chronicle:chronicle#invalidate_logs",
  }), [logGroupId]);
  const { data: authz } = useAuthorizationCheck(authzChecks, {
    enabled: isAuthenticated && !!logGroupId,
  });
  const canDeleteLog = authz?.delete ?? false;
  const canAdminLogs = authz?.adminLogs ?? false;
  const canInvalidateLogs = authz?.invalidateLogs ?? false;
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
  const [focused] = useFocusMode();
  const { data: session } = useSession();
  const adSiteConfig = useAdSiteConfig();
  const ownerAdsFree = apiInstance?.owner_ads_free === true;
  const previewAdsEnabled = shouldShowAdPreview(
    window.location.hostname,
    import.meta.env.DEV && import.meta.env.CHRONICLE_PREVIEW_ADS,
  );
  const showAdRail = shouldShowInstanceAdRail({
    adsEnabled: adSiteConfig?.ads_enabled === true,
    previewEnabled: previewAdsEnabled,
    focused,
    ownerAdsFree,
    viewerAdsFree: session?.ads_free === true,
  });

  if (isLoading) {
    return (
      <div className="w-full px-4 py-6">
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
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
          <p className="font-medium text-destructive">
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
    <AdSuppressionProvider suppressed={ownerAdsFree}>
    <DatasetProvider datasetId={instance.datasetId} iconBaseUrl={instance.iconBaseUrl}>
    <SyncModeProvider>
      <LiveSessionProvider>
      <TimeRangeProvider totalDurationMs={totalEncounterDurationMs}>
        <InstanceEventsProvider instanceId={instance.id}>
          <PlayerCosmeticsProvider instanceId={instance.id}>
          <PlayerSpecializationProvider
            datasetId={instance.datasetId}
            flavor={instance.flavor ?? []}
            selectedEncounterIds={selectedEncounterIds}
          >
            <div className="flex w-full gap-6">
              <div className="min-w-0 flex-1">
                {tenantGate.banner && !focused && (
                  <div className="w-full px-4 pt-4">
                    {tenantGate.banner}
                  </div>
                )}
                {!focused && <AddonMissingBanner instance={instance} />}
                <InstancePageInner
                  instance={instance}
                  selectedEncounterIds={selectedEncounterIds}
                  onSelectEncounters={setUserSelectedEncounterIds}
                  youtubeData={youtubeData}
                  selectedEncounterTimes={selectedEncounterTimes}
                  logDetailUrl={logDetailUrl}
                  rawEncounters={apiInstance?.encounters}
                  canAdminLogs={canAdminLogs}
                  canInvalidateLogs={canInvalidateLogs}
                  duplicateGroupId={apiInstance?.duplicate_group_id}
                />
              </div>
              {showAdRail && (
                <AdRailStack
                  primaryPlacement="instance-right-rail"
                  secondaryPlacement="instance-right-rail-lower"
                  railLayout="compact"
                />
              )}
            </div>
            <InstanceAssistantChat key={instance.id} instanceId={instance.id} instanceName={instance.name} />
          </PlayerSpecializationProvider>
          </PlayerCosmeticsProvider>
        </InstanceEventsProvider>
      </TimeRangeProvider>
      </LiveSessionProvider>
    </SyncModeProvider>
    </DatasetProvider>
    </AdSuppressionProvider>
  );
}

function AddonMissingBanner({ instance }: { instance: Instance }) {
  if (!shouldShowChronicleCompanionWarning(instance)) return null;

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
