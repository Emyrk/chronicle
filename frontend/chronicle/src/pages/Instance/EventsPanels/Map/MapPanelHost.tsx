/**
 * The Map panel's desktop host: the mini map (Summary) and the full Map panel,
 * which fill the window or go fullscreen (immersive: the full map), replaying
 * one encounter or the whole run. A clock choice, capabilities and chrome
 * around the ReplayPlayer (see REPLAY_PLAYER.md).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { AppWindow, Clapperboard, Crosshair, Expand, Focus, Footprints, HeartPulse, PenLine, Maximize, Minimize2, Pause, Play, Route, Settings2, Shrink, Skull, Timer, X } from "lucide-react";
import { LivePresenceIndicator } from "../../LivePresenceIndicator";
import { ReplayToggleFlash } from "../../ReplayToggleFlash";
import { ReplayPlayTooltip } from "../../ReplayPlayTooltip";
import { MiniScrubber } from "./MiniScrubber";
import { ExpandMapButton, FullscreenEncounterPicker, FullscreenReplayBar, KeybindTooltip, LeeroyFeaturedUnits, ReloadingChip, WalkHint } from "./MapChrome";
import { BROWSER_FULLSCREEN_KEYS, framingButtonClass, mapFramingButtonClass, WINDOW_FULLSCREEN_KEYS } from "./mapChromeStyles";
import { mapOwnsPortalContainer } from "./mapHostModel";
import { useFullscreenElement } from "./useFullscreenElement";
import { PortalContainerProvider, usePortalContainer } from "@/components/ui/PortalContainerContext";
import type { PanelRenderProps } from "../types";
import type { MapResult } from "./map.processor";
import { MapFloorPicker } from "./MapFloorPicker";
import { FULL_MAP_VIEWPORT } from "./mapModel";
import { UnitInspectContext } from "../UnitInspectContext";
import { InspectCards } from "./InspectCards";
import { HIDE_DEAD_ENEMIES_OPTION } from "../RaidFrames/RaidFrames";
import { TargetFrames } from "./TargetFrames";
import { MeterWindows } from "./MeterWindows";
import { useMeterWindows } from "./meterWindowsState";
import { MapSettingsOverlay } from "./MapSettingsOverlay";
import { ReplayPlayer, ReplayPlayerMessage } from "./ReplayPlayer";
import { canEncodeVideo } from "./videoSupport";
import { encounterJumps, wholeRunUnplayable } from "./wholeRun";
import { PlanControls } from "./plan/PlanControls";
import { ROLE_TOKENS, usePlanEditor, usePlanShortcuts, type PlanRosterEntry } from "./plan/usePlanEditor";
import type { PlanItem } from "./plan/mapPlan";
import { usePlayerSpecializations } from "@/components/ui/PlayerMetricChart/PlayerSpecializationContext";
import { useMapHost } from "./useMapHost";

const VideoRenderDialog = lazy(() => import("./VideoRenderDialog"));

const NO_PLAN_ITEMS: readonly PlanItem[] = [];

export interface MapPanelHostProps extends PanelRenderProps<MapResult> {
  /** Replay the whole run instead of the one selected encounter. */
  wholeRun?: boolean;
  onExitWholeRun?: () => void;
  /** Mini map: just the replay, without frames, settings, walk or plan (the full map's while fullscreen). */
  mini?: boolean;
  /** Called when the whole run cannot play (no positions, no WebGL, mesh failed), to fall back. */
  onUnplayable?: () => void;
  /** What goes fullscreen: an element around the map that outlives it (the 2D overview's swap to 3D); else the map's own root. */
  fullscreenRoot?: HTMLElement | null;
  /** Told whenever the map enters or leaves fullscreen (or window fullscreen). */
  onImmersiveChange?: (immersive: boolean) => void;
  /**
   * The panel has loaded the current selection, as seen by MapContent, which
   * outlives this map (Expand on the 2D mini map mounts it on loaded data).
   */
  selectionLoaded?: boolean;
}

/** The plan's roster: the role tokens, then the run's players with their class colours and spec icons. */
function usePlanRoster(instancePlayers: PanelRenderProps<MapResult>["context"]["instance"]["players"]): PlanRosterEntry[] {
  const specializations = usePlayerSpecializations();
  return useMemo((): PlanRosterEntry[] => {
    const styles = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
    const players = Object.entries(instancePlayers ?? {})
      .map(([guid, player]): PlanRosterEntry => ({
        group: "Players",
        label: player.name,
        guid,
        // Plans store hex colours: the class colour token resolved.
        color: styles?.getPropertyValue(`--color-class-${player.class.toLowerCase()}`).trim().toLowerCase() || "#f5f5f4",
        icon: specializations.get(guid)?.iconUrl ?? `/c/icons/class_${player.class.toLowerCase().replace(/\s+/g, "")}.png`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
    return [...ROLE_TOKENS, ...players];
  }, [instancePlayers, specializations]);
}

export function MapPanelHost({
  wholeRun = false,
  onExitWholeRun,
  mini = false,
  onUnplayable,
  fullscreenRoot,
  onImmersiveChange,
  selectionLoaded = false,
  ...props
}: MapPanelHostProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const attachRoot = useCallback((element: HTMLDivElement | null) => {
    rootRef.current = element;
    setRootElement(element);
  }, []);
  // Desktop fullscreen: the whole map (frames, settings, meters) fills the screen.
  // Immersive modes portal popovers into the map itself. Browser fullscreen hides
  // outside content, while window fullscreen places the map above body portals.
  // Read on mount too: Expand on the 2D mini map goes fullscreen before this map mounts.
  const fullscreenNode = useFullscreenElement();
  const fullscreenTarget = fullscreenRoot ?? rootElement;
  const fullscreen = fullscreenNode !== null && fullscreenNode === fullscreenTarget;
  const inheritedPortalContainer = usePortalContainer();
  // Window fullscreen: the map covers the browser window (the browser's own bar stays).
  const [windowed, setWindowed] = useState(false);
  const immersive = fullscreen || windowed;
  useEffect(() => {
    onImmersiveChange?.(immersive);
  }, [immersive, onImmersiveChange]);
  // The mini map's Expand: browser fullscreen, requested in the click itself
  // (it needs the user gesture); window fullscreen when the browser refuses.
  const expandFullscreen = useCallback(() => {
    const request = fullscreenTarget?.requestFullscreen?.({ navigationUI: "hide" });
    if (!request) {
      setWindowed(true);
      return;
    }
    void request.catch(() => setWindowed(true));
  }, [fullscreenTarget]);
  // From window fullscreen, window fullscreen stays on until the browser's is
  // in, so the map never shows inline (or as the mini map) in between.
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      setWindowed(false);
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void fullscreenTarget?.requestFullscreen?.({ navigationUI: "hide" }).then(() => setWindowed(false), () => undefined);
  }, [fullscreenTarget]);
  const toggleWindowed = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setWindowed((current) => !current);
  }, []);
  useEffect(() => {
    if (!windowed) return;
    // The page scrolls on <html>: hide its scrollbar too, so the map gets the whole window.
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousGutter = root.style.scrollbarGutter;
    const previousOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    root.style.scrollbarGutter = "auto";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousRootOverflow;
      root.style.scrollbarGutter = previousGutter;
      document.body.style.overflow = previousOverflow;
    };
  }, [windowed]);
  // Expanded (fullscreen or window fullscreen), the mini map is the full map.
  const map = useMapHost({ props, kind: mini ? "mini" : "full", wholeRun, immersive, mobileWorldOpen: false });
  const { caps, sync, clock, previewOn, player, syncEnabled, walkWanted, setWalking, walking, canWalk, walkUnavailableTitle, canPlan } = map;
  const { effectSettings, updateEffectSettings, scriptedCameraActive, mapSource, setMapSource, adStrafe, setAdStrafe, walkAvatar, setWalkAvatar } = map;
  const { target, setTarget, pinned, pin, unpin, inspectSelection, showRaidFrames, setShowRaidFrames, showEnemyFrames, setShowEnemyFrames } = map;
  const { raidFrames, raidFramePlayerOption, auras, targetOfTarget, targetsTarget, presenceSurface, replayFromHere } = map;
  const { scene, ready, reloading, show3D, webglUnavailable, meshState, meshOnly, meshWanted, meshUrl, dungeonMesh, onMesh, autoFit, followGuid } = player;
  // Raid planning: drawing on the dungeon floor, a plan per world map.
  const [planOpen, setPlanOpen] = useState(false);
  const planEditor = usePlanEditor((player.live ?? player.held)?.worldMapId ?? 0);
  const closePlan = useCallback(() => setPlanOpen(false), []);
  usePlanShortcuts(planEditor, planOpen, closePlan);
  const planRoster = usePlanRoster(props.context.instance.players);
  const [meterWindows, setMeterWindows] = useMeterWindows();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  // With the pointer over the map (or already immersive): Ctrl/Cmd+Shift+F fills
  // the window, Ctrl/Cmd+Alt+F goes fullscreen; Esc leaves window fullscreen. On
  // document, so they run before the page's own Ctrl+Shift+F and Esc (focus
  // mode) on window; walk mode handles its Esc first.
  useEffect(() => {
    if (!caps.fullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && windowed && !walkWanted && !planOpen && !settingsOpen) {
        event.preventDefault();
        setWindowed(false);
        return;
      }
      if (event.code !== "KeyF" || !(event.ctrlKey || event.metaKey) || event.shiftKey === event.altKey) return;
      const root = rootRef.current;
      if (!root || (!immersive && !root.matches(":hover"))) return;
      event.preventDefault();
      if (event.shiftKey) toggleWindowed();
      else toggleFullscreen();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [caps.fullscreen, immersive, planOpen, settingsOpen, toggleFullscreen, toggleWindowed, walkWanted, windowed]);

  // The whole run falls back when it cannot play; a scene message counts only
  // once the panel has loaded this selection (a fresh panel renders empty first).
  const unplayable = wholeRunUnplayable({
    webglUnavailable,
    meshFailed: dungeonMesh !== null && meshState === "failed",
    sceneMessage: scene.status === "message" ? scene : null,
    settled: selectionLoaded,
  });
  useEffect(() => {
    if (unplayable) onUnplayable?.();
  }, [onUnplayable, unplayable]);

  if (!ready) return <ReplayPlayerMessage player={player} />;

  const { applyFraming, followGroup, canFollow, following, followUnit } = player;
  const jumps = ready.wholeRun && ready.runStartMs !== null && ready.runEndMs !== null
    ? encounterJumps(props.context.instance.encounters, props.result.encounters, ready.runStartMs, ready.runEndMs)
    : [];
  const jumpTo = (timestampMs: number) => {
    player.cameraHandle.cut();
    clock.seek(timestampMs);
  };

  // "Render video": one boss fight on the 3D map, filmed by the drone camera.
  const videoEncounter = !ready.wholeRun && props.context.selectedEncounterIds.length === 1 && ready.bossGuids.size > 0
    ? props.context.instance.encounters.find((candidate) => candidate.id === ready.encounterId) ?? null
    : null;
  const videoBlocker = !canEncodeVideo()
    ? "This browser cannot encode video (no WebCodecs VideoEncoder)"
    : !onMesh || !dungeonMesh ? "Needs the 3D map: turn on the dungeon mesh (WebGL)" : null;
  const videoFileName = videoEncounter
    ? `chronicle-${videoEncounter.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "boss"}-${new Date(ready.encounterStartMs).toISOString().slice(0, 10)}.mp4`
    : "";

  // In the card's title row when the host offers one, so the map gets the height.
  const headerControls = (
    <div className="flex min-w-0 shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
      {!ready.overlayAvailable && <span className="text-amber-300/80">position overlay unavailable</span>}
      <LivePresenceIndicator surface={presenceSurface} />
      {caps.video && videoEncounter && (
        // A span carries the hint: a disabled button shows no title.
        <span title={videoBlocker ?? "Render this boss fight as an MP4 video, in your browser"}>
          <button type="button" onClick={() => setVideoOpen(true)} disabled={videoBlocker !== null} className={framingButtonClass}>
            <Clapperboard className="h-3 w-3" />
            Render video
          </button>
        </span>
      )}
      {onExitWholeRun && (
        <button type="button" onClick={onExitWholeRun} title="Back to the 2D route overview" className={framingButtonClass}>
          <Route className="h-3 w-3" />
          Overview
        </button>
      )}
      {caps.expand && <ExpandMapButton context={props.context} onExpand={expandFullscreen} />}
    </div>
  );

  const floorControls = (ready.floors.length > 1 || ready.floorUncertain) ? (
    <MapFloorPicker compact floors={ready.floors} value={ready.selectedFloorNumber} manualValue={ready.manualFloorNumber} uncertain={ready.floorUncertain} onChange={ready.setFloorNumber} />
  ) : null;
  const framingControls = (
    <div data-map-controls className="absolute bottom-2 left-2 z-40 flex max-w-[calc(100%-1rem)] flex-wrap items-end gap-1">
      {/* Mini map and preview: play/pause and speed lead the row (the preview's own clock, or the page's Replay once it is on). */}
      {(caps.playback || previewOn) && (
        <>
          {/* X drives the page's Replay, not the preview's own clock. */}
          <ReplayPlayTooltip
            playing={ready.playing}
            label={ready.playing ? (previewOn ? "Pause the preview" : "Pause the replay") : (previewOn ? "Play the preview" : "Play the replay")}
            keybind={!previewOn}
          >
            <button
              type="button"
              onClick={() => {
                if (clock.playing) clock.pause();
                else clock.play();
              }}
              aria-label={ready.playing ? (previewOn ? "Pause the preview" : "Pause the replay") : (previewOn ? "Play the preview" : "Play the replay")}
              className={mapFramingButtonClass}
            >
              {ready.playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
          </ReplayPlayTooltip>
          <span className="pointer-events-none rounded-sm bg-black/75 px-1.5 py-1 text-[10px] font-medium text-white/70">{ready.playbackSpeed}×</span>
        </>
      )}
      {canFollow ? (
        <button
          type="button"
          aria-pressed={following}
          onClick={followGroup}
          disabled={ready.wholeRun && !autoFit}
          title="Keep the camera on the boss and the group"
          className={cn(mapFramingButtonClass, following && "border-primary/60 bg-primary/80 text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}
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
          className={mapFramingButtonClass}
        >
          <Focus className="h-3 w-3" />
          Fit
        </button>
      )}
      <button
        type="button"
        onClick={() => applyFraming(FULL_MAP_VIEWPORT)}
        title="Show the full map"
        className={mapFramingButtonClass}
      >
        <Maximize className="h-3 w-3" />
        Reset
      </button>
      {floorControls}
    </div>
  );

  const portalContainer = mapOwnsPortalContainer(fullscreen, windowed, false)
    ? rootElement ?? inheritedPortalContainer
    : inheritedPortalContainer;

  return (
    <PortalContainerProvider container={portalContainer}>
    <div
      ref={attachRoot}
      data-window-fullscreen={windowed ? "" : undefined}
      className={cn(
        "flex h-full min-h-0 flex-col bg-black",
        caps.framed && "p-1",
        windowed && "fixed inset-0 z-[100] h-auto",
      )}
    >
      <ReplayPlayer
        player={player}
        framed={caps.framed}
        header={caps.header && (props.headerSlot ? createPortal(headerControls, props.headerSlot) : <div className="flex justify-end px-1">{headerControls}</div>)}
        view={{
          ...map.view,
          mobileInput: null,
          planItems: planOpen && canPlan ? planEditor.drawnItems : NO_PLAN_ITEMS,
          planSelectedId: planOpen ? planEditor.state.selectedId : null,
          planInput: planOpen && canPlan ? planEditor.input : null,
        }}
        overlay={(
          <>
          {props.context.instance.id === "leeroy" && <LeeroyFeaturedUnits />}
          {videoOpen && videoEncounter && dungeonMesh && (
            <Suspense fallback={null}>
              <VideoRenderDialog
                open
                onOpenChange={setVideoOpen}
                panelProps={props}
                mapSource={mapSource}
                showHiddenUnits={effectSettings.showHiddenUnits}
                dungeonMesh={dungeonMesh}
                unitModelUrls={player.unitModelUrls}
                effectSettings={effectSettings}
                title={videoEncounter.name}
                fileName={videoFileName}
              />
            </Suspense>
          )}
          {caps.framing && framingControls}
          {caps.expand && <ExpandMapButton context={props.context} onExpand={expandFullscreen} overlay />}
          {caps.previewVeil && previewOn && (
            <>
              {/* Replay is off: a greyed preview, with the way to the real Replay controls. */}
              <div className="pointer-events-none absolute inset-0 z-30 bg-slate-900/25 backdrop-saturate-50" aria-hidden />
              {/* Fades while the card's title row shows over it (hoverHeader); Expand is at top right. */}
              <span className="pointer-events-none absolute left-2 top-2 z-40 rounded-sm bg-black/75 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/70 transition-opacity group-has-[[data-hover-header]:hover]/panel:opacity-0">
                Preview
              </span>
              {/* The way out of the preview: centred under the scrubber. */}
              {props.context.onOpenReplay && (
                <button
                  type="button"
                  onClick={() => {
                    replayFromHere();
                    props.context.onOpenReplay?.();
                  }}
                  title="Turn on Replay at this moment and open its controls"
                  className="absolute bottom-10 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-sm border border-black/60 bg-primary/90 px-2.5 py-1 text-[11px] font-medium text-primary-foreground shadow-[0_4px_16px_rgba(0,0,0,.5)] hover:bg-primary"
                >
                  <Timer className="h-3.5 w-3.5" />
                  Replay from here
                </button>
              )}
            </>
          )}
          {caps.scrubber && (
            <MiniScrubber
              raised={previewOn && Boolean(props.context.onOpenReplay)}
              source={{ nowMs: ready.cursorMs, bounds: { startMs: ready.encounterStartMs, endMs: ready.encounterEndMs }, seek: clock.seek }}
            />
          )}
          {/* X toggles the replay: flash play or pause over the map, like a video player. */}
          <ReplayToggleFlash />
          {reloading && <ReloadingChip />}
          {/* Without Replay the map is a still: say so over it rather than in a row of its own. */}
          {caps.hints && !reloading && ready.overlayAvailable && !syncEnabled && !previewOn && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/75 px-2 py-0.5 text-[11px] text-white/70 shadow-[0_4px_16px_rgba(0,0,0,.5)]">
              Final positions · enable Replay to watch units move
            </div>
          )}
          {/* The full map's whole run plays as a preview until Replay takes over. */}
          {caps.hints && !reloading && previewOn && (
            <div className="absolute left-1/2 top-2 z-40 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-sm bg-black/75 py-0.5 pl-2 pr-0.5 text-[11px] text-white/70 shadow-[0_4px_16px_rgba(0,0,0,.5)]">
              {wholeRun ? "Whole-run preview" : "Preview"}
              {sync && (
                <button
                  type="button"
                  onClick={replayFromHere}
                  title="Turn on Replay at this moment"
                  className="flex items-center gap-1 rounded-sm bg-primary/90 px-1.5 py-0.5 font-medium text-primary-foreground hover:bg-primary"
                >
                  <Timer className="h-3 w-3" />
                  Replay from here
                </button>
              )}
            </div>
          )}
          {/* The mini map is just the replay: no frames, settings, walk, plan or meters. */}
          <>
            {/* Top-left: the Raid Frames panel itself, drawn as an overlay (one
                implementation for the map and the panel). The inspect frame below moves freely. */}
            {caps.frames && <UnitInspectContext.Provider value={inspectSelection}>
              <div className="pointer-events-none absolute bottom-2 left-2 top-2 z-30 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1.5">
                {showRaidFrames ? (
                  <div className="group/raid flex max-w-full shrink-0 items-start gap-0.5">
                    <div className="min-w-0 overflow-hidden">{raidFrames(raidFramePlayerOption)}</div>
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
              {/* Top-right, left of the settings button: the same panel's enemy frames. */}
              <div className="pointer-events-none absolute right-11 top-2 z-30 flex max-w-[calc(100%-4rem)] justify-end">
                {showEnemyFrames ? (
                  <div className="group/enemy flex max-w-full items-start gap-0.5">
                    <button
                      type="button"
                      onClick={() => setShowEnemyFrames(false)}
                      title="Hide enemy frames"
                      aria-label="Hide enemy frames"
                      className="pointer-events-auto grid h-4 w-4 shrink-0 place-items-center rounded-sm bg-black/75 text-white/60 opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 group-hover/enemy:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="min-w-0 overflow-hidden">{raidFrames(`enemies,${HIDE_DEAD_ENEMIES_OPTION}`)}</div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowEnemyFrames(true)}
                    title="Show enemy frames"
                    aria-label="Show enemy frames"
                    className="pointer-events-auto grid h-7 w-7 place-items-center rounded-sm border border-black/80 bg-black/75 text-red-300/80 shadow-[0_4px_16px_rgba(0,0,0,.5)] hover:bg-black/90 hover:text-red-200"
                  >
                    <Skull className="h-4 w-4" />
                  </button>
                )}
              </div>
            </UnitInspectContext.Provider>}
            {caps.settings && <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Map settings"
              aria-label="Map settings"
              className="absolute right-2 top-2 z-40 grid h-7 w-7 place-items-center rounded-sm border border-black/80 bg-black/75 text-white/70 shadow-[0_4px_16px_rgba(0,0,0,.5)] hover:bg-black/90 hover:text-white"
            >
              <Settings2 className="h-4 w-4" />
            </button>}
            {caps.walk && show3D && (
              <button
                type="button"
                onClick={() => setWalking(!walking)}
                disabled={!canWalk}
                aria-pressed={walking}
                title={canWalk
                  ? walking ? "Leave walk mode (G or Esc)" : "Walk mode (G): join the fight with a character of your own"
                  : walkUnavailableTitle}
                aria-label="Walk mode"
                className={cn(
                  "absolute right-2 top-10 z-40 grid h-7 w-7 place-items-center rounded-sm border border-black/80 shadow-[0_4px_16px_rgba(0,0,0,.5)] disabled:opacity-40",
                  walking ? "bg-amber-400/90 text-black hover:bg-amber-300" : "bg-black/75 text-white/70 enabled:hover:bg-black/90 enabled:hover:text-white",
                )}
              >
                <Footprints className="h-4 w-4" />
              </button>
            )}
            {caps.plan && show3D && (
              <button
                type="button"
                onClick={() => {
                  if (!planOpen) setWalking(false);
                  setPlanOpen(!planOpen);
                }}
                disabled={!canPlan}
                aria-pressed={planOpen}
                title={canPlan ? planOpen ? "Close planning" : "Plan: draw markers, arrows, ranges and player spots on the floor" : "Planning needs the 3D map (Map settings → World → 3D map)"}
                aria-label="Plan"
                className={cn(
                  "absolute right-2 top-[4.5rem] z-40 grid h-7 w-7 place-items-center rounded-sm border border-black/80 shadow-[0_4px_16px_rgba(0,0,0,.5)] disabled:opacity-40",
                  planOpen ? "bg-amber-400/90 text-black hover:bg-amber-300" : "bg-black/75 text-white/70 enabled:hover:bg-black/90 enabled:hover:text-white",
                )}
              >
                <PenLine className="h-4 w-4" />
              </button>
            )}
            {caps.plan && planOpen && canPlan && (
              <PlanControls editor={planEditor} roster={planRoster} onClose={closePlan} />
            )}
            {caps.hints && (walking || show3D) && (
              <div className={cn(
                "pointer-events-none absolute left-1/2 z-30 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-sm bg-black/75 px-2.5 py-1.5 text-[11px] text-white/80 shadow-[0_4px_16px_rgba(0,0,0,.5)]",
                // Above the camera/floor controls, or the fullscreen Replay bar.
                immersive ? "bottom-24" : "bottom-12",
                // The camera keys work with the pointer over the map: their hint shows then.
                !walking && "opacity-0 transition-opacity group-hover/map:opacity-100",
              )}>
                {walking ? (
                  <>
                    <span className="font-semibold text-amber-300">Walking</span>
                    <WalkHint keys={["W", "S"]}>move</WalkHint>
                    <WalkHint keys={["A", "D"]}>{adStrafe ? "strafe" : "turn (strafe while right-dragging)"}</WalkHint>
                    <WalkHint keys={["Q", "E"]}>rewind / fast forward</WalkHint>
                    <WalkHint keys={["X"]}>play / pause replay</WalkHint>
                    <WalkHint keys={["Space"]}>jump (hold to fly)</WalkHint>
                    <WalkHint keys={["Z"]}>down</WalkHint>
                    <span>drag to look · wheel zoom</span>
                    <WalkHint keys={["G", "Esc"]}>leave</WalkHint>
                  </>
                ) : (
                  <>
                    <WalkHint keys={["W", "S"]}>move</WalkHint>
                    <WalkHint keys={["A", "D"]}>{adStrafe ? "strafe" : "turn"}</WalkHint>
                    <WalkHint keys={["Space", "Z"]}>up / down</WalkHint>
                    <WalkHint keys={["Shift"]}>faster</WalkHint>
                    <span>drag to look · middle-drag pan · wheel zoom</span>
                    <WalkHint keys={["Q", "E"]}>rewind / fast forward</WalkHint>
                    <WalkHint keys={["X"]}>play / pause replay</WalkHint>
                    <WalkHint keys={["G"]}>walk</WalkHint>
                    {windowed
                      ? <WalkHint keys={["Esc"]}>exit window fullscreen</WalkHint>
                      : !fullscreen && <WalkHint keys={WINDOW_FULLSCREEN_KEYS}>fill window</WalkHint>}
                    {!windowed && !fullscreen && <WalkHint keys={BROWSER_FULLSCREEN_KEYS}>fullscreen</WalkHint>}
                  </>
                )}
              </div>
            )}
            {caps.settings && settingsOpen && (
              <MapSettingsOverlay
                onClose={() => setSettingsOpen(false)}
                effectSettings={effectSettings}
                onEffectSettings={updateEffectSettings}
                show3D={show3D}
                hasEffects={Boolean(ready.effects)}
                mesh={show3D && meshUrl ? { on: meshWanted, locked: meshOnly || scriptedCameraActive, loading: Boolean(dungeonMesh) && meshState === "loading", onToggle: map.toggleMesh } : null}
                map2D={ready.mapSources.length > 1 && ready.mapSource ? {
                  value: ready.mapSource,
                  options: ready.mapSources,
                  changed: mapSource !== "auto",
                  onChange: setMapSource,
                  onReset: () => setMapSource("auto"),
                } : null}
                floors={ready.floors.length > 1 ? { list: ready.floors, value: ready.selectedFloorNumber, manualValue: ready.manualFloorNumber, uncertain: ready.floorUncertain, onChange: ready.setFloorNumber } : null}
                onTopDown={player.cameraHandle.topDown}
                adStrafe={adStrafe}
                onAdStrafe={setAdStrafe}
                walkAvatar={walkAvatar}
                onWalkAvatar={setWalkAvatar}
                onResetAll={map.resetAllSettings}
              />
            )}
            {caps.frames && <TargetFrames
              target={target}
              targetOfTarget={targetOfTarget}
              targetsTarget={targetsTarget}
              raidFrames={raidFrames}
              auras={auras}
              onPin={pin}
              onClear={() => setTarget(null)}
              followGuid={followGuid}
              onFollow={onMesh ? followUnit : undefined}
            />}
            {/* Below Settings, Walk and Plan (the last two only with the 3D view): fill the window, then true fullscreen. */}
            {caps.fullscreen && <KeybindTooltip
              label={windowed ? "Exit window fullscreen" : "Fill the browser window"}
              keys={windowed ? [WINDOW_FULLSCREEN_KEYS, ["Esc"]] : [WINDOW_FULLSCREEN_KEYS]}
            >
              <button
                type="button"
                onClick={toggleWindowed}
                aria-pressed={windowed}
                aria-label={windowed ? "Exit window fullscreen" : "Fill the browser window"}
                className={cn(
                  "absolute right-2 z-40 grid h-7 w-7 place-items-center rounded-sm border border-black/80 shadow-[0_4px_16px_rgba(0,0,0,.5)]",
                  windowed ? "bg-amber-400/90 text-black hover:bg-amber-300" : "bg-black/75 text-white/70 hover:bg-black/90 hover:text-white",
                  show3D ? "top-[6.5rem]" : "top-10",
                )}
              >
                {windowed ? <Minimize2 className="h-4 w-4" /> : <AppWindow className="h-4 w-4" />}
              </button>
            </KeybindTooltip>}
            {caps.fullscreen && typeof document !== "undefined" && document.fullscreenEnabled && (
              <KeybindTooltip
                label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                keys={fullscreen ? [BROWSER_FULLSCREEN_KEYS, ["Esc"]] : [BROWSER_FULLSCREEN_KEYS]}
              >
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-pressed={fullscreen}
                  aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  className={cn(
                    "absolute right-2 z-40 grid h-7 w-7 place-items-center rounded-sm border border-black/80 shadow-[0_4px_16px_rgba(0,0,0,.5)]",
                    fullscreen ? "bg-amber-400/90 text-black hover:bg-amber-300" : "bg-black/75 text-white/70 hover:bg-black/90 hover:text-white",
                    show3D ? "top-[8.5rem]" : "top-[4.5rem]",
                  )}
                >
                  {fullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                </button>
              </KeybindTooltip>
            )}
            {caps.immersiveChrome && props.context.onSelectEncounters && (
              <FullscreenEncounterPicker
                encounters={props.context.instance.encounters}
                selectedIds={props.context.selectedEncounterIds}
                onSelect={props.context.onSelectEncounters}
              />
            )}
            {caps.frames && <InspectCards guids={pinned} onRemove={unpin} raidFrames={raidFrames} auras={auras} />}
            {caps.meters && <MeterWindows windows={meterWindows} onChange={setMeterWindows} context={props.context} durationMs={props.durationMs} />}
            {/* Fullscreen hides the page's Replay controls: the same transport bar over the map. */}
            {caps.immersiveChrome && <FullscreenReplayBar onEnable={previewOn ? replayFromHere : undefined} />}
          </>
          </>
        )}
        transport={(
          <>
          {caps.jumps && jumps.length > 0 && ready.runStartMs !== null && (
            <div className="flex flex-col gap-1 px-3 py-2">
              <div className="relative h-1.5 rounded bg-white/10" aria-hidden>
                {jumps.map((jump) => (
                  <span key={jump.id} className="absolute top-0 h-full w-0.5 bg-amber-300/80" style={{ left: `${jump.fraction * 100}%` }} />
                ))}
                {(syncEnabled || previewOn) && ready.runEndMs !== null && (
                  <span
                    className="absolute top-[-1px] h-2 w-0.5 bg-foreground"
                    style={{ left: `${Math.min(100, Math.max(0, ((ready.cursorMs - ready.runStartMs) / Math.max(1, ready.runEndMs - ready.runStartMs)) * 100))}%` }}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-1" aria-label="Encounters">
                {jumps.map((jump) => (
                  <button
                    key={jump.id}
                    type="button"
                    onClick={() => jumpTo(jump.timestampMs)}
                    disabled={!syncEnabled && !previewOn}
                    title={syncEnabled || previewOn ? `Jump to ${jump.name}` : "Enable Replay to jump between encounters"}
                    className={framingButtonClass}
                  >
                    {jump.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {caps.notes && webglUnavailable && (
            <p className="px-3 py-1 text-[9px] text-amber-300/80">3D view needs WebGL, which this browser could not provide. Showing the replay map in 2D instead.</p>
          )}
          {caps.notes && !ready.overlayAvailable && (
            <p className="px-3 py-1 text-[9px] text-amber-300/80">No compatible world-coordinate mapping is available for this floor, so unit markers are hidden.</p>
          )}
          </>
        )}
      />
    </div>
    </PortalContainerProvider>
  );
}
