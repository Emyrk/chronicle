import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DatasetProvider } from "@/hooks/useDatasetId";
import { InstanceEventsContext } from "@/hooks/instanceEvents";
import type { StreamType } from "@/hooks/instanceEvents/types";
import { emptyStream } from "@/sim/buildSimStream";
import { fetchMapManifest } from "@/pages/Technical/mapManifest";
import { TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { replayDungeonMesh } from "../EventsPanels/Map/dungeonMeshes";
import { loadMapFixture } from "../EventsPanels/Map/fixtures/mapFixture";
import { LEEROY_VIDEO_TIMESTAMPS, LEEROY_VIDEO_URL, leeroyChargeCamera, leeroyRookery } from "../EventsPanels/Map/fixtures/leeroyRookery";
import type { WowMapMeshInstance } from "@/pages/Technical/mapGallery";
import { InstancePageInner } from "../InstancePage";
import { LiveSessionProvider } from "../LiveSessionContext";
import { SyncModeProvider } from "../SyncModeContext";
import { TimeRangeProvider } from "../TimeRangeContext";
import { buildLeeroyStreams } from "./leeroyStreams";

const ENCOUNTER_ID = leeroyRookery.encounter.id;
const EMPTY_STREAM = emptyStream();

/** Public, read-only cinematic reconstruction; no persisted raid-log instance exists. */
export function LeeroyPage() {
  const { data: manifest, isLoading, error } = useQuery({
    queryKey: ["wow-map-manifest", leeroyRookery.instance.iconBaseUrl],
    queryFn: () => fetchMapManifest(leeroyRookery.instance.iconBaseUrl),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const map = manifest?.instances?.find((entry) => entry.mapID === leeroyRookery.encounter.mapId);
  const mesh = map ? replayDungeonMesh(map, map.floors[0]) : null;
  // The real map 229 mesh is required; the fixture's placeholder is not a published GLB.
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading the Rookery map…</div>;
  if (error || !mesh) {
    return <div role="alert" className="p-6 text-sm text-destructive">The Rookery map is unavailable. Please try again later.</div>;
  }
  return <LeeroyInstance mesh={mesh} />;
}

function LeeroyInstance({ mesh }: { mesh: WowMapMeshInstance }) {
  const [fixture] = useState(() => loadMapFixture(leeroyRookery));
  const [streams] = useState(() => buildLeeroyStreams(leeroyRookery));
  const [selectedEncounterIds, setSelectedEncounterIds] = useState<string[]>([ENCOUNTER_ID]);
  const instance = useMemo(() => ({
    ...fixture.props.context.instance,
    id: "leeroy",
    slug: "leeroy",
    name: "Leeroy Jenkins: The Rookery",
    maxPlayers: Object.keys(leeroyRookery.players).length,
    replayCameraPath: leeroyChargeCamera(mesh.bounds, 0),
  }), [fixture, mesh]);
  const eventContext = useMemo(() => ({
    instanceId: instance.id,
    getStream: (type: StreamType) => streams.get(type) ?? EMPTY_STREAM,
    fetchStream: (type: StreamType) => Promise.resolve(streams.get(type) ?? EMPTY_STREAM),
    isFetching: () => false,
  }), [instance.id, streams]);
  const durationMs = fixture.endMs - fixture.startMs;

  return (
    <DatasetProvider iconBaseUrl={instance.iconBaseUrl}>
      <SyncModeProvider>
        <LiveSessionProvider>
          <TimeRangeProvider totalDurationMs={durationMs}>
            <InstanceEventsContext.Provider value={eventContext}>
              <TooltipProvider>
                <div className="w-full px-4 pt-4 text-sm text-amber-200/90">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <strong>Cinematic reconstruction.</strong> This is not a recovered combat log. Player movement follows <a href="https://youtu.be/IAOLAw0k2DU" target="_blank" rel="noreferrer" className="underline">Internet Historian&apos;s fan map</a> of the original video. Damage, healing, casts, health and power are illustrative, not recovered combat-log measurements.
                  </div>
                </div>
                <InstancePageInner
                  instance={instance}
                  selectedEncounterIds={selectedEncounterIds}
                  onSelectEncounters={(ids) => setSelectedEncounterIds(ids ?? [ENCOUNTER_ID])}
                  selectedEncounterTimes={{ start: leeroyRookery.encounter.startTime, end: leeroyRookery.encounter.endTime }}
                  youtubeData={{ url: LEEROY_VIDEO_URL, results: LEEROY_VIDEO_TIMESTAMPS }}
                  autoOpenYoutube
                  reconstruction
                />
              </TooltipProvider>
            </InstanceEventsContext.Provider>
          </TimeRangeProvider>
        </LiveSessionProvider>
      </SyncModeProvider>
    </DatasetProvider>
  );
}
