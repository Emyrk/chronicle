/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated view components intentionally share this module. */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { AlertTriangle, AppWindow, Crosshair, Expand, Focus, Footprints, Gamepad2, HeartPulse, Loader2, PenLine, Map as MapIcon, Maximize, Maximize2, Minimize2, Pause, Play, Route, Settings2, Shrink, Skull, Timer, X } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { parseLivePresenceSurface } from "../../liveSessionProtocol";
import { LivePresenceIndicator } from "../../LivePresenceIndicator";
import { useLiveSessionOptional } from "../../LiveSessionContext";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { ReplayToggleFlash } from "../../ReplayToggleFlash";
import { useReplayStepKeys } from "../../replayStepKey";
import { ReplayPlayTooltip } from "../../ReplayPlayTooltip";
import { ReplayTransportBar, usePlayerDeathTimes } from "../../ReplayControlOverlay";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { PortalContainerProvider, usePortalContainer } from "@/components/ui/PortalContainerContext";
import type { Encounter } from "../../InstancePage";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { fetchMiniatureUrls } from "./bossMinis";
import { dungeonMeshBytes, dungeonMeshLiquid, dungeonMeshUrl } from "./dungeonMeshes";
import { mapProcessor, type MapProcessorEvent, type MapResult } from "./map.processor";
import type { MapLivePresence } from "./MapView3D";
import { MapFloorPicker } from "./MapFloorPicker";
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
import type { DungeonMeshRequest, DungeonMeshState, MapSceneFocus, MapUnitRoles } from "./MapScene3D";
import { MapView2D, type MapViewRequest } from "./MapView2D";
import { useEmbeddedPanel, useEmbeddedPanelWithResult } from "../useEmbeddedPanel";
import { UnitInspectContext, type UnitInspectSelection } from "../UnitInspectContext";
import { InspectCards } from "./InspectCards";
import { createRaidFramesPanel, HIDE_DEAD_ENEMIES_OPTION, selectRaidFramesEncounter } from "../RaidFrames/RaidFrames";
import { lastTargetAt } from "../RaidFrames/raidFrames.processor";
import { createUnitAurasPanel } from "../UnitAuras/UnitAuras";
import { TargetFrames } from "./TargetFrames";
import { DEFAULT_AD_STRAFE, IDLE_MOBILE_MAP_INPUT, MAP_CONTROL_KEYBINDS, type MobileMapInput } from "./mapControls";
import { MobileMapControls } from "./MobileMapControls";
import { MeterWindows } from "./MeterWindows";
import { useMeterWindows } from "./meterWindowsState";
import {
  dismissMapTelemetryWarning,
  hasLimitedHostilePositionTelemetry,
  isMapTelemetryWarningDismissed,
  MAP_TELEMETRY_WARNING_STORAGE_KEY,
} from "./mapTelemetryWarning";
import { MapSettingsOverlay } from "./MapSettingsOverlay";
import { DEFAULT_EFFECT_SETTINGS, useEffectSettings } from "./mapViewSettings";
import { DEFAULT_WALK_AVATAR, readStoredWalkAvatar, storeWalkAvatar } from "./walkAvatars";
import { useMapScene } from "./useMapScene";
import { encounterJumps, mapPresentationForSelection } from "./wholeRun";
import { PlanControls } from "./plan/PlanControls";
import { ROLE_TOKENS, usePlanEditor, usePlanShortcuts, type PlanRosterEntry } from "./plan/usePlanEditor";
import type { PlanItem } from "./plan/mapPlan";
import { usePlayerSpecializations } from "@/components/ui/PlayerMetricChart/PlayerSpecializationContext";

export { mapPresentationForSelection };

const MapView3D = lazy(() => import("./MapView3D"));

const NO_PLAN_ITEMS: readonly PlanItem[] = [];
const RAID_FRAMES_PANEL = createRaidFramesPanel();
const UNIT_AURAS_PANEL = createUnitAurasPanel();

const MESH_STORAGE_KEY = "chronicle.map.mesh";

/** How often the mini map's preview clock ticks; the 3D view extrapolates between ticks. */
const PREVIEW_TICK_MS = 250;

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
const ENEMY_FRAMES_STORAGE_KEY = "chronicle.map.enemyFrames";

// A/D strafe is optional; the default keeps A/D turning.
const AD_STRAFE_STORAGE_KEY = "chronicle.map.adStrafe";

function readStoredAdStrafe(): boolean {
  try {
    const stored = localStorage.getItem(AD_STRAFE_STORAGE_KEY);
    return stored === null ? DEFAULT_AD_STRAFE : stored === "strafe";
  } catch {
    return DEFAULT_AD_STRAFE;
  }
}

function storeAdStrafe(on: boolean) {
  try {
    localStorage.setItem(AD_STRAFE_STORAGE_KEY, on ? "strafe" : "turn");
  } catch {
    // Storage may be unavailable; the choice still applies for this session.
  }
}

function readStoredShown(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "hidden";
  } catch {
    return true;
  }
}

function storeShown(key: string, shown: boolean) {
  try {
    localStorage.setItem(key, shown ? "shown" : "hidden");
  } catch {
    // Storage may be unavailable; the choice still applies for this session.
  }
}

// null forgets the choice, so the default (preferredMeshState) applies again.
function storeMesh(on: boolean | null) {
  try {
    if (on === null) localStorage.removeItem(MESH_STORAGE_KEY);
    else localStorage.setItem(MESH_STORAGE_KEY, String(on));
  } catch {
    // Storage may be unavailable (private mode); the toggle still works for this session.
  }
}

const mapFramingButtonClass = "pointer-events-auto flex items-center gap-1 rounded-sm border border-black/80 bg-black/75 px-2 py-1 text-[10px] font-medium text-white/75 shadow-[0_4px_16px_rgba(0,0,0,.5)] hover:bg-black/90 hover:text-white disabled:opacity-40 disabled:hover:text-white/75";
const framingButtonClass = "flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground";

/** The Map panel option that made it a mini map before the Mini Map panel; still honoured for saved layouts and links. */
const MINI_MAP_PANEL_OPTION = "mini";

/** The panel option asks for the mini map: the replay without overlays, for small panels. */
export function isMiniMapOption(option: string | null | undefined): boolean {
  return (option ?? "").split(",").includes(MINI_MAP_PANEL_OPTION);
}

/**
 * Opens the full Map layout from a mini map, when the page can switch layouts.
 * `overlay`: drawn on the map's top-right corner, always there; it fades while
 * the card's title row (which has its own Expand) shows over it.
 */
function ExpandMapButton({ context, overlay = false }: { context: PanelRenderProps<MapResult>["context"]; overlay?: boolean }) {
  if (!context.onApplyPreset) return null;
  return (
    <button
      type="button"
      onClick={() => context.onApplyPreset?.("map")}
      title="Open the full map"
      className={overlay
        ? cn(mapFramingButtonClass, "absolute right-2 top-2 z-40 transition-opacity group-has-[[data-hover-header]:hover]/panel:pointer-events-none group-has-[[data-hover-header]:hover]/panel:opacity-0")
        : framingButtonClass}
    >
      <Maximize2 className="h-3 w-3" />
      Expand
    </button>
  );
}

/**
 * The mini map's seek bar, floating centred just above the corner controls: a
 * thin line that thickens on hover; click or drag to seek. `raised` lifts it
 * over the "Replay from here" button while the preview shows.
 * `fraction` is how far through the fight it is.
 */
function MiniScrubber({ fraction, onSeek, raised = false }: { fraction: number; onSeek: (fraction: number) => void; raised?: boolean }) {
  const percent = Math.min(100, Math.max(0, fraction * 100));
  const seekAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width))));
  };
  return (
    <div
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className={cn("group/scrub absolute left-1/2 z-40 h-3 w-1/2 -translate-x-1/2 cursor-pointer touch-none", raised ? "bottom-[4.25rem]" : "bottom-10")}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        seekAt(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) seekAt(event);
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-black/60 shadow-[0_0_0_1px_rgba(255,255,255,.12)] transition-[height] group-hover/scrub:h-1.5">
        <div className="h-full bg-primary/90" style={{ width: `${percent}%` }} />
      </div>
      <div
        className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow-[0_0_0_2px_rgba(0,0,0,.6)] transition-opacity group-hover/scrub:opacity-100"
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}

/** A key drawn as a keycap. */
function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-white/25 border-b-2 border-b-white/40 bg-gradient-to-b from-white/20 to-white/5 px-1 font-mono text-[10px] font-semibold leading-none text-white shadow-[0_1px_0_rgba(0,0,0,.6)]">
      {children}
    </kbd>
  );
}

const WINDOW_FULLSCREEN_KEYS = ["Ctrl", "Shift", "F"];
const BROWSER_FULLSCREEN_KEYS = ["Ctrl", "Alt", "F"];

/** A map button's hover hint: what it does, then its key combinations (alternatives split by "or"). */
function KeybindTooltip({ label, keys, children }: { label: string; keys: string[][]; children: ReactElement }) {
  return (
    <HintTooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="left" className="flex items-center gap-1.5">
        {label}
        {keys.map((combo, index) => (
          <span key={combo.join("+")} className="flex items-center gap-0.5">
            {index > 0 && <span className="mr-1 text-zinc-400">or</span>}
            {combo.map((key) => <Keycap key={key}>{key}</Keycap>)}
          </span>
        ))}
      </TooltipContent>
    </HintTooltip>
  );
}

/** One walk-mode control: its keycaps, then what they do. */
function WalkHint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {keys.map((key) => <Keycap key={key}>{key}</Keycap>)}
      <span>{children}</span>
    </span>
  );
}

/** Fullscreen's Replay controls; its own component so death times load only while fullscreen. */
function FullscreenReplayBar() {
  const deaths = usePlayerDeathTimes();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-4">
      <ReplayTransportBar
        deaths={deaths}
        className="pointer-events-auto h-auto w-full max-w-4xl rounded-md border border-white/15 bg-black/70 shadow-[0_8px_32px_rgba(0,0,0,.6)] backdrop-blur-sm"
      />
    </div>
  );
}

/** Fullscreen, middle left: the run's boss encounters, one click to replay another. */
function FullscreenEncounterPicker({ encounters, selectedIds, onSelect }: {
  encounters: Encounter[];
  selectedIds: string[];
  onSelect: (encounterIds: string[]) => void;
}) {
  const bosses = encounters.filter((encounter) => encounter.boss);
  if (bosses.length === 0) return null;
  return (
    <nav
      aria-label="Encounters"
      className="styled-scrollbar absolute left-2 top-1/2 z-40 flex max-h-[60%] w-44 -translate-y-1/2 flex-col gap-0.5 overflow-y-auto rounded-sm border border-black/80 bg-black/75 p-1 shadow-[0_4px_16px_rgba(0,0,0,.5)]"
    >
      {bosses.map((encounter) => {
        const selected = selectedIds.length === 1 && selectedIds[0] === encounter.id;
        const failed = encounter.kill_type === "wipe" || encounter.kill_type === "reset";
        return (
          <button
            key={encounter.id}
            type="button"
            onClick={() => onSelect([encounter.id])}
            aria-pressed={selected}
            title={failed ? `${encounter.name} (${encounter.kill_type})` : encounter.name}
            className={cn(
              "truncate rounded-sm px-2 py-1 text-left text-[11px]",
              selected ? "bg-primary/80 text-primary-foreground" : "text-white/75 hover:bg-white/10 hover:text-white",
              failed && !selected && "text-white/40",
            )}
          >
            {encounter.name}
            {failed && <span className="ml-1 text-[9px] uppercase">{encounter.kill_type}</span>}
          </button>
        );
      })}
    </nav>
  );
}

interface ReplayMapProps extends PanelRenderProps<MapResult> {
  /** Replay the whole run instead of the one selected encounter. */
  wholeRun?: boolean;
  onExitWholeRun?: () => void;
  /** Mini map: just the replay, without frames, settings, walk or plan. */
  mini?: boolean;
  /** Mobile Map panel: inert 2D preview that opens the 3D world fullscreen. */
  mobile?: boolean;
}

function SingleEncounterReplayMap({ wholeRun = false, onExitWholeRun, mini = false, mobile = false, ...props }: ReplayMapProps) {
  const sync = useSyncModeContextOptional();
  useReplayStepKeys((deltaMs) => {
    if (!sync || sync.externalDriver !== "none" || sync.readOnly || !sync.encounterBounds) return false;
    const startMs = sync.encounterBounds.start.getTime();
    const endMs = sync.encounterBounds.end.getTime();
    const baseMs = sync.currentTimestamp?.getTime() ?? (deltaMs < 0 ? endMs : startMs);
    sync.enable();
    sync.setTimestamp(new Date(Math.min(endMs, Math.max(startMs, baseMs + deltaMs))));
    return true;
  });
  // Walk mode ("join the fight"): your own character on the dungeon mesh.
  const [walkWanted, setWalking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [mobileWorldOpen, setMobileWorldOpen] = useState(false);
  const [mobileInput, setMobileInput] = useState<MobileMapInput>(IDLE_MOBILE_MAP_INPUT);
  const closeMobileWorld = useCallback(() => {
    setMobileInput(IDLE_MOBILE_MAP_INPUT);
    setWalking(false);
    setMobileWorldOpen(false);
    const orientation = screen.orientation as (ScreenOrientation & { unlock?: () => void }) | undefined;
    orientation?.unlock?.();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);
  const openMobileWorld = useCallback(() => {
    setMobileWorldOpen(true);
    const target = rootRef.current;
    const request = target?.requestFullscreen?.();
    if (!request) return;
    void request.then(() => {
      const orientation = screen.orientation as (ScreenOrientation & { lock?: (orientation: "landscape") => Promise<void> }) | undefined;
      return orientation?.lock?.("landscape");
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!mobileWorldOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setMobileInput(IDLE_MOBILE_MAP_INPUT);
        setWalking(false);
        setMobileWorldOpen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [mobileWorldOpen]);
  // Desktop fullscreen: the whole map (frames, settings, meters) fills the screen.
  // The map's own element while it is the browser's fullscreen element: popovers
  // portal into it then, since the browser shows nothing outside it.
  const [fullscreenElement, setFullscreenElement] = useState<HTMLElement | null>(null);
  const fullscreen = fullscreenElement !== null;
  const inheritedPortalContainer = usePortalContainer();
  useEffect(() => {
    const handleFullscreenChange = () => setFullscreenElement(
      document.fullscreenElement !== null && document.fullscreenElement === rootRef.current ? rootRef.current : null,
    );
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);
  // Window fullscreen: the map covers the browser window (the browser's own bar stays).
  const [windowed, setWindowed] = useState(false);
  const immersive = fullscreen || windowed;
  const toggleFullscreen = useCallback(() => {
    setWindowed(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void rootRef.current?.requestFullscreen?.({ navigationUI: "hide" }).catch(() => undefined);
  }, []);
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
  // Mini map preview: with the page's Replay off, the mini plays the fight on a
  // loop by its own clock, so the Summary shows what the map does.
  const previewOn = (mini || mobile) && !sync?.enabled;
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const [previewElapsedMs, setPreviewElapsedMs] = useState(0);
  useEffect(() => {
    if (!previewOn || !previewPlaying) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      setPreviewElapsedMs((elapsed) => elapsed + (now - last));
      last = now;
    }, PREVIEW_TICK_MS);
    return () => window.clearInterval(timer);
  }, [previewOn, previewPlaying]);
  const preview = useMemo(
    () => previewOn ? {
      elapsedMs: previewElapsedMs,
      playing: previewPlaying,
      // A whole raid compressed into the normal 90-second preview can hit 32×,
      // making players and map changes unreadably jumpy on a phone.
      maxSpeed: mobile && wholeRun ? 4 : undefined,
    } : null,
    [mobile, previewElapsedMs, previewOn, previewPlaying, wholeRun],
  );
  const scene = useMapScene(props, {
    rawDungeonProjection: show3D && meshOn && meshState === "ready",
    preferRenderedCanvas: !show3D || !meshOn || (mobile && !mobileWorldOpen),
    wholeRun,
    preview,
  });
  // A new encounter starts its preview from the beginning.
  const [previewEncounterId, setPreviewEncounterId] = useState<string | null>(null);
  if (scene.status === "ready" && scene.encounterId !== previewEncounterId) {
    setPreviewEncounterId(scene.encounterId);
    setPreviewElapsedMs(0);
  }
  // While the panel reprocesses (a new encounter, a filter change) the scene
  // reports "loading": keep the last ready one on screen, the 3D view frozen
  // on it, rather than unmounting the view and rebuilding it (renderer, mesh
  // parse, collision tree) once the new data arrives. Re-held only when what
  // it shows changes (the frozen view ignores the held copy's per-tick data).
  const liveScene = scene.status === "ready" ? scene : null;
  const [heldScene, setHeldScene] = useState<typeof liveScene>(null);
  if (liveScene && (!heldScene || heldScene.encounterId !== liveScene.encounterId || heldScene.mapName !== liveScene.mapName
    || heldScene.selectedFloorNumber !== liveScene.selectedFloorNumber || heldScene.mesh !== liveScene.mesh)) {
    setHeldScene(liveScene);
  }
  const reloading = !liveScene && (props.loading || props.processing) && heldScene !== null;
  const ready = liveScene ?? (reloading ? heldScene : null);
  // Raid planning: drawing on the dungeon floor, a plan per world map.
  const [planOpen, setPlanOpen] = useState(false);
  const planEditor = usePlanEditor((liveScene ?? heldScene)?.worldMapId ?? 0);
  const closePlan = useCallback(() => setPlanOpen(false), []);
  usePlanShortcuts(planEditor, planOpen, closePlan);
  const specializations = usePlayerSpecializations();
  const instancePlayers = props.context.instance.players;
  const planRoster = useMemo((): PlanRosterEntry[] => {
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
  // A mesh-only instance (no map artwork) has nothing but the mesh to show:
  // the switch is on and stays on.
  const meshOnly = ready?.meshOnly ?? false;
  const meshWanted = show3D && (meshOn || meshOnly);
  const iconBaseUrl = props.context.instance.iconBaseUrl;
  // The manifest's mesh entry (one object per cached manifest, not rebuilt
  // per render) keys the request: a changed entry re-requests the mesh.
  const mesh = ready?.mesh ?? null;
  const meshUrl = mesh && iconBaseUrl ? dungeonMeshUrl(mesh, iconBaseUrl) : null;
  // Start the mesh's (large) download as soon as the map knows it: before the
  // encounter finishes processing and before the 3D renderer has loaded.
  const prefetchMesh = mesh ?? (scene.status === "message" ? scene.meshHint ?? null : null);
  const prefetchUrl = show3D && (meshOn || meshOnly) && prefetchMesh && iconBaseUrl ? dungeonMeshUrl(prefetchMesh, iconBaseUrl) : null;
  useEffect(() => {
    if (prefetchUrl) dungeonMeshBytes(prefetchUrl).catch(() => {});
  }, [prefetchUrl]);
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
  const [showRaidFrames, setShowRaidFramesState] = useState(() => readStoredShown(RAID_FRAMES_STORAGE_KEY));
  const setShowRaidFrames = (shown: boolean) => {
    setShowRaidFramesState(shown);
    storeShown(RAID_FRAMES_STORAGE_KEY, shown);
  };
  const [showEnemyFrames, setShowEnemyFramesState] = useState(() => readStoredShown(ENEMY_FRAMES_STORAGE_KEY));
  const setShowEnemyFrames = (shown: boolean) => {
    setShowEnemyFramesState(shown);
    storeShown(ENEMY_FRAMES_STORAGE_KEY, shown);
  };
  const [meterWindows, setMeterWindows] = useMeterWindows();
  // Display settings and the settings overlay that sets them (all kept in local storage).
  const [effectSettings, updateEffectSettings] = useEffectSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [topDownKey, setTopDownKey] = useState(0);
  const [followGuid, setFollowGuid] = useState<string | null>(null);
  const [adStrafe, setAdStrafeState] = useState(readStoredAdStrafe);
  const [walkAvatar, setWalkAvatarState] = useState(readStoredWalkAvatar);
  const presenceSurface = parseLivePresenceSurface(`panel:${props.panelId ?? "map"}`) ?? "map";
  // Live session: everyone sees each other's camera, or character while walking.
  const liveSession = useLiveSessionOptional();
  const liveOn = liveSession?.status === "live";
  const publishPresence = liveSession?.publishMapPresence;
  const subscribePresence = liveSession?.subscribeMapPresence;
  const livePresence = useMemo((): MapLivePresence | null =>
    liveOn && publishPresence && subscribePresence ? { publish: publishPresence, subscribe: subscribePresence } : null,
  [liveOn, publishPresence, subscribePresence]);
  const setAdStrafe = (on: boolean) => {
    setAdStrafeState(on);
    storeAdStrafe(on);
  };
  const setWalkAvatar = (id: string) => {
    setWalkAvatarState(id);
    storeWalkAvatar(id);
  };
  // Map settings → Reset all: every setting to its default, and the frames back.
  const resetAllSettings = () => {
    updateEffectSettings(DEFAULT_EFFECT_SETTINGS);
    setAdStrafe(DEFAULT_AD_STRAFE);
    setWalkAvatar(DEFAULT_WALK_AVATAR);
    setShowRaidFrames(true);
    setShowEnemyFrames(true);
    setStoredMesh(null);
    storeMesh(null);
  };
  // WoW-style targeting: clicking a unit (on the map or a raid frame) makes it
  // the target, shown at centre left with its own target at centre right.
  // Pinning a frame keeps it as a movable inspect box.
  const [target, setTarget] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const pin = useCallback((guid: string) => {
    setPinned((current) => current.includes(guid) ? current : [...current, guid]);
    setTarget((current) => current === guid ? null : current);
  }, []);
  const unpin = useCallback((guid: string) => setPinned((current) => current.filter((other) => other !== guid)), []);
  const inspectSelection = useMemo((): UnitInspectSelection => ({
    inspected: new Set(target ? [...pinned, target] : pinned),
    select: setTarget,
  }), [pinned, target]);
  const framesWanted = pinned.length > 0 || target !== null;
  // One Raid Frames run draws the grid, the target frames and the inspect boxes
  // (and says who the target is targeting); one Unit Auras run their auras.
  const { render: raidFrames, result: raidFramesResult } = useEmbeddedPanelWithResult({
    panel: RAID_FRAMES_PANEL,
    context: props.context,
    durationMs: props.durationMs,
    enabled: !mini && !mobile && (showRaidFrames || showEnemyFrames || framesWanted),
  });
  const auras = useEmbeddedPanel({ panel: UNIT_AURAS_PANEL, context: props.context, durationMs: props.durationMs, enabled: !mini && !mobile && framesWanted });
  const cursorMs = sync?.enabled && sync.currentTimestamp ? sync.currentTimestamp.getTime() : null;
  const targetEncounter = target && raidFramesResult
    ? selectRaidFramesEncounter(raidFramesResult.encounters, props.context.selectedEncounterIds, cursorMs)
    : null;
  // Who the selected unit is targeting, and who that one is (WoW's target's target).
  const targetAtMs = targetEncounter ? cursorMs ?? targetEncounter.endMs : 0;
  const targetOfTarget = target && targetEncounter ? lastTargetAt(targetEncounter, target, targetAtMs) : null;
  const targetsTarget = targetOfTarget && targetEncounter ? lastTargetAt(targetEncounter, targetOfTarget, targetAtMs) : null;
  const unitRoles = useMemo((): MapUnitRoles => ({ selected: target, target: targetOfTarget, targetsTarget, pinned: new Set(pinned) }), [pinned, target, targetOfTarget, targetsTarget]);
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

  // With the pointer over the map (or already immersive): Ctrl/Cmd+Shift+F fills
  // the window, Ctrl/Cmd+Alt+F goes fullscreen; Esc leaves window fullscreen. On
  // document, so they run before the page's own Ctrl+Shift+F and Esc (focus
  // mode) on window; walk mode handles its Esc first.
  useEffect(() => {
    if (mini || mobile) return;
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
  }, [immersive, mini, mobile, planOpen, settingsOpen, toggleFullscreen, toggleWindowed, walkWanted, windowed]);

  if (!ready) return scene.status === "message" ? (
    <MapMessage title={scene.title} detail={scene.detail}>
      {scene.floors && scene.setFloorNumber && (
        <MapFloorPicker floors={scene.floors} value={scene.selectedFloorNumber ?? null} onChange={scene.setFloorNumber} />
      )}
    </MapMessage>
  ) : null;

  const applyFraming = (viewport: MapViewport) => setFraming(pinMapFraming(framing, viewport));
  // Back to the default framing: the cinematic camera on the mesh, the
  // party-following one across a whole run.
  const followGroup = () => setFraming({ ...framing, viewport: null, manual: false, revision: framing.revision + 1 });
  // Follow stands in for Fit while the camera can follow: across a run, and on
  // the mesh, where the Director frames the boss and the group itself.
  const onMesh = show3D && meshWanted && meshState === "ready";
  const canFollow = ready.wholeRun || onMesh;
  const following = canFollow && cinematic;
  // On the mesh once it has loaded, else on the flat artwork.
  const canWalk = show3D && (!meshWanted || meshState === "ready");
  // A unit frame's Follow: the cinematic camera on that unit (resumed if the
  // user had pinned a framing); again, or taking the camera, stops it.
  const followUnit = (guid: string) => {
    if (followGuid === guid) {
      setFollowGuid(null);
      return;
    }
    if (!cinematic) followGroup();
    setFollowGuid(guid);
  };
  const walking = walkWanted && canWalk;
  const jumps = ready.wholeRun && ready.runStartMs !== null && ready.runEndMs !== null
    ? encounterJumps(props.context.instance.encounters, props.result.encounters, ready.runStartMs, ready.runEndMs)
    : [];
  const jumpTo = (timestampMs: number) => sync?.setTimestamp(new Date(timestampMs));
  const toggleMesh = () => {
    const next = !meshOn;
    setStoredMesh(next);
    storeMesh(next);
  };
  const view2D = (
    <MapView2D
      ground={ready.ground}
      markers={ready.markers}
      routePoints={ready.routePoints}
      projectSample={ready.projectSample}
      trailSeconds={effectSettings.trailSeconds}
      view={view}
      onUserViewport={handleUserViewport}
    />
  );

  // In the card's title row when the host offers one, so the map gets the height.
  const headerControls = (
    <div className="flex min-w-0 shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
      {!ready.overlayAvailable && <span className="text-amber-300/80">position overlay unavailable</span>}
      <LivePresenceIndicator surface={presenceSurface} />
      {onExitWholeRun && (
        <button type="button" onClick={onExitWholeRun} title="Back to the 2D route overview" className={framingButtonClass}>
          <Route className="h-3 w-3" />
          Overview
        </button>
      )}
      {mini && <ExpandMapButton context={props.context} />}
    </div>
  );

  const framingControls = (
    <div className="absolute bottom-2 left-2 z-40 flex items-center gap-1">
      {/* Mini map: play/pause and speed lead the row (the preview's own clock, or the page's Replay once it is on). */}
      {mini && (
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
                if (previewOn) setPreviewPlaying(!previewPlaying);
                else if (sync?.isPlaying) sync.pause();
                else sync?.play();
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
    </div>
  );

  return (
    <PortalContainerProvider container={fullscreenElement ?? inheritedPortalContainer}>
    <div
      ref={rootRef}
      data-window-fullscreen={mobileWorldOpen || windowed ? "" : undefined}
      className={cn(
        "flex h-full min-h-0 flex-col bg-black",
        !mini && !mobile && !immersive && "p-1",
        mobileWorldOpen && "fixed inset-0 z-[100] h-[100dvh] w-screen",
        windowed && "fixed inset-0 z-[100] h-auto",
      )}
    >
      {!mobile && (props.headerSlot ? createPortal(headerControls, props.headerSlot) : <div className="flex justify-end px-1">{headerControls}</div>)}
      {/* The card has no padding (hoverHeader): the full map keeps a thin window frame a hair inside it, the mini map runs to the edges. */}
      <div className={cn("group/map relative min-h-0 flex-1 overflow-hidden bg-black/70", !mini && !mobile && !immersive && "rounded-sm border border-white/15")}>
        {mobile && !mobileWorldOpen ? (
          <>
            <div className="pointer-events-none absolute inset-0">{view2D}</div>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/15" aria-hidden />
            <button
              type="button"
              onClick={openMobileWorld}
              className="absolute bottom-4 left-1/2 z-40 flex min-h-12 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-amber-100/30 bg-amber-300 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[0_10px_36px_rgba(0,0,0,.6)] active:scale-95"
            >
              <Gamepad2 className="size-5" />
              Enter 3D world
            </button>
          </>
        ) : !show3D ? (meshOnly
          ? <MapMessage title="No map artwork for this instance" detail={`${ready.mapName} has no 2D map; it is 3D only, and this browser could not provide WebGL.`} />
          : view2D
        ) : (
          <Suspense fallback={<MapMessage title="Loading 3D view" detail="Fetching the 3D renderer…" />}>
            <MapView3D
              ground={ready.ground}
              markers={ready.markers}
              routePoints={ready.routePoints}
              projectSample={ready.projectSample}
              worldCoordinates={props.context.instance.positionCoordinateSpace !== "ui-map-normalized"}
              cursorMs={ready.cursorMs}
              playing={ready.playing}
              playbackSpeed={ready.playbackSpeed}
              view={view}
              onUserViewport={handleUserViewport}
              effects={ready.effects}
              bossGuids={ready.bossGuids}
              tankGuids={ready.tankGuids}
              miniatureUrls={miniatureQuery.data}
              onUnavailable={() => setWebglUnavailable(true)}
              dungeonMesh={dungeonMesh}
              onDungeonMeshState={setMeshState}
              focus={focus}
              cinematic={cinematic}
              onUnitClick={setTarget}
              effectSettings={effectSettings}
              topDownKey={topDownKey}
              walking={walking}
              onWalkingChange={setWalking}
              mobileInput={mobileWorldOpen ? mobileInput : null}
              adStrafe={adStrafe}
              walkAvatar={walkAvatar}
              livePresence={livePresence}
              presenceSurface={presenceSurface}
              unitRoles={unitRoles}
              frozen={reloading}
              debuffSpellIds={ready.debuffSpellIds}
              followGuid={followGuid}
              onFollowChange={setFollowGuid}
              planItems={planOpen && canWalk ? planEditor.drawnItems : NO_PLAN_ITEMS}
              planSelectedId={planOpen ? planEditor.state.selectedId : null}
              planInput={planOpen && canWalk ? planEditor.input : null}
            />
          </Suspense>
        )}
        {mobile && mobileWorldOpen && (
          <MobileMapControls
            walking={walking}
            canWalk={canWalk}
            onWalkingChange={setWalking}
            onInputChange={setMobileInput}
            onClose={closeMobileWorld}
          />
        )}
        {!mobile && framingControls}
        {!mobile && mini && <ExpandMapButton context={props.context} overlay />}
        {!mobile && previewOn && (
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
                  // Hand the preview over to Replay at the same moment, still playing.
                  // Enabled first, so the Replay controls keep this point rather than resetting.
                  if (sync) {
                    sync.enable();
                    sync.setTimestamp(new Date(ready.cursorMs));
                    sync.play();
                  }
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
        {mini && (
          <MiniScrubber
            raised={previewOn && Boolean(props.context.onOpenReplay)}
            fraction={(ready.cursorMs - ready.encounterStartMs) / Math.max(1, ready.encounterEndMs - ready.encounterStartMs)}
            onSeek={(fraction) => {
              const span = ready.encounterEndMs - ready.encounterStartMs;
              if (previewOn) {
                // The preview loops, so the very end would wrap to the start.
                setPreviewElapsedMs((Math.min(fraction, 0.999) * span) / ready.playbackSpeed);
              } else {
                sync?.setTimestamp(new Date(ready.encounterStartMs + fraction * span));
              }
            }}
          />
        )}
        {/* X toggles the replay: flash play or pause over the map, like a video player. */}
        <ReplayToggleFlash />
        {reloading && (
          <div className="pointer-events-none absolute left-1/2 top-2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-sm bg-black/75 px-2 py-0.5 text-[11px] text-white/80 shadow-[0_4px_16px_rgba(0,0,0,.5)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading the encounter…
          </div>
        )}
        {/* Without Replay the map is a still: say so over it rather than in a row of its own. */}
        {!mini && !mobile && !reloading && ready.overlayAvailable && !ready.syncEnabled && (
          <div className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/75 px-2 py-0.5 text-[11px] text-white/70 shadow-[0_4px_16px_rgba(0,0,0,.5)]">
            Final positions · enable Replay to watch units move
          </div>
        )}
        {/* The mini map is just the replay: no frames, settings, walk, plan or meters. */}
        {!mini && !mobile && (<>
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
          </UnitInspectContext.Provider>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Map settings"
            aria-label="Map settings"
            className="absolute right-2 top-2 z-40 grid h-7 w-7 place-items-center rounded-sm border border-black/80 bg-black/75 text-white/70 shadow-[0_4px_16px_rgba(0,0,0,.5)] hover:bg-black/90 hover:text-white"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          {show3D && (
            <button
              type="button"
              onClick={() => setWalking(!walking)}
              disabled={!canWalk}
              aria-pressed={walking}
              title={canWalk
                ? walking ? "Leave walk mode (G or Esc)" : "Walk mode (G): join the fight with a character of your own"
                : "Walk mode: waiting for the 3D map to load"}
              aria-label="Walk mode"
              className={cn(
                "absolute right-2 top-10 z-40 grid h-7 w-7 place-items-center rounded-sm border border-black/80 shadow-[0_4px_16px_rgba(0,0,0,.5)] disabled:opacity-40",
                walking ? "bg-amber-400/90 text-black hover:bg-amber-300" : "bg-black/75 text-white/70 enabled:hover:bg-black/90 enabled:hover:text-white",
              )}
            >
              <Footprints className="h-4 w-4" />
            </button>
          )}
          {show3D && (
            <button
              type="button"
              onClick={() => {
                if (!planOpen) setWalking(false);
                setPlanOpen(!planOpen);
              }}
              disabled={!canWalk}
              aria-pressed={planOpen}
              title={canWalk ? planOpen ? "Close planning" : "Plan: draw markers, arrows, ranges and player spots on the floor" : "Planning needs the 3D map (Map settings → World → 3D map)"}
              aria-label="Plan"
              className={cn(
                "absolute right-2 top-[4.5rem] z-40 grid h-7 w-7 place-items-center rounded-sm border border-black/80 shadow-[0_4px_16px_rgba(0,0,0,.5)] disabled:opacity-40",
                planOpen ? "bg-amber-400/90 text-black hover:bg-amber-300" : "bg-black/75 text-white/70 enabled:hover:bg-black/90 enabled:hover:text-white",
              )}
            >
              <PenLine className="h-4 w-4" />
            </button>
          )}
          {planOpen && canWalk && (
            <PlanControls editor={planEditor} roster={planRoster} onClose={closePlan} />
          )}
          {(walking || show3D) && (
            <div className={cn(
              "pointer-events-none absolute left-1/2 z-30 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-sm bg-black/75 px-2.5 py-1.5 text-[11px] text-white/80 shadow-[0_4px_16px_rgba(0,0,0,.5)]",
              // Above the fullscreen Replay bar.
              immersive ? "bottom-24" : "bottom-2",
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
                  <WalkHint keys={["A", "D"]}>turn</WalkHint>
                  <WalkHint keys={["Space", "Z"]}>zoom out / in</WalkHint>
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
          {settingsOpen && (
            <MapSettingsOverlay
              onClose={() => setSettingsOpen(false)}
              effectSettings={effectSettings}
              onEffectSettings={updateEffectSettings}
              show3D={show3D}
              hasEffects={Boolean(ready.effects)}
              mesh={show3D && meshUrl ? { on: meshWanted, locked: meshOnly, loading: Boolean(dungeonMesh) && meshState === "loading", onToggle: toggleMesh } : null}
              floors={ready.floors.length > 1 ? { list: ready.floors, value: ready.selectedFloorNumber, onChange: ready.setFloorNumber } : null}
              onTopDown={() => setTopDownKey((key) => key + 1)}
              adStrafe={adStrafe}
              onAdStrafe={setAdStrafe}
              walkAvatar={walkAvatar}
              onWalkAvatar={setWalkAvatar}
              onResetAll={resetAllSettings}
            />
          )}
          <TargetFrames
            target={target}
            targetOfTarget={targetOfTarget}
            targetsTarget={targetsTarget}
            raidFrames={raidFrames}
            auras={auras}
            onPin={pin}
            onClear={() => setTarget(null)}
            followGuid={followGuid}
            onFollow={onMesh ? followUnit : undefined}
          />
          {/* Below Settings, Walk and Plan (the last two only with the 3D view): fill the window, then true fullscreen. */}
          <KeybindTooltip
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
          </KeybindTooltip>
          {typeof document !== "undefined" && document.fullscreenEnabled && (
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
          {immersive && props.context.onSelectEncounters && (
            <FullscreenEncounterPicker
              encounters={props.context.instance.encounters}
              selectedIds={props.context.selectedEncounterIds}
              onSelect={props.context.onSelectEncounters}
            />
          )}
          <InspectCards guids={pinned} onRemove={unpin} raidFrames={raidFrames} auras={auras} />
          <MeterWindows windows={meterWindows} onChange={setMeterWindows} context={props.context} durationMs={props.durationMs} />
          {/* Fullscreen hides the page's Replay controls: the same transport bar over the map. */}
          {immersive && <FullscreenReplayBar />}
        </>)}
      </div>
      {!mini && !mobile && jumps.length > 0 && ready.runStartMs !== null && (
        <div className="flex flex-col gap-1 px-3 py-2">
          <div className="relative h-1.5 rounded bg-white/10" aria-hidden>
            {jumps.map((jump) => (
              <span key={jump.id} className="absolute top-0 h-full w-0.5 bg-amber-300/80" style={{ left: `${jump.fraction * 100}%` }} />
            ))}
            {ready.syncEnabled && ready.runEndMs !== null && (
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
                disabled={!ready.syncEnabled}
                title={ready.syncEnabled ? `Jump to ${jump.name}` : "Enable Replay to jump between encounters"}
                className={framingButtonClass}
              >
                {jump.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {!mini && !mobile && webglUnavailable && (
        <p className="px-3 py-1 text-[9px] text-amber-300/80">3D view needs WebGL, which this browser could not provide. Showing the replay map in 2D instead.</p>
      )}
      {!mini && !mobile && !ready.overlayAvailable && (
        <p className="px-3 py-1 text-[9px] text-amber-300/80">No compatible world-coordinate mapping is available for this floor, so unit markers are hidden.</p>
      )}
    </div>
    </PortalContainerProvider>
  );
}

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

function MapContent({ forceMini = false, ...props }: PanelRenderProps<MapResult> & { forceMini?: boolean }) {
  const [wholeRun, setWholeRun] = useState(false);
  const isMobile = useIsMobile();
  // The Mini Map panel is always mini; a Map panel is mini with the (older) "mini" option.
  const mini = forceMini || isMiniMapOption(props.panelOption);
  const selectedCount = props.context.selectedEncounterIds.length;
  if (isMobile) {
    return (
      <MapTelemetryWarning props={props}>
        <SingleEncounterReplayMap {...props} mobile wholeRun={selectedCount !== 1} />
      </MapTelemetryWarning>
    );
  }
  const presentation = mapPresentationForSelection(selectedCount, wholeRun);
  if (presentation === "replay-3d" && selectedCount !== 1) {
    return (
      <MapTelemetryWarning props={props}>
        <SingleEncounterReplayMap {...props} mini={mini} wholeRun onExitWholeRun={() => setWholeRun(false)} />
      </MapTelemetryWarning>
    );
  }
  if (presentation === "replay-3d") {
    return (
      <MapTelemetryWarning props={props}>
        <SingleEncounterReplayMap {...props} mini={mini} />
      </MapTelemetryWarning>
    );
  }
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
    <div className="flex items-center gap-1">
      <button type="button" onClick={startWholeRun} title="Replay the whole run in 3D, the camera following the group" className={framingButtonClass}>
        <Route className="h-3 w-3" />
        Whole run
      </button>
      {mini && <ExpandMapButton context={props.context} />}
    </div>
  );
  return (
    <MapTelemetryWarning props={props}>
      <div className="flex h-full min-h-0 flex-col">
        {props.headerSlot ? createPortal(wholeRunButton, props.headerSlot) : <div className="flex justify-end px-3 pt-2">{wholeRunButton}</div>}
        <div className="relative min-h-0 flex-1">
          <MapOverview2D {...props} mini={mini} />
          {mini && <ExpandMapButton context={props.context} overlay />}
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
    </MapTelemetryWarning>
  );
}

function MapMessage({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 p-6 text-center">
      <MapIcon className="h-8 w-8 text-muted-foreground/50" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{detail}</p>
      {children}
    </div>
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
    render: (props) => <MapContent {...props} forceMini={mini} />,
  };
}
