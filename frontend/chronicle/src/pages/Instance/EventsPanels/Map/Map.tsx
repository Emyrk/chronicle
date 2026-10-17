/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated view components intentionally share this module. */
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Crosshair, Focus, HeartPulse, Map as MapIcon, Maximize, Route, Users, X } from "lucide-react";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { fetchMiniatureUrls } from "./bossMinis";
import { dungeonMeshLiquid, dungeonMeshUrl } from "./dungeonMeshes";
import { mapProcessor, type MapProcessorEvent, type MapResult } from "./map.processor";
import { MapOverview2D } from "./MapOverview2D";
import {
  FULL_MAP_VIEWPORT,
  INITIAL_MAP_FRAMING,
  manualMapFraming,
  pinMapFraming,
  reconcileMapFraming,
  type MapFraming,
  type MapViewport,
} from "./mapModel";
import type { DungeonMeshRequest, DungeonMeshState, MapSceneFocus } from "./MapScene3D";
import { MapView2D, type MapViewRequest } from "./MapView2D";
import { useEmbeddedPanel } from "../useEmbeddedPanel";
import { UnitInspectContext, type UnitInspectSelection } from "../UnitInspectContext";
import { InspectCards } from "./InspectCards";
import { createRaidFramesPanel } from "../RaidFrames/RaidFrames";
import { MAP_CONTROL_KEYBINDS } from "./mapControls";
import { MeterWindows } from "./MeterWindows";
import { useMeterWindows } from "./meterWindowsState";
import { useMapScene } from "./useMapScene";
import { encounterJumps, mapPresentationForSelection } from "./wholeRun";

export { mapPresentationForSelection };

const MapView3D = lazy(() => import("./MapView3D"));

const RAID_FRAMES_PANEL = createRaidFramesPanel();

const MESH_STORAGE_KEY = "chronicle.map.mesh";

function readStoredMesh(): boolean | null {
  try {
    const stored = localStorage.getItem(MESH_STORAGE_KEY);
    return stored === null ? null : stored === "true";
  } catch {
    return null;
  }
}

export function preferredMeshState(stored: boolean | null): boolean {
  return stored ?? true;
}

const RAID_FRAMES_STORAGE_KEY = "chronicle.map.raidFrames";

function readStoredRaidFrames(): boolean {
  try {
    return localStorage.getItem(RAID_FRAMES_STORAGE_KEY) !== "hidden";
  } catch {
    return true;
  }
}

function storeRaidFrames(shown: boolean) {
  try {
    localStorage.setItem(RAID_FRAMES_STORAGE_KEY, shown ? "shown" : "hidden");
  } catch {
    // Storage may be unavailable; the choice still applies for this session.
  }
}

function storeMesh(on: boolean) {
  try {
    localStorage.setItem(MESH_STORAGE_KEY, String(on));
  } catch {
    // Storage may be unavailable (private mode); the toggle still works for this session.
  }
}

const framingButtonClass = "flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground";

interface ReplayMapProps extends PanelRenderProps<MapResult> {
  /** Replay the whole run instead of the one selected encounter. */
  wholeRun?: boolean;
  onExitWholeRun?: () => void;
}

function SingleEncounterReplayMap({ wholeRun = false, onExitWholeRun, ...props }: ReplayMapProps) {
  const sync = useSyncModeContextOptional();
  const miniatureQuery = useQuery({
    queryKey: ["unit-miniatures"],
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: () => fetchMiniatureUrls(),
  });
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const show3D = !webglUnavailable;
  // "3D map": the real dungeon mesh as the ground. Units project onto it with
  // the mesh entry's bounds only once it has loaded; until then (and when the
  // load fails) the tiles and their calibration stay.
  const [storedMesh, setStoredMesh] = useState(readStoredMesh);
  const [meshState, setMeshState] = useState<DungeonMeshState>("loading");
  const meshOn = preferredMeshState(storedMesh);
  const scene = useMapScene(props, { rawDungeonProjection: show3D && meshOn && meshState === "ready", wholeRun });
  const ready = scene.status === "ready" ? scene : null;
  // A mesh-only instance (no map artwork) has nothing but the mesh to show:
  // the switch is on and stays on.
  const meshOnly = ready?.meshOnly ?? false;
  const meshWanted = show3D && (meshOn || meshOnly);
  const iconBaseUrl = props.context.instance.iconBaseUrl;
  // The manifest's mesh entry (one object per cached manifest, not rebuilt
  // per render) keys the request: a changed entry re-requests the mesh.
  const mesh = ready?.mesh ?? null;
  const meshUrl = mesh && iconBaseUrl ? dungeonMeshUrl(mesh, iconBaseUrl) : null;
  const dungeonMesh = useMemo((): DungeonMeshRequest | null =>
    meshWanted && mesh && meshUrl ? { url: meshUrl, bounds: mesh.bounds, liquid: dungeonMeshLiquid(mesh) } : null,
  [mesh, meshUrl, meshWanted]);
  const focusCentre = ready?.focusCentre ?? null;
  const fitZoom = ready?.fitByDefault ? ready.autoFit?.zoom ?? null : null;
  const focus = useMemo((): MapSceneFocus | null =>
    focusCentre && fitZoom !== null ? { centre: focusCentre, zoom: fitZoom } : null,
  [fitZoom, focusCentre]);
  const autoFit = ready?.autoFit ?? null;
  const defaultViewport = ready?.fitByDefault && autoFit ? autoFit : FULL_MAP_VIEWPORT;
  const [showRaidFrames, setShowRaidFramesState] = useState(readStoredRaidFrames);
  const setShowRaidFrames = (shown: boolean) => {
    setShowRaidFramesState(shown);
    storeRaidFrames(shown);
  };
  const [meterWindows, setMeterWindows] = useMeterWindows();
  // Units picked for a closer look: click them on the map or in the raid frames.
  const [inspected, setInspected] = useState<string[]>([]);
  const toggleInspected = useCallback((guid: string) => {
    setInspected((current) => current.includes(guid) ? current.filter((other) => other !== guid) : [...current, guid]);
  }, []);
  const inspectSelection = useMemo((): UnitInspectSelection => ({ inspected: new Set(inspected), toggle: toggleInspected }), [inspected, toggleInspected]);
  // One Raid Frames run draws both the grid and the inspect frames.
  const raidFrames = useEmbeddedPanel({
    panel: RAID_FRAMES_PANEL,
    context: props.context,
    durationMs: props.durationMs,
    enabled: showRaidFrames || inspected.length > 0,
  });
  const [storedFraming, setFraming] = useState<MapFraming>(INITIAL_MAP_FRAMING);
  // A new selection or replay moving into another encounter re-frames;
  // loading states (e.g. reprocessing after a filter change) keep the framing.
  const framing = ready
    ? reconcileMapFraming(storedFraming, `${props.context.selectedEncounterIds.join(",")}|${ready.encounterId}`, defaultViewport)
    : storedFraming;
  if (framing !== storedFraming) setFraming(framing);
  // Both views take the same request, so toggling 2D <-> 3D keeps the framing.
  const view: MapViewRequest = { viewport: framing.viewport ?? defaultViewport, key: String(framing.revision) };

  // The cinematic camera has the mesh view whenever the framing is the default
  // one: the user has not pinned a Fit / Reset and has not panned or zoomed.
  const cinematic = !framing.manual && framing.viewport === null;
  const handleUserViewport = useCallback((viewport: MapViewport) => {
    setFraming((current) => manualMapFraming(current, viewport));
  }, []);

  if (scene.status === "message") return <MapMessage title={scene.title} detail={scene.detail} />;

  const applyFraming = (viewport: MapViewport) => setFraming(pinMapFraming(framing, viewport));
  // Back to the default framing: the cinematic camera on the mesh, the
  // party-following one across a whole run.
  const followGroup = () => setFraming({ ...framing, viewport: null, manual: false, revision: framing.revision + 1 });
  // Follow stands in for Fit while the camera can follow: across a run, and on
  // the mesh, where the Director frames the boss and the group itself.
  const canFollow = scene.wholeRun || (show3D && meshWanted && meshState === "ready");
  const following = canFollow && cinematic;
  const jumps = scene.wholeRun && scene.runStartMs !== null && scene.runEndMs !== null
    ? encounterJumps(props.context.instance.encounters, props.result.encounters, scene.runStartMs, scene.runEndMs)
    : [];
  const jumpTo = (timestampMs: number) => sync?.setTimestamp(new Date(timestampMs));
  const toggleMesh = () => {
    const next = !meshOn;
    setStoredMesh(next);
    storeMesh(next);
  };
  const view2D = <MapView2D ground={scene.ground} markers={scene.markers} view={view} onUserViewport={handleUserViewport} />;

  // In the card's title row when the host offers one, so the map gets the height.
  const headerControls = (
    <div className="flex min-w-0 shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
      {!scene.overlayAvailable && <span className="text-amber-300/80">position overlay unavailable</span>}
      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{scene.markers.length}</span>
      {scene.floors.length > 1 && (
        <select
          aria-label="Map floor"
          value={scene.selectedFloorNumber ?? ""}
          onChange={(event) => scene.setFloorNumber(Number(event.target.value))}
          className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground [color-scheme:dark]"
        >
          {scene.floors.map((floor) => <option key={floor} value={floor}>Floor {floor}</option>)}
        </select>
      )}
      {canFollow ? (
        <button
          type="button"
          aria-pressed={following}
          onClick={followGroup}
          disabled={scene.wholeRun && !autoFit}
          title="Keep the camera on the boss and the group"
          className={`${framingButtonClass} ${following ? "bg-primary/20 text-foreground" : ""}`}
        >
          <Crosshair className="h-3 w-3" />
          Follow
        </button>
      ) : (
        <button
          type="button"
          onClick={() => autoFit && applyFraming(autoFit)}
          disabled={!autoFit}
          title="Zoom to the boss area"
          className={framingButtonClass}
        >
          <Focus className="h-3 w-3" />
          Fit
        </button>
      )}
      <button type="button" onClick={() => applyFraming(FULL_MAP_VIEWPORT)} title="Show the full map" className={framingButtonClass}>
        <Maximize className="h-3 w-3" />
        Reset
      </button>
      {onExitWholeRun && (
        <button type="button" onClick={onExitWholeRun} title="Back to the 2D route overview" className={framingButtonClass}>
          <Route className="h-3 w-3" />
          Overview
        </button>
      )}
      {show3D && meshUrl && (
        <button
          type="button"
          aria-pressed={meshWanted}
          disabled={meshOnly}
          onClick={toggleMesh}
          title={meshOnly
            ? "This instance has no map artwork; the real dungeon mesh is all there is to show"
            : "Stand the units on the real dungeon mesh instead of the map tiles"}
          className={`${framingButtonClass} ${meshWanted ? "bg-primary/20 text-foreground disabled:opacity-100" : ""}`}
        >
          3D map
          {dungeonMesh && meshState === "loading" && <span className="font-normal text-muted-foreground">loading cave…</span>}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      {props.headerSlot ? createPortal(headerControls, props.headerSlot) : <div className="flex justify-end px-1">{headerControls}</div>}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-black/70">
        {!show3D ? (meshOnly
          ? <MapMessage title="No map artwork for this instance" detail={`${scene.mapName} has no 2D map; it is 3D only, and this browser could not provide WebGL.`} />
          : view2D
        ) : (
          <Suspense fallback={<MapMessage title="Loading 3D view" detail="Fetching the 3D renderer…" />}>
            <MapView3D
              ground={scene.ground}
              markers={scene.markers}
              projectSample={scene.projectSample}
              cursorMs={scene.cursorMs}
              playing={scene.playing}
              playbackSpeed={scene.playbackSpeed}
              view={view}
              onUserViewport={handleUserViewport}
              effects={scene.effects}
              bossGuids={scene.bossGuids}
              tankGuids={scene.tankGuids}
              miniatureUrls={miniatureQuery.data}
              onUnavailable={() => setWebglUnavailable(true)}
              dungeonMesh={dungeonMesh}
              onDungeonMeshState={setMeshState}
              focus={focus}
              cinematic={cinematic}
              onUnitClick={toggleInspected}
            />
          </Suspense>
        )}
        {/* Top-left: the Raid Frames panel itself, drawn as an overlay (one
            implementation for the map and the panel). The inspect frame below moves freely. */}
        <UnitInspectContext.Provider value={inspectSelection}>
          <div className="pointer-events-none absolute bottom-2 left-2 top-2 z-30 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1.5">
            {showRaidFrames ? (
              <div className="group/raid flex max-w-full shrink-0 items-start gap-0.5">
                <div className="min-w-0 overflow-hidden">{raidFrames()}</div>
                <button
                  type="button"
                  onClick={() => setShowRaidFrames(false)}
                  title="Hide raid frames"
                  aria-label="Hide raid frames"
                  className="pointer-events-auto grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-black/75 text-white/60 opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 group-hover/raid:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              // Hidden: a button in their corner brings them back.
              <button
                type="button"
                onClick={() => setShowRaidFrames(true)}
                title="Show raid frames"
                aria-label="Show raid frames"
                className="pointer-events-auto grid h-7 w-7 shrink-0 place-items-center rounded-sm border border-black/80 bg-black/75 text-white/70 shadow-[0_4px_16px_rgba(0,0,0,.5)] hover:bg-black/90 hover:text-white"
              >
                <HeartPulse className="h-4 w-4" />
              </button>
            )}
          </div>
        </UnitInspectContext.Provider>
        <InspectCards
          guids={inspected}
          onRemove={toggleInspected}
          raidFrames={raidFrames}
          context={props.context}
          durationMs={props.durationMs}
        />
        <MeterWindows windows={meterWindows} onChange={setMeterWindows} context={props.context} durationMs={props.durationMs} />
      </div>
      {jumps.length > 0 && scene.runStartMs !== null && (
        <div className="flex flex-col gap-1 px-1">
          <div className="relative h-1.5 rounded bg-white/10" aria-hidden>
            {jumps.map((jump) => (
              <span key={jump.id} className="absolute top-0 h-full w-0.5 bg-amber-300/80" style={{ left: `${jump.fraction * 100}%` }} />
            ))}
            {scene.syncEnabled && scene.runEndMs !== null && (
              <span
                className="absolute top-[-1px] h-2 w-0.5 bg-foreground"
                style={{ left: `${Math.min(100, Math.max(0, ((scene.cursorMs - scene.runStartMs) / Math.max(1, scene.runEndMs - scene.runStartMs)) * 100))}%` }}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-1" aria-label="Encounters">
            {jumps.map((jump) => (
              <button
                key={jump.id}
                type="button"
                onClick={() => jumpTo(jump.timestampMs)}
                disabled={!scene.syncEnabled}
                title={scene.syncEnabled ? `Jump to ${jump.name}` : "Enable Replay to jump between encounters"}
                className={framingButtonClass}
              >
                {jump.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {webglUnavailable && (
        <p className="px-1 text-[9px] text-amber-300/80">3D view needs WebGL, which this browser could not provide. Showing the replay map in 2D instead.</p>
      )}
      {!scene.overlayAvailable ? (
        <p className="px-1 text-[9px] text-amber-300/80">No compatible world-coordinate mapping is available for this floor, so unit markers are hidden.</p>
      ) : !scene.syncEnabled ? (
        <p className="px-1 text-[9px] text-muted-foreground">Showing the final position snapshot. Enable Replay to watch units move.</p>
      ) : null}
    </div>
  );
}

function MapContent(props: PanelRenderProps<MapResult>) {
  const [wholeRun, setWholeRun] = useState(false);
  const selectedCount = props.context.selectedEncounterIds.length;
  const presentation = mapPresentationForSelection(selectedCount, wholeRun);
  if (presentation === "replay-3d" && selectedCount !== 1) {
    return <SingleEncounterReplayMap {...props} wholeRun onExitWholeRun={() => setWholeRun(false)} />;
  }
  if (presentation === "replay-3d") return <SingleEncounterReplayMap {...props} />;
  // With nothing selected there is no data to replay: take the run's encounters
  // (what the page selects by default) so the processor has the whole run.
  const startWholeRun = () => {
    if (selectedCount === 0) {
      const ids = props.context.instance.encounters
        .filter((encounter) => encounter.kill_type !== "wipe" && encounter.kill_type !== "reset")
        .map((encounter) => encounter.id);
      props.context.onSelectEncounters?.(ids);
    }
    setWholeRun(true);
  };
  const wholeRunButton = (
    <button type="button" onClick={startWholeRun} title="Replay the whole run in 3D, the camera following the group" className={framingButtonClass}>
      <Route className="h-3 w-3" />
      Whole run
    </button>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      {props.headerSlot ? createPortal(wholeRunButton, props.headerSlot) : <div className="flex justify-end px-3 pt-2">{wholeRunButton}</div>}
      <div className="min-h-0 flex-1">
        <MapOverview2D {...props} />
      </div>
    </div>
  );
}

function MapMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
      <MapIcon className="h-8 w-8 text-muted-foreground/50" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function createMapPanel(): PanelDefinition<MapResult, MapProcessorEvent> {
  return {
    ...mapProcessor,
    label: "Map",
    icon: <MapIcon className="h-4 w-4" />,
    keybinds: MAP_CONTROL_KEYBINDS,
    requiredCapabilities: ["unit-position"],
    syncDataMode: "full",
    disableCardFlip: true,
    supportsFiltering: false,
    underConstruction: true,
    render: (props) => <MapContent {...props} />,
  };
}
