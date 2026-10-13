/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated view components intentionally share this module. */
import { lazy, Suspense, useState } from "react";
import { Map as MapIcon, Users } from "lucide-react";
import type { UnitPositionProcessorEvent } from "../processorTypes";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { mapProcessor, type MapResult } from "./map.processor";
import { MapView2D } from "./MapView2D";
import { useMapScene } from "./useMapScene";

const MapView3D = lazy(() => import("./MapView3D"));

type MapViewMode = "2d" | "3d";

const VIEW_MODE_STORAGE_KEY = "chronicle.map.viewMode";

function readStoredViewMode(): MapViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "3d" ? "3d" : "2d";
  } catch {
    return "2d";
  }
}

function storeViewMode(mode: MapViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable (private mode); the toggle still works for this session.
  }
}

function ViewModeToggle({ mode, onChange }: { mode: MapViewMode; onChange: (mode: MapViewMode) => void }) {
  return (
    <div role="group" aria-label="Map view mode" className="flex overflow-hidden rounded border border-border">
      {(["2d", "3d"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={mode === option}
          onClick={() => onChange(option)}
          className={`px-1.5 py-0.5 text-[10px] font-medium uppercase ${mode === option ? "bg-primary/20 text-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function MapContent(props: PanelRenderProps<MapResult>) {
  const scene = useMapScene(props);
  const [viewMode, setViewMode] = useState<MapViewMode>(readStoredViewMode);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  if (scene.status === "message") return <MapMessage title={scene.title} detail={scene.detail} />;

  const changeViewMode = (mode: MapViewMode) => {
    setViewMode(mode);
    storeViewMode(mode);
  };
  const show3D = viewMode === "3d" && !webglUnavailable;
  const view2D = <MapView2D ground={scene.ground} markers={scene.markers} />;

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
          <ViewModeToggle mode={viewMode} onChange={changeViewMode} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-black/70">
        {show3D ? (
          <Suspense fallback={<MapMessage title="Loading 3D view" detail="Fetching the 3D renderer…" />}>
            <MapView3D
              ground={scene.ground}
              markers={scene.markers}
              projectSample={scene.projectSample}
              cursorMs={scene.cursorMs}
              playing={scene.playing}
              playbackSpeed={scene.playbackSpeed}
              onUnavailable={() => setWebglUnavailable(true)}
            />
          </Suspense>
        ) : view2D}
      </div>
      {viewMode === "3d" && webglUnavailable && (
        <p className="px-1 text-[9px] text-amber-300/80">3D view needs WebGL, which this browser could not provide. Showing the 2D map instead.</p>
      )}
      {!scene.overlayAvailable ? (
        <p className="px-1 text-[9px] text-amber-300/80">No compatible world-coordinate mapping is available for this floor, so unit markers are hidden.</p>
      ) : !scene.syncEnabled ? (
        <p className="px-1 text-[9px] text-muted-foreground">Showing the final position snapshot. Enable Replay to watch units move.</p>
      ) : null}
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

export function createMapPanel(): PanelDefinition<MapResult, UnitPositionProcessorEvent> {
  return {
    ...mapProcessor,
    label: "Map",
    icon: <MapIcon className="h-4 w-4" />,
    requiredCapabilities: ["unit-position"],
    syncDataMode: "full",
    underConstruction: true,
    render: (props) => <MapContent {...props} />,
  };
}
