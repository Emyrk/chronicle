/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated view components intentionally share this module. */
import { lazy, Suspense, useCallback, useState } from "react";
import { Focus, Map as MapIcon, Maximize, Users } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
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
import { MapView2D, type MapViewRequest } from "./MapView2D";
import { useMapScene } from "./useMapScene";

const MapView3D = lazy(() => import("./MapView3D"));

export type MapPresentation = "replay-3d" | "overview-2d";

export function mapPresentationForSelection(selectedEncounterCount: number): MapPresentation {
  return selectedEncounterCount === 1 ? "replay-3d" : "overview-2d";
}

const framingButtonClass = "flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground";

function SingleEncounterReplayMap(props: PanelRenderProps<MapResult>) {
  const scene = useMapScene(props);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const ready = scene.status === "ready" ? scene : null;
  const autoFit = ready?.autoFit ?? null;
  const defaultViewport = ready?.fitByDefault && autoFit ? autoFit : FULL_MAP_VIEWPORT;
  const [storedFraming, setFraming] = useState<MapFraming>(INITIAL_MAP_FRAMING);
  // A new selection or replay moving into another encounter re-frames;
  // loading states (e.g. reprocessing after a filter change) keep the framing.
  const framing = ready
    ? reconcileMapFraming(storedFraming, `${props.context.selectedEncounterIds.join(",")}|${ready.encounterId}`, defaultViewport)
    : storedFraming;
  if (framing !== storedFraming) setFraming(framing);
  // Both views take the same request, so toggling 2D <-> 3D keeps the framing.
  const view: MapViewRequest = { viewport: framing.viewport ?? defaultViewport, key: String(framing.revision) };

  const handleUserViewport = useCallback((viewport: MapViewport) => {
    setFraming((current) => manualMapFraming(current, viewport));
  }, []);

  if (scene.status === "message") return <MapMessage title={scene.title} detail={scene.detail} />;

  const applyFraming = (viewport: MapViewport) => setFraming(pinMapFraming(framing, viewport));
  const view2D = <MapView2D ground={scene.ground} markers={scene.markers} view={view} onUserViewport={handleUserViewport} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground">
        <div className="min-w-0 truncate">
          <span className="font-semibold text-foreground">{scene.mapName}</span>
          <span className="ml-1.5 font-mono">world {scene.displayedMapId}</span>
          {!scene.overlayAvailable && (
            <span className="ml-1.5 text-amber-300/80">position overlay unavailable</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          <button type="button" onClick={() => applyFraming(FULL_MAP_VIEWPORT)} title="Show the full map" className={framingButtonClass}>
            <Maximize className="h-3 w-3" />
            Reset
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-black/70">
        {webglUnavailable ? view2D : (
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
              onUnavailable={() => setWebglUnavailable(true)}
            />
          </Suspense>
        )}
      </div>
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
  const presentation = mapPresentationForSelection(props.context.selectedEncounterIds.length);
  return presentation === "replay-3d"
    ? <SingleEncounterReplayMap {...props} />
    : <MapOverview2D {...props} />;
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
    requiredCapabilities: ["unit-position"],
    syncDataMode: "full",
    disableCardFlip: true,
    supportsFiltering: false,
    underConstruction: true,
    render: (props) => <MapContent {...props} />,
  };
}
