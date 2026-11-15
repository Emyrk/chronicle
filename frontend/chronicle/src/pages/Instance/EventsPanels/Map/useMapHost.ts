import { useCallback, useEffect, useMemo, useState } from "react";
import { parseLivePresenceSurface } from "../../liveSessionProtocol";
import { useLiveSessionOptional } from "../../LiveSessionContext";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { useReplayStepKeys } from "../../replayStepKey";
import type { PanelRenderProps } from "../types";
import { useEmbeddedPanel, useEmbeddedPanelWithResult } from "../useEmbeddedPanel";
import type { UnitInspectSelection } from "../UnitInspectContext";
import { createRaidFramesPanel, selectRaidFramesEncounter } from "../RaidFrames/RaidFrames";
import { lastTargetAt, raidFramePlayerGuidsOption } from "../RaidFrames/raidFrames.processor";
import { createUnitAurasPanel } from "../UnitAuras/UnitAuras";
import type { MapResult } from "./map.processor";
import { DEFAULT_AD_STRAFE } from "./mapControls";
import { alignmentOverlayForMapMode, mapHostCapabilities, mapPreviewMaxSpeed, mapPreviewOn, preferredMeshState, walkModeAvailable, type MapHostKind } from "./mapHostModel";
import { flatMapYardStep, type ReplayMapSource } from "./mapModel";
import type { MapUnitRoles } from "./MapScene3D";
import {
  ENEMY_FRAMES_STORAGE_KEY,
  RAID_FRAMES_STORAGE_KEY,
  readStoredAdStrafe,
  readStoredMapSource,
  readStoredMesh,
  readStoredShown,
  storeAdStrafe,
  storeMapSource,
  storeMesh,
  storeShown,
} from "./mapSettingsStorage";
import type { MapLivePresence } from "./MapView3D";
import { DEFAULT_EFFECT_SETTINGS, useEffectSettings } from "./mapViewSettings";
import type { ReplayViewOptions } from "./ReplayPlayer";
import type { ReplayCamera } from "./replayPlayerModel";
import { useMapSceneEncounter } from "./useMapScene";
import { useLocalLoopClock, useSyncModeClock } from "./useReplayClock";
import { useReplayPlayer } from "./useReplayPlayer";
import { featuredUnitCallouts } from "./replayFeaturedUnits";
import { DEFAULT_WALK_AVATAR, readStoredWalkAvatar, storeWalkAvatar } from "./walkAvatars";

const RAID_FRAMES_PANEL = createRaidFramesPanel();
const UNIT_AURAS_PANEL = createUnitAurasPanel();
/** How often the map's preview clock ticks; the 3D view extrapolates between ticks. */
const PREVIEW_TICK_MS = 250;
/** The Map panel's camera: the cinematic Director until the user takes it. */
const DIRECTOR_CAMERA: ReplayCamera = { mode: "director" };

export interface MapHostOptions {
  props: PanelRenderProps<MapResult>;
  kind: MapHostKind;
  wholeRun: boolean;
  /** Fullscreen or filling the window (the desktop host's state). */
  immersive: boolean;
  /** The mobile host's 3D world is open (fullscreen, touch controls). */
  mobileWorldOpen: boolean;
}

/**
 * What the Map panel's hosts share: the clock choice (the page's Replay, or the
 * map's own preview), the ReplayPlayer, the saved map settings, walk and plan
 * availability, targeting (frames, roles) and live presence. A host adds its
 * mode (immersive, or the mobile world) and its chrome.
 */
export function useMapHost({ props, kind, wholeRun, immersive, mobileWorldOpen }: MapHostOptions) {
  const caps = mapHostCapabilities(kind, immersive);
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
  // Display settings and the settings overlay that sets them (all kept in local storage).
  const [effectSettings, updateEffectSettings] = useEffectSettings();
  // "3D map": the real dungeon mesh as the ground. Units project onto it with
  // the mesh entry's bounds only once it has loaded; until then (and when the
  // load fails) the tiles and their calibration stay.
  const [storedMesh, setStoredMesh] = useState(readStoredMesh);
  const scriptedCameraActive = Boolean(props.context.instance.replayCameraPath && sync?.externalDriver === "youtube");
  const meshOn = scriptedCameraActive || preferredMeshState(storedMesh);
  const [mapSource, setMapSourceState] = useState(readStoredMapSource);
  const setMapSource = (source: ReplayMapSource) => {
    setMapSourceState(source);
    storeMapSource(source);
  };
  // Preview: with the page's Replay off, the mini map, the full map's whole run
  // and any fullscreen map play on a loop by their own clock, so the map shows
  // what it does without switching the page's analytics into Replay.
  const previewOn = mapPreviewOn(kind, { wholeRun, immersive, replayOn: Boolean(sync?.enabled) });
  const previewMaxSpeed = mapPreviewMaxSpeed(kind, wholeRun);
  // The page's Replay as a clock, and the preview's own: a loop over the
  // encounter the scene shows (picked by the page's Replay cursor, as the scene does).
  const pageClock = useSyncModeClock();
  const previewEncounter = useMapSceneEncounter(props, wholeRun, pageClock.nowMs);
  const previewClock = useLocalLoopClock({
    bounds: previewEncounter ? { startMs: previewEncounter.startMs, endMs: previewEncounter.endMs } : null,
    maxSpeed: previewMaxSpeed,
    suspended: !previewOn,
    tickMs: PREVIEW_TICK_MS,
    // The preview loops, so the very end would wrap to the start.
    seekEnd: "hold",
  });
  const clock = previewOn ? previewClock : pageClock;
  const player = useReplayPlayer({
    source: props,
    clock,
    encounterAtMs: pageClock.nowMs,
    wholeRun,
    mapSource,
    showHiddenUnits: effectSettings.showHiddenUnits,
    meshOn,
    renderedCanvas: caps.mobileWorld && !mobileWorldOpen ? "always" : "without-mesh",
    camera: scriptedCameraActive
      ? { mode: "director", path: { marks: props.context.instance.replayCameraPath ?? [], startMs: new Date(props.context.instance.startTime).getTime() } }
      : DIRECTOR_CAMERA,
    // Whether Replay was on, held with the scene while it reloads.
    holdValue: Boolean(sync?.enabled),
  });
  const { ready, show3D, meshState, meshWanted, worldCoordinates } = player;
  // A new encounter starts its preview from the beginning.
  const [previewEncounterId, setPreviewEncounterId] = useState<string | null>(null);
  if (player.live && player.live.encounterId !== previewEncounterId) {
    setPreviewEncounterId(player.live.encounterId);
    previewClock.restart();
  }
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
  const alignmentOverlay = alignmentOverlayForMapMode(effectSettings.alignmentOverlay, meshWanted);
  useEffect(() => {
    if (alignmentOverlay !== effectSettings.alignmentOverlay) {
      updateEffectSettings({ alignmentOverlay });
    }
  }, [alignmentOverlay, effectSettings.alignmentOverlay, updateEffectSettings]);
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
    setMapSource("auto");
  };
  const toggleMesh = () => {
    const next = !meshOn;
    setStoredMesh(next);
    storeMesh(next);
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
  const raidFramePlayerOption = ready ? raidFramePlayerGuidsOption(ready.activePlayerGuids) : null;
  const { render: raidFrames, result: raidFramesResult } = useEmbeddedPanelWithResult({
    panel: RAID_FRAMES_PANEL,
    context: props.context,
    durationMs: props.durationMs,
    enabled: caps.frames && (showRaidFrames || showEnemyFrames || framesWanted),
  });
  const auras = useEmbeddedPanel({ panel: UNIT_AURAS_PANEL, context: props.context, durationMs: props.durationMs, enabled: caps.frames && framesWanted });
  const cursorMs = sync?.enabled && sync.currentTimestamp ? sync.currentTimestamp.getTime() : null;
  const targetEncounter = target && raidFramesResult
    ? selectRaidFramesEncounter(raidFramesResult.encounters, props.context.selectedEncounterIds, cursorMs)
    : null;
  // Who the selected unit is targeting, and who that one is (WoW's target's target).
  const targetAtMs = targetEncounter ? cursorMs ?? targetEncounter.endMs : 0;
  const targetOfTarget = target && targetEncounter ? lastTargetAt(targetEncounter, target, targetAtMs) : null;
  const targetsTarget = targetOfTarget && targetEncounter ? lastTargetAt(targetEncounter, targetOfTarget, targetAtMs) : null;
  const unitRoles = useMemo((): MapUnitRoles => ({ selected: target, target: targetOfTarget, targetsTarget, pinned: new Set(pinned) }), [pinned, target, targetOfTarget, targetsTarget]);

  // Walking needs a loaded mesh or a flat map calibrated in world yards.
  const yardSample = ready?.markers[0]?.sample;
  const floorBounds = ready && "bounds" in ready.ground.canvas ? ready.ground.canvas.bounds : undefined;
  const flatYardsAvailable = ready ? flatMapYardStep(ready.projectSample, yardSample, worldCoordinates, floorBounds) !== null : false;
  const canWalk = ready ? walkModeAvailable(show3D, meshWanted, meshState, flatYardsAvailable) : false;
  const walkUnavailableTitle = meshWanted
    ? "Walk mode: waiting for the 3D map to load"
    : "Walk mode unavailable: this map has no world scale";
  // Planning only needs the rendered floor; it does not depend on yard calibration.
  const canPlan = show3D && (!meshWanted || meshState === "ready");
  const walking = walkWanted && canWalk;
  // Replay turns on only from an explicit Replay control (Replay from here,
  // the fullscreen bar's Enable Replay): the preview hands over at the same
  // moment, still playing. Enabled first, so Replay keeps this point.
  const replayFromHere = () => {
    if (!sync || !ready) return;
    sync.enable();
    sync.setTimestamp(new Date(ready.cursorMs));
    sync.play();
  };
  // The view features every Map host passes through (a host adds touch input and the plan).
  const view: ReplayViewOptions = {
    onUnitClick: setTarget,
    effectSettings,
    trailSeconds: effectSettings.trailSeconds,
    walking,
    onWalkingChange: setWalking,
    adStrafe,
    walkAvatar,
    livePresence: caps.presence ? livePresence : null,
    presenceSurface,
    unitCallouts: featuredUnitCallouts(props.context.instance.replayFeaturedUnits),
    unitRoles,
    showCompass: caps.compass,
  };

  return {
    caps,
    sync,
    clock,
    previewOn,
    player,
    /** Whether Replay is on (as held with the scene while it reloads). */
    syncEnabled: player.heldValue,
    walkWanted,
    setWalking,
    walking,
    canWalk,
    walkUnavailableTitle,
    canPlan,
    effectSettings,
    updateEffectSettings,
    meshOn,
    scriptedCameraActive,
    mapSource,
    setMapSource,
    toggleMesh,
    resetAllSettings,
    adStrafe,
    setAdStrafe,
    walkAvatar,
    setWalkAvatar,
    presenceSurface,
    target,
    setTarget,
    pinned,
    pin,
    unpin,
    inspectSelection,
    showRaidFrames,
    setShowRaidFrames,
    showEnemyFrames,
    setShowEnemyFrames,
    raidFrames,
    raidFramePlayerOption,
    auras,
    targetOfTarget,
    targetsTarget,
    replayFromHere,
    view,
  };
}

export type MapHostState = ReturnType<typeof useMapHost>;
