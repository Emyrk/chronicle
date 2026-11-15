/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated view components intentionally share this module. */
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Map as MapIcon, Play, Route, X } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { MapPanelHost } from "./MapPanelHost";
import { MobileMapHost } from "./MobileMapHost";
import { ExpandMapButton } from "./MapChrome";
import { framingButtonClass } from "./mapChromeStyles";
import { isMiniMapOption } from "./mapHostModel";
import type { Encounter } from "../../InstancePage";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { mapProcessor, type MapProcessorEvent, type MapResult } from "./map.processor";
import { EncounterFloorProvider } from "./EncounterFloorProvider";
import { MapOverview2D } from "./MapOverview2D";
import { MAP_CONTROL_KEYBINDS } from "./mapControls";
import {
  dismissMapTelemetryWarning,
  hasLimitedHostilePositionTelemetry,
  isMapTelemetryWarningDismissed,
  MAP_TELEMETRY_WARNING_STORAGE_KEY,
} from "./mapTelemetryWarning";
import { mapPresentationForSelection, wholeRunWanted } from "./wholeRun";
import { miniExpandStep, useLoadSettled, useSelectOnce, type MiniExpand, type MiniExpandEvent } from "./wholeRunPlayback";

export { mapPresentationForSelection };
export { alignmentOverlayForMapMode, isMiniMapOption, mapOwnsPortalContainer, preferredMeshState, walkModeAvailable } from "./mapHostModel";
export { FullscreenEncounterPicker } from "./MapChrome";

function MapTelemetryWarning({ props, children }: { props: PanelRenderProps<MapResult>; children: ReactNode }) {
  const [dismissedInstances, setDismissedInstances] = useLocalStorage<unknown>(MAP_TELEMETRY_WARNING_STORAGE_KEY, []);
  const instanceId = props.context.instance.id;
  const showWarning = props.variant !== "overlay"
    && hasLimitedHostilePositionTelemetry(props.context.instance)
    && !isMapTelemetryWarningDismissed(dismissedInstances, instanceId);
  const warningDetail = props.context.instance.format === "3.3.5a-cc-addon"
    ? "3.3.5a position telemetry only includes allied units. Hostile entities will not be shown."
    : "SuperWoW only emits positional data for friendly units. Hostile entities will not be shown. Switch to ClassicAPI for positional data on all units.";

  return (
    <div className="relative h-full min-h-0">
      {children}
      {showWarning && (
        <div
          role="alert"
          className="absolute left-2 right-2 top-2 z-50 flex items-start gap-2 rounded-md border border-amber-400/70 bg-amber-950/95 px-3 py-2 text-xs text-amber-50 shadow-lg backdrop-blur-sm"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="min-w-0 flex-1 leading-relaxed">
            <strong>Incomplete hostile positions.</strong>{" "}
            {warningDetail}
          </p>
          <button
            type="button"
            onClick={() => setDismissedInstances((current: unknown) => dismissMapTelemetryWarning(current, instanceId))}
            className="-mr-1 -mt-1 rounded p-1 text-amber-100/70 hover:bg-amber-100/10 hover:text-amber-50"
            aria-label="Dismiss positional data warning for this instance"
            title="Dismiss for this instance"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/** The run's encounters as the page selects them by default: everything but wipes and resets. */
function runEncounterIds(encounters: Encounter[]): string[] {
  return encounters
    .filter((encounter) => encounter.kill_type !== "wipe" && encounter.kill_type !== "reset")
    .map((encounter) => encounter.id);
}

function MapContent({ forceMini = false, ...props }: PanelRenderProps<MapResult> & { forceMini?: boolean }) {
  // The user's Whole run / Overview choice; null leaves it to the default (wholeRunWanted).
  const [wholeRunChoice, setWholeRunChoice] = useState<boolean | null>(null);
  // The default whole run could not play here (no positions, no WebGL, mesh failed).
  const [defaultRunFailed, setDefaultRunFailed] = useState(false);
  const exitWholeRun = useCallback(() => setWholeRunChoice(false), []);
  const isMobile = useIsMobile();
  // The Mini Map panel is always mini; a Map panel is mini with the (older) "mini" option.
  const mini = forceMini || isMiniMapOption(props.panelOption);
  const selectedCount = props.context.selectedEncounterIds.length;
  const wholeRun = wholeRunWanted(wholeRunChoice, { mini, unplayable: defaultRunFailed, selectedCount });
  // Tracked here, not in the 3D map: this outlives the 2D overview's swap to 3D.
  const selectionLoaded = useLoadSettled(props.context.selectedEncounterIds.join(","), Boolean(props.loading || props.processing));
  const instanceEncounters = props.context.instance.encounters;
  const onSelectEncounters = props.context.onSelectEncounters;
  const onApplyPreset = props.context.onApplyPreset;
  // The full map's default whole run with nothing selected: select the run's
  // encounters (once, so clearing the selection later is left alone).
  const selectRun = useMemo(
    () => onSelectEncounters ? () => onSelectEncounters(runEncounterIds(instanceEncounters)) : undefined,
    [instanceEncounters, onSelectEncounters],
  );
  useSelectOnce(!isMobile && !mini && wholeRunChoice === null && !defaultRunFailed && selectedCount === 0, selectRun);
  // What goes fullscreen: a wrapper that stays mounted while the 2D overview swaps for the 3D replay.
  const [expandRoot, setExpandRoot] = useState<HTMLDivElement | null>(null);
  // Expand from the 2D mini map (see miniExpandStep); the ref is what handlers read.
  const [miniExpand, setMiniExpand] = useState<MiniExpand>(null);
  const miniExpandRef = useRef<MiniExpand>(null);
  const stepMiniExpand = useCallback((event: MiniExpandEvent) => {
    const step = miniExpandStep(miniExpandRef.current, event);
    if (step.state === miniExpandRef.current) return;
    miniExpandRef.current = step.state;
    setMiniExpand(step.state);
    if (step.restore) setWholeRunChoice(step.restoreChoice);
    if (step.exitFullscreen && expandRoot && document.fullscreenElement === expandRoot) {
      void document.exitFullscreen().catch(() => undefined);
    }
    if (step.openMapTab) onApplyPreset?.("map");
  }, [expandRoot, onApplyPreset]);
  const handleImmersiveChange = useCallback(
    (immersive: boolean) => stepMiniExpand(immersive ? "immersive" : "inline"),
    [stepMiniExpand],
  );
  const handleUnplayable = useCallback(() => {
    if (miniExpandRef.current) stepMiniExpand("unplayable");
    else setDefaultRunFailed(true);
  }, [stepMiniExpand]);
  // Expand on the 2D mini map: the whole run, fullscreen, requested in the
  // click (it needs the user gesture). Without fullscreen: the Map tab, as before.
  const expandRun = () => {
    const request = expandRoot?.requestFullscreen?.({ navigationUI: "hide" });
    if (!request) {
      onApplyPreset?.("map");
      return;
    }
    if (selectedCount === 0) selectRun?.();
    miniExpandRef.current = { phase: "requested", restoreChoice: wholeRunChoice };
    setMiniExpand(miniExpandRef.current);
    setWholeRunChoice(true);
    void request.catch(() => stepMiniExpand("refused"));
  };
  if (isMobile) {
    return (
      <MapTelemetryWarning props={props}>
        <MobileMapHost {...props} wholeRun={selectedCount !== 1} />
      </MapTelemetryWarning>
    );
  }
  const presentation = mapPresentationForSelection(selectedCount, wholeRun);
  // Without browser fullscreen, Expand opens the Map tab as it always has.
  const expandRunAvailable = typeof document !== "undefined" && document.fullscreenEnabled;
  // With nothing selected there is no data to replay: take the run's encounters
  // (what the page selects by default) so the processor has the whole run.
  const startWholeRun = () => {
    if (selectedCount === 0) selectRun?.();
    setWholeRunChoice(true);
  };
  const wholeRunButton = (
    <div className="flex items-center gap-1">
      <button type="button" onClick={startWholeRun} title="Replay the whole run in 3D, the camera following the group" className={framingButtonClass}>
        <Route className="h-3 w-3" />
        Whole run
      </button>
      {mini && <ExpandMapButton context={props.context} onExpand={expandRunAvailable ? expandRun : undefined} />}
    </div>
  );
  const content = presentation === "replay-3d" ? (
    <MapPanelHost
      {...props}
      mini={mini}
      wholeRun={selectedCount !== 1}
      onExitWholeRun={selectedCount !== 1 ? exitWholeRun : undefined}
      onUnplayable={selectedCount !== 1 && (wholeRunChoice === null || miniExpand !== null) ? handleUnplayable : undefined}
      fullscreenRoot={expandRoot}
      selectionLoaded={selectionLoaded}
      onImmersiveChange={miniExpand !== null ? handleImmersiveChange : undefined}
    />
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      {props.headerSlot ? createPortal(wholeRunButton, props.headerSlot) : <div className="flex justify-end px-3 pt-2">{wholeRunButton}</div>}
      <div className="relative min-h-0 flex-1">
        <MapOverview2D {...props} mini={mini} />
        {mini && <ExpandMapButton context={props.context} onExpand={expandRunAvailable ? expandRun : undefined} overlay />}
        {/* The mini map's way into the 3D replay: the whole run, playing on its own. */}
        {mini && (
          <button
            type="button"
            onClick={startWholeRun}
            title="Watch the whole run in 3D"
            className="absolute bottom-8 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-black/60 bg-primary/90 px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-[0_4px_16px_rgba(0,0,0,.6)] hover:bg-primary"
          >
            <Play className="h-3.5 w-3.5" />
            Watch the run
          </button>
        )}
      </div>
    </div>
  );
  return (
    <MapTelemetryWarning props={props}>
      <div ref={setExpandRoot} className="h-full min-h-0 [&:fullscreen]:bg-black">
        {content}
      </div>
    </MapTelemetryWarning>
  );
}

/** The Map panel; `mini` makes the Mini Map panel (just the replay, for small spots like the Summary). */
export function createMapPanel({ mini = false }: { mini?: boolean } = {}): PanelDefinition<MapResult, MapProcessorEvent> {
  return {
    ...mapProcessor,
    label: mini ? "Mini Map" : "Map",
    icon: <MapIcon className="h-4 w-4" />,
    keybinds: MAP_CONTROL_KEYBINDS,
    requiredCapabilities: ["unit-position"],
    syncDataMode: "full",
    disableCardFlip: true,
    // Mini or full, the map gets the card's full height; the title row shows from the top edge.
    hoverHeader: () => true,
    supportsFiltering: false,
    underConstruction: true,
    render: (props) => <EncounterFloorProvider><MapContent {...props} forceMini={mini} /></EncounterFloorProvider>,
  };
}
