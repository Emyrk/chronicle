import { useEffect, useMemo, useRef, useState } from "react";
import { useSpell } from "@/api/queries";
import { usePlayerSpecializations } from "@/components/ui/PlayerMetricChart/PlayerSpecializationContext";
import { useDatasetId } from "@/hooks/useDatasetId";
import { SpellTooltip } from "@/pages/WoWDB/SpellTooltip";
import type { LiveMapPresence } from "../../liveSessionProtocol";
import type { MapPresenceListener } from "../../LiveSessionContext";
import { useSmoothReplayTime } from "../RotationTimeline/useSmoothReplayTime";
import { useSpellMeta } from "../RotationTimeline/useSpellMeta";
import { miniatureUrl } from "./bossMinis";
import type { MapPositionSample } from "./map.processor";
import { prefersReducedMotion, replayPositionAt, VIEW_TRANSITION_MS, type MapPoint, type MapViewport } from "./mapModel";
import {
  MapScene3D,
  type DungeonMeshRequest,
  type DungeonMeshState,
  type MapScene3DEffectHover,
  type MapScene3DUnit,
  type MapSceneDirector,
  type MapSceneFocus,
  type MapUnitRoles,
} from "./MapScene3D";
import { collectCastSpellIds, DEFAULT_EFFECT_OPTIONS, effectiveCastIconGuids, iconPreloadUrls, type EncounterEffects } from "./replayEffects";
import type { MapViewRequest } from "./MapView2D";
import type { MapSceneGround, MapSceneMarker } from "./useMapScene";
import { DEFAULT_EFFECT_SETTINGS, type EffectSettings } from "./mapViewSettings";

export interface MapView3DProps {
  ground: MapSceneGround;
  markers: MapSceneMarker[];
  projectSample: (sample: MapPositionSample) => MapPoint | null;
  cursorMs: number;
  playing: boolean;
  playbackSpeed: number;
  view: MapViewRequest;
  /** Called with the viewport after the user pans or zooms the camera. */
  onUserViewport?: (viewport: MapViewport) => void;
  /** Combat events for hit wobble, beams, rings and deaths. */
  effects?: EncounterEffects;
  bossGuids?: ReadonlySet<string>;
  /** Tanks: their heals are kept when effects are capped and float numbers. */
  tankGuids?: ReadonlySet<string>;
  /** Published entry-ID miniature URLs from the shared manifest. */
  miniatureUrls?: ReadonlyMap<number, string>;
  /** Called when WebGL cannot be created or the context is lost. */
  onUnavailable: () => void;
  /** The real dungeon mesh to stand the units on instead of the tiles ("3D map"), or null for the tiles. */
  dungeonMesh?: DungeonMeshRequest | null;
  /** Reports the mesh load: loading, ready, or failed (the tiles stay). */
  onDungeonMeshState?: (state: DungeonMeshState) => void;
  /** The fight the mesh camera is locked to (zoom and pan), or null for the whole map. */
  focus?: MapSceneFocus | null;
  /**
   * Hand the mesh camera to the cinematic Director, which keeps the boss and
   * the group framed. Off once the user pins a framing (Fit, Reset, a pan or
   * a zoom); Follow turns it back on.
   */
  cinematic?: boolean;
  /** Called with a unit's guid when it is clicked on the map. */
  onUnitClick?: (guid: string) => void;
  /** Display settings (effects, bars); the defaults when left out. */
  effectSettings?: EffectSettings;
  /** Bump to ask for the top-down camera view. */
  topDownKey?: number;
  /** Walk mode: a character of your own on the mesh floor (needs the dungeon mesh). */
  walking?: boolean;
  /** Called when walk mode starts or ends, including from the keyboard (G, Esc). */
  onWalkingChange?: (walking: boolean) => void;
  /** A/D strafe and Q/E turn (a saved map setting, on by default). */
  adStrafe?: boolean;
  /** In a live session: share your camera / character and draw everyone else's. */
  livePresence?: MapLivePresence | null;
  /** The target frames' units: halos for the selected chain and pins, and target lines. */
  unitRoles?: MapUnitRoles | null;
}

const NO_ROLES: MapUnitRoles = { selected: null, target: null, targetsTarget: null, pinned: new Set() };

export interface MapLivePresence {
  publish: (presence: LiveMapPresence | null) => void;
  subscribe: (listener: MapPresenceListener) => () => void;
}

// Resent this often even when still, so others can tell you are there.
const PRESENCE_HEARTBEAT_MS = 2000;

// three.js needs concrete colors; class colors are CSS custom properties.
function resolveCssColor(color: string, element: Element, cache: Map<string, string>): string {
  const variable = /^var\((--[^)]+)\)$/.exec(color)?.[1];
  if (!variable) return color;
  let resolved = cache.get(variable);
  if (resolved === undefined) {
    resolved = getComputedStyle(element).getPropertyValue(variable).trim() || "#ffffff";
    cache.set(variable, resolved);
  }
  return resolved;
}

// The hovered effect's spell; its data is fetched only once hovered.
function EffectTooltip({ hover }: { hover: MapScene3DEffectHover }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(String(hover.spellId ?? ""), datasetId, { enabled: hover.spellId != null });
  const amount = hover.amount > 0
    ? <div className="text-xs text-muted-foreground">{hover.eventKind === "heal" ? "Healed" : "Hit for"} {hover.amount.toLocaleString()}</div>
    : null;
  return (
    <div className="pointer-events-none absolute z-20 max-w-xs" style={{ left: hover.x + 12, top: hover.y + 12 }}>
      {spell ? <SpellTooltip spell={spell} footer={amount} /> : (
        <div className="rounded border border-white/15 bg-popover px-2 py-1 text-xs text-popover-foreground shadow-lg">
          <div className="font-medium">{hover.spellName || `Spell ${hover.spellId}`}</div>
          {amount}
        </div>
      )}
    </div>
  );
}

export default function MapView3D({
  ground,
  markers,
  projectSample,
  cursorMs,
  playing,
  playbackSpeed,
  view,
  onUserViewport,
  effects,
  bossGuids,
  tankGuids,
  miniatureUrls,
  onUnavailable,
  dungeonMesh = null,
  onDungeonMeshState,
  focus = null,
  cinematic = false,
  onUnitClick,
  effectSettings: effectSettingsProp,
  topDownKey = 0,
  walking = false,
  onWalkingChange,
  adStrafe = true,
  livePresence = null,
  unitRoles = null,
}: MapView3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MapScene3D | null>(null);
  const onUnavailableRef = useRef(onUnavailable);
  const onUserViewportRef = useRef(onUserViewport);
  const onDungeonMeshStateRef = useRef(onDungeonMeshState);
  const colorCacheRef = useRef(new Map<string, string>());
  const smoothMs = useSmoothReplayTime(cursorMs, playing, playbackSpeed);
  const effectSettings = effectSettingsProp ?? DEFAULT_EFFECT_SETTINGS;
  const showBars = effectSettings.bars;
  const [effectHover, setEffectHover] = useState<MapScene3DEffectHover | null>(null);
  // A player's token shows their spec's icon when their talents give one, else their class's.
  const specializations = usePlayerSpecializations();

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
    onUserViewportRef.current = onUserViewport;
    onDungeonMeshStateRef.current = onDungeonMeshState;
  }, [onDungeonMeshState, onUnavailable, onUserViewport]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let scene: MapScene3D;
    try {
      scene = new MapScene3D(
        container,
        () => onUnavailableRef.current(),
        setEffectHover,
        (viewport) => onUserViewportRef.current?.(viewport),
        (state) => onDungeonMeshStateRef.current?.(state),
      );
    } catch {
      onUnavailableRef.current();
      return;
    }
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setGround(ground);
  }, [ground]);

  useEffect(() => {
    sceneRef.current?.setDungeonMesh(dungeonMesh);
  }, [dungeonMesh]);

  useEffect(() => {
    sceneRef.current?.setFocus(focus);
  }, [focus]);

  useEffect(() => {
    sceneRef.current?.setOnUnitClick(onUnitClick ?? null);
  }, [onUnitClick]);

  // Keyed by the boss guids' string so replay ticks never re-engage the Director.
  const bossKey = bossGuids ? [...bossGuids].join(",") : "";
  const director = useMemo((): MapSceneDirector | null =>
    cinematic ? { bossGuids: new Set(bossKey ? bossKey.split(",") : []) } : null,
  [bossKey, cinematic]);
  useEffect(() => {
    sceneRef.current?.setDirector(director);
  }, [director]);

  // The first request frames instantly; later ones (a new key) ease there.
  const appliedViewKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || appliedViewKeyRef.current === view.key) return;
    const animate = appliedViewKeyRef.current !== null && !prefersReducedMotion();
    appliedViewKeyRef.current = view.key;
    scene.setViewport(view.viewport, animate ? VIEW_TRANSITION_MS : 0);
  }, [view]);

  useEffect(() => {
    const container = containerRef.current;
    const scene = sceneRef.current;
    if (!container || !scene) return;
    const units = markers.flatMap((marker): MapScene3DUnit[] => {
      const sample = smoothMs !== null
        ? replayPositionAt(marker.positions, smoothMs, marker.kind === "player") ?? marker.sample
        : marker.sample;
      const point = sample === marker.sample ? marker.point : projectSample(sample) ?? marker.point;
      const modelUrl = miniatureUrl(marker.entry, miniatureUrls);
      return [{
        guid: marker.guid,
        point,
        facing: sample.facing,
        color: resolveCssColor(marker.color, container, colorCacheRef.current),
        kind: marker.kind,
        muted: marker.muted,
        name: marker.name,
        health: showBars ? marker.health : null,
        miniatureUrl: modelUrl,
        z: sample.z,
        icon: specializations.get(marker.guid)?.iconUrl ?? marker.icon,
        boss: bossGuids?.has(marker.guid) ?? false,
        healthFraction: marker.healthFraction,
      }];
    });
    scene.setUnits(units);
  }, [bossGuids, markers, miniatureUrls, projectSample, showBars, smoothMs, specializations]);

  useEffect(() => {
    sceneRef.current?.setUnitRoles(unitRoles ?? NO_ROLES);
  }, [unitRoles]);

  useEffect(() => {
    sceneRef.current?.setAboveDisc(effectSettings.aboveDisc);
  }, [effectSettings.aboveDisc]);

  // Selected players (the unmuted ones while a selection mutes the rest),
  // bosses and tanks; keyed by string so replay ticks don't rebuild the options.
  const selectedKey = markers.some((marker) => marker.muted)
    ? markers.filter((marker) => marker.kind === "player" && !marker.muted).map((marker) => marker.guid).join(",")
    : "";
  const tankKey = tankGuids ? [...tankGuids].join(",") : "";
  const playerKey = markers.filter((marker) => marker.kind === "player").map((marker) => marker.guid).join(",");
  const effectOptions = useMemo(() => {
    const players = playerKey ? playerKey.split(",") : [];
    const selected = selectedKey ? new Set(selectedKey.split(",")) : null;
    const tanks = tankKey ? tankKey.split(",") : [];
    const bosses = bossKey ? new Set(bossKey.split(",")) : null;
    const selectedAndBosses = new Set([...(selected ?? []), ...(bosses ?? [])]);
    const priority = new Set([...selectedAndBosses, ...tanks]);
    const healText = new Set([...(selected ?? []), ...tanks]);
    return {
      selected,
      bosses,
      castIconGuids: effectiveCastIconGuids(effectSettings.castMode, players, selected, bosses),
      healText: healText.size > 0 ? healText : null,
      ...DEFAULT_EFFECT_OPTIONS,
      filterGuids: effectSettings.onlySelected ? selected : null,
      priorityGuids: priority.size > 0 ? priority : null,
      maxEffects: effectSettings.maxEffects,
      showPeriodic: effectSettings.periodic,
      showHeals: effectSettings.heals,
      showOverheal: effectSettings.overheal,
    };
  }, [bossKey, effectSettings, playerKey, selectedKey, tankKey]);

  // Spell icons float over the mode-picked players and bosses while they cast.
  const castGuids = effectSettings.enabled ? effectOptions.castIconGuids : null;
  // Every cast spell in the encounter, so mode or selection changes fetch nothing new.
  const castSpellIds = useMemo(() => (effects ? collectCastSpellIds(effects.events) : []), [effects]);
  const { meta: spellMeta, loading: spellMetaLoading } = useSpellMeta(castSpellIds);

  // Once the spell data is in, load the icon images ahead of playback.
  useEffect(() => {
    if (!effectSettings.enabled || spellMetaLoading || castSpellIds.length === 0) return;
    const placeholder = spellMeta(null).icon;
    sceneRef.current?.preloadIcons(
      iconPreloadUrls(castSpellIds, (id) => spellMeta(id).icon, new Set([placeholder])),
    );
  }, [castSpellIds, effectSettings.enabled, spellMeta, spellMetaLoading]);

  useEffect(() => {
    const container = containerRef.current;
    const scene = sceneRef.current;
    if (!container || !scene) return;
    scene.setEffects(effectSettings.enabled && effects ? {
      fx: effects,
      options: effectOptions,
      resolveColor: (color) => resolveCssColor(color, container, colorCacheRef.current),
      // Spell names float over the selected players' targets.
      combatTextGuids: effectOptions.selected,
      // Casters with cast icons show the icon instead of the spell name.
      suppressNameGuids: castGuids,
      castIcons: castGuids ? {
        guids: castGuids,
        priorityGuids: effectOptions.bosses,
        enemyGuids: effectOptions.bosses,
        iconUrl: (spellId) => spellMeta(spellId).icon,
        placeholderUrl: spellMeta(null).icon,
      } : null,
      // Heal amounts float for heals cast by or landing on selected players and tanks.
      healTextGuids: effectOptions.healText,
    } : null);
  }, [castGuids, effectOptions, effectSettings.enabled, effects, spellMeta]);

  useEffect(() => {
    sceneRef.current?.setEffectClock(cursorMs, playing, playbackSpeed);
  }, [cursorMs, playbackSpeed, playing]);

  // Each new key (after the first) asks for the top-down view.
  useEffect(() => {
    if (topDownKey > 0) sceneRef.current?.resetCamera(true);
  }, [topDownKey]);

  useEffect(() => {
    sceneRef.current?.setOnWalkChange(onWalkingChange ?? null);
  }, [onWalkingChange]);

  useEffect(() => {
    sceneRef.current?.setWalking(walking);
  }, [walking]);

  useEffect(() => {
    sceneRef.current?.setAdStrafe(adStrafe);
  }, [adStrafe]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !livePresence) return;
    scene.setOnPresence(livePresence.publish);
    const unsubscribe = livePresence.subscribe((presences) => scene.setRemotePresences(presences));
    const heartbeat = window.setInterval(() => scene.emitPresence(true), PRESENCE_HEARTBEAT_MS);
    return () => {
      window.clearInterval(heartbeat);
      unsubscribe();
      scene.setOnPresence(null);
      scene.setRemotePresences(new Map());
      livePresence.publish(null);
    };
  }, [livePresence]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {effectHover && <EffectTooltip hover={effectHover} />}
    </div>
  );
}
