import { useMemo, useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Youtube, Timer } from "lucide-react";
import { useInstance, useInstanceYoutube } from "@/api/queries";
import { InstanceEventsProvider } from "@/hooks/instanceEvents";
import type { ActivityPeriod, InstancePlayer, InstanceUnit, WoWEncounterWithHostiles } from "@/api/typesGenerated";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { InstancePageView } from "./InstancePageView";
import { YouTubeOverlay } from "./YouTubeOverlay";
import { SyncModeProvider, useSyncModeContext } from "./SyncModeContext";
import { SyncControlOverlay } from "./SyncControlOverlay";

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
  kill: boolean;
  start_time: string;
  end_time: string;
  enemies?: EnemyUnit[];
  remaining?: string[]; // GUIDs of enemies that did not die
}

export interface Instance {
  id: string;
  name: string;
  realm?: string;
  startTime: string;
  endTime?: string;
  encounters: Encounter[];
  // GUID -> player info lookup
  players?: Record<string, InstancePlayer>;
  // GUID -> unit info lookup (creatures, pets, etc.)
  units?: Record<string, InstanceUnit>;
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

// Helper to transform API data to view data
function transformToInstance(
  apiInstance: {
    id: string;
    name: string;
    encounters: readonly WoWEncounterWithHostiles[];
    players: Record<string, InstancePlayer>;
    units: Record<string, InstanceUnit>;
  },
): Instance {
  const { players, units } = apiInstance;

  // Map encounters
  const encounters: Encounter[] = apiInstance.encounters.map((enc) => {
    // Build enemies from encounter hostiles
    const enemies: EnemyUnit[] = enc.hostiles
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
      kill: enc.kill,
      start_time: enc.start_time,
      end_time: enc.end_time,
      players,
      enemies,
      remaining: enc.remaining as string[] | undefined,
    };
  });

  // Compute instance timing from encounters
  const sortedEncounters = [...apiInstance.encounters].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  const startTime = sortedEncounters[0]?.start_time || new Date().toISOString();
  const endTime = sortedEncounters[sortedEncounters.length - 1]?.end_time;

  return {
    id: apiInstance.id,
    name: apiInstance.name,
    startTime,
    endTime,
    encounters,
    players,
    units,
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
}: {
  instance: Instance;
  selectedEncounterIds: string[];
  onSelectEncounters: (ids: string[] | null) => void;
  youtubeData: { url: string; results: readonly import("@/api/typesGenerated").VideoTimestamp[] } | null | undefined;
  selectedEncounterTimes: { start: string | undefined; end: string | undefined };
}) {
  const [showYoutube, setShowYoutube] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [searchParams] = useSearchParams();
  const experimentalEnabled = searchParams.get("exp") === "1";
  const { setEncounterBounds, enabled: syncEnabled } = useSyncModeContext();
  
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
        youtubeButton={
          <div className="flex gap-1.5">
            {/* Sync button - only show with ?exp=1 */}
            {experimentalEnabled && (
              <Button
                variant={syncEnabled ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setShowSyncPanel(true)}
              >
                <Timer className="h-4 w-4" />
                Sync
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
      {showSyncPanel && (
        <SyncControlOverlay 
          onClose={() => setShowSyncPanel(false)}
          initialTimestamp={selectedEncounterTimes.start ? new Date(selectedEncounterTimes.start) : undefined}
        />
      )}
      {showYoutube && youtubeData?.url && (
        <YouTubeOverlay
          videoUrl={youtubeData.url}
          timestamps={youtubeData.results}
          targetTime={selectedEncounterTimes.start}
          pauseTime={selectedEncounterTimes.end}
          onClose={() => setShowYoutube(false)}
        />
      )}
    </>
  );
}

// Connected component that fetches data
export function InstancePage() {
  const { instanceId } = useParams<{ instanceId: string }>();
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

  const instance = useMemo(() => {
    if (!apiInstance) return null;
    return transformToInstance(apiInstance);
  }, [apiInstance]);

  // Compute default encounter IDs (all encounters)
  const defaultEncounterIds = useMemo(() => {
    if (!instance) return [];
    return instance.encounters.map(e => e.id);
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

  const isLoading = instanceLoading;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
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
      <div className="container mx-auto px-4 py-6 max-w-7xl">
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

  // // Use log_group_id from the API response to construct back URL
  // const backUrl = apiInstance?.log_group_id ? `/logs/${apiInstance.log_group_id}` : "/logs";

  return (
    <SyncModeProvider>
      <InstanceEventsProvider instanceId={instance.id}>
        <InstancePageInner
          instance={instance}
          selectedEncounterIds={selectedEncounterIds}
          onSelectEncounters={setUserSelectedEncounterIds}
          youtubeData={youtubeData}
          selectedEncounterTimes={selectedEncounterTimes}
        />
      </InstanceEventsProvider>
    </SyncModeProvider>
  );
}
