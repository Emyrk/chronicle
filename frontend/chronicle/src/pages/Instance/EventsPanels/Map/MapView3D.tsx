import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAJOR_COOLDOWN_MIN_MS, useCooldownSpells } from "@/api/cooldownSpells";
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
import { DISPEL_KINDS, DISPEL_ORDER, type DispelKind } from "./unitTokenArt";
import type { PlanInput, PlanItem } from "./plan/mapPlan";
import { prefersReducedMotion, replayPositionAt, VIEW_TRANSITION_MS, type MapPoint, type MapViewport } from "./mapModel";
import {
  MapScene3D,
  type DungeonMeshRequest,
  type DungeonMeshState,
  type MapScene3DEffectHover,
  type MapScene3DTrailPoint,
  type MapScene3DUnit,
  type MapSceneDirector,
  type MapSceneFocus,
  type MapUnitRoles,
} from "./MapScene3D";
import { collectCastSpellIds, DEFAULT_EFFECT_OPTIONS, effectiveCastIconGuids, iconPreloadUrls, schoolNameColor, type EncounterEffects } from "./replayEffects";
import type { MapViewRequest } from "./MapView2D";
import type { MapSceneGround, MapSceneMarker } from "./useMapScene";
import { DEFAULT_EFFECT_SETTINGS, type EffectSettings } from "./mapViewSettings";
import { CAPSULE_AVATAR } from "./walkAvatars";

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
  /** The character to walk as (walkAvatars ids). */
  walkAvatar?: string;
  /** In a live session: share your camera / character and draw everyone else's. */
  livePresence?: MapLivePresence | null;
  /** Unique panel-instance surface that replaces the generic shared cursor. */
  presenceSurface?: string;
  /** The target frames' units: halos for the selected chain and pins, and target lines. */
  unitRoles?: MapUnitRoles | null;
  /** The raid plan to draw on the floor (the current step's items, and any being drawn). */
  planItems?: readonly PlanItem[];
  planSelectedId?: string | null;
  /** The active plan tool's pointer handlers: the left button draws instead of orbiting. */
  planInput?: PlanInput | null;
  /** The unit the cinematic camera follows (a unit frame's Follow), or null for the group. */
  followGuid?: string | null;
  /** Called when the followed unit changes, including when the user takes the camera (null). */
  onFollowChange?: (guid: string | null) => void;
  /** Every debuff spell on a player in the encounter: their dispel types tint the tokens. */
  debuffSpellIds?: readonly number[];
  /**
   * The next fight is loading: keep drawing the last one (units, effects,
   * mesh) as it was instead of tearing the scene down, until fresh props arrive.
   */
  frozen?: boolean;
}

const NO_DEBUFFS: readonly number[] = [];
const NO_PLAN_ITEMS: readonly PlanItem[] = [];

// How far one yard of world x and of world y moves a point on the artwork,
// measured with the units' own projection around `sample` (walking the flat map).
function flatYardStep(project: (sample: MapPositionSample) => MapPoint | null, sample: MapPositionSample): { x: MapPoint; y: MapPoint } | null {
  const half = 5;
  const step = (dx: number, dy: number): MapPoint | null => {
    const from = project({ ...sample, x: sample.x - dx, y: sample.y - dy });
    const to = project({ ...sample, x: sample.x + dx, y: sample.y + dy });
    return from && to ? { leftPercent: (to.leftPercent - from.leftPercent) / (2 * half), topPercent: (to.topPercent - from.topPercent) / (2 * half) } : null;
  };
  const x = step(half, 0);
  const y = step(0, half);
  return x && y ? { x, y } : null;
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

// Gap between a movement trail's points.
const TRAIL_STEP_MS = 100;

// Where the unit was every TRAIL_STEP_MS over the last `spanMs`, newest first
// (from `sample`, the unit now), stopping at a map change or before its first sample.
function sampleTrail(
  marker: MapSceneMarker,
  sample: MapPositionSample,
  spanMs: number,
  projectSample: (sample: MapPositionSample) => MapPoint | null,
): MapScene3DTrailPoint[] {
  const trail: MapScene3DTrailPoint[] = [];
  const first = marker.positions[0];
  for (let ago = 0; ago <= spanMs; ago += TRAIL_STEP_MS) {
    const at = sample.timestampMs - ago;
    if (!first || at < first.timestampMs) break;
    const past = ago === 0 ? sample : replayPositionAt(marker.positions, at, marker.kind === "player");
    if (!past || past.mapId !== sample.mapId) break;
    const point = projectSample(past);
    if (!point) break;
    trail.push({ point, z: past.z });
  }
  return trail;
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
  walkAvatar = CAPSULE_AVATAR,
  livePresence = null,
  presenceSurface,
  unitRoles = null,
  frozen = false,
  debuffSpellIds = NO_DEBUFFS,
  followGuid = null,
  onFollowChange,
  planItems = NO_PLAN_ITEMS,
  planSelectedId = null,
  planInput = null,
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
  // The dispel type of each debuff (from its spell data), to tint debuffed players.
  const { meta: debuffMeta } = useSpellMeta(debuffSpellIds);
  const dispelOf = useCallback((spellIds: readonly number[] | undefined): DispelKind | null => {
    if (!spellIds || spellIds.length === 0) return null;
    const kinds = new Set(spellIds.map((id) => DISPEL_KINDS[debuffMeta(id).spell?.dispel_type?.value ?? 0]));
    return DISPEL_ORDER.find((kind) => kinds.has(kind)) ?? null;
  }, [debuffMeta]);

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
    if (!frozen) sceneRef.current?.setGround(ground);
  }, [frozen, ground]);

  const yardSample = markers[0]?.sample;
  useEffect(() => {
    if (!frozen) sceneRef.current?.setFlatYards(yardSample ? flatYardStep(projectSample, yardSample) : null);
  }, [frozen, projectSample, yardSample]);

  useEffect(() => {
    if (!frozen) sceneRef.current?.setDungeonMesh(dungeonMesh);
  }, [dungeonMesh, frozen]);

  useEffect(() => {
    if (!frozen) sceneRef.current?.setFocus(focus);
  }, [focus, frozen]);

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
    if (!container || !scene || frozen) return;
    const units = markers.flatMap((marker): MapScene3DUnit[] => {
      const sample = smoothMs !== null
        ? replayPositionAt(marker.positions, smoothMs, marker.kind === "player") ?? marker.sample
        : marker.sample;
      const point = sample === marker.sample ? marker.point : projectSample(sample) ?? marker.point;
      const modelUrl = miniatureUrl(marker.entry, miniatureUrls);
      const trail = effectSettings.trailSeconds > 0 ? sampleTrail(marker, sample, effectSettings.trailSeconds * 1000, projectSample) : undefined;
      return [{
        guid: marker.guid,
        point,
        facing: sample.facing,
        worldX: sample.x,
        worldY: sample.y,
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
        owner: marker.owner,
        dispel: dispelOf(marker.debuffs),
        power: marker.power ?? null,
        trail,
      }];
    });
    scene.setUnits(units);
  }, [bossGuids, dispelOf, effectSettings.trailSeconds, frozen, markers, miniatureUrls, projectSample, showBars, smoothMs, specializations]);

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
  const { meta: spellMeta, gcd: spellGcd, loading: spellMetaLoading } = useSpellMeta(castSpellIds);
  // As the player timeline sorts casts: a curated spell with a long enough
  // cooldown is a major cooldown; an instant one off the GCD is a proc (the
  // GCD reads as the default until the spell's data loads, so not a proc).
  const cooldownSpells = useCooldownSpells();
  const majorCooldowns = useMemo(() => {
    const ids = new Set<number>();
    for (const spells of Object.values(cooldownSpells.data?.byClass ?? {})) {
      for (const spell of spells) if (!spell.ignored && spell.cooldown_ms >= MAJOR_COOLDOWN_MIN_MS) ids.add(spell.id);
    }
    return ids;
  }, [cooldownSpells.data]);
  const isCooldown = useCallback((spellId: number) => majorCooldowns.has(spellId), [majorCooldowns]);
  const isProc = useCallback((spellId: number) => spellGcd(spellId) === 0, [spellGcd]);

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
    if (!container || !scene || frozen) return;
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
        isProc,
        isCooldown,
      } : null,
      // Heal amounts float for heals cast by or landing on selected players and tanks.
      healTextGuids: effectOptions.healText,
      castSchoolColor: (spellId) => schoolNameColor(spellMeta(spellId).spell?.school?.string),
    } : null);
  }, [castGuids, effectOptions, effectSettings.enabled, effects, frozen, isCooldown, isProc, spellMeta]);

  useEffect(() => {
    if (!frozen) sceneRef.current?.setEffectClock(cursorMs, playing, playbackSpeed);
  }, [cursorMs, frozen, playbackSpeed, playing]);

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
    sceneRef.current?.setWalkAvatar(walkAvatar);
  }, [walkAvatar]);

  useEffect(() => {
    sceneRef.current?.setOnFollowChange(onFollowChange ?? null);
  }, [onFollowChange]);

  useEffect(() => {
    sceneRef.current?.setPlanItems(planItems, planSelectedId);
  }, [planItems, planSelectedId]);

  useEffect(() => {
    sceneRef.current?.setPlanInput(planInput);
  }, [planInput]);

  // After the Director and view effects above, so a framing reset in the
  // same commit (resuming the cinematic camera) does not cancel the follow.
  useEffect(() => {
    sceneRef.current?.followUnit(followGuid);
  }, [followGuid]);

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
    <div data-live-presence-surface={presenceSurface} className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />
      {effectHover && <EffectTooltip hover={effectHover} />}
    </div>
  );
}
