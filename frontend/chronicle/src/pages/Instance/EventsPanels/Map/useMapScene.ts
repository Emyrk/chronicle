import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import {
  type WowMapInstanceFloor,
  type WowMapLayer,
  type WowMapMeshInstance,
  type WowMapOverlay,
  type WowMapRenderedInstance,
} from "@/pages/Technical/mapGallery";
import { fetchMapManifest } from "@/pages/Technical/mapManifest";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import type { PanelRenderProps } from "../types";
import { placeableDungeonMesh, replayDungeonMesh } from "./dungeonMeshes";
import { groupCentre, isStaleRunSample, mergeRunEncounters, RUN_UNIT_STALE_MS, runSignature } from "./wholeRun";
import { POWER_COLORS } from "../RaidFrames/raidFrameShared";
import { activeDebuffsAt, type MapDebuff, type MapEncounterPositions, type MapPositionSample, type MapResult } from "./map.processor";
import { inferRoles } from "../Roles/roles.processor";
import { deriveRecentHealGain, isDeadAt, type EncounterEffects } from "./replayEffects";
import { shouldShowMapUnit } from "./mapUnitVisibility";
import {
  AUTO_FIT_MIN_SPAN_YARDS,
  autoFitViewport,
  calibratedDungeonMapPoint,
  dominantMapId,
  dungeonMapPoint,
  focusCentre,
  latestHealthAt,
  replayPositionAt,
  projectionScale,
  renderedDungeonMapPoint,
  replayDungeonCanvasForCoordinates,
  resolveDungeonMapCalibration,
  resolveMapArtwork,
  resolveMapFloorNumber,
  selectHealthBars,
  selectMapEncounter,
  unitFocusBounds,
  uiMapPoint,
  zoneMapPoint,
  type MapPoint,
  type MapPointBounds,
  type MapViewport,
} from "./mapModel";

interface MapFocus {
  bounds: MapPointBounds;
  autoFit: MapViewport;
  /** The focus centre (median boss position) on the artwork, or null when no boss is known. */
  centre: MapPoint | null;
}

// Fit bounds scan the encounter's whole track, so cache them per encounter
// and projection instead of recomputing on every replay tick.
const focusBoundsCache = new WeakMap<Map<string, MapPositionSample[]>, Map<string, MapFocus | null>>();

function cachedFocusBounds(
  positionsByUnit: Map<string, MapPositionSample[]>,
  key: string,
  compute: () => MapFocus | null,
): MapFocus | null {
  let byKey = focusBoundsCache.get(positionsByUnit);
  if (!byKey) {
    byKey = new Map();
    focusBoundsCache.set(positionsByUnit, byKey);
  }
  if (!byKey.has(key)) byKey.set(key, compute());
  return byKey.get(key) ?? null;
}

// The merged run is rebuilt only when more of the result has streamed in.
const runCache = new WeakMap<Map<string, MapEncounterPositions>, { signature: string; run: MapEncounterPositions | null }>();

function cachedRun(encounters: Map<string, MapEncounterPositions>): MapEncounterPositions | null {
  const signature = runSignature(encounters);
  const cached = runCache.get(encounters);
  if (cached && cached.signature === signature) return cached.run;
  const run = mergeRunEncounters(encounters);
  runCache.set(encounters, { signature, run });
  return run;
}

/** The follow camera frames this many yards across the longer axis. */
const FOLLOW_SPAN_YARDS = 70;
// The follow centre snaps to this grid (artwork fraction) so sub-pixel drift
// does not re-frame the camera on every replay tick.
const FOLLOW_GRID = 1 / 400;

function useMapManifest(iconBaseUrl: string | undefined) {
  return useQuery({
    queryKey: ["wow-map-manifest", iconBaseUrl],
    enabled: Boolean(iconBaseUrl),
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchMapManifest(iconBaseUrl!),
  });
}

export type MapMarkerKind = "player" | "pet" | "hostile";

export interface MapUnitHealth {
  current: number;
  max: number;
  absorb: number;
  dead: boolean;
  /** Health recently gained from heals (deriveRecentHealGain), drawn as a pale chunk. */
  healGain?: number;
}

export interface MapSceneMarker {
  guid: string;
  sample: MapPositionSample;
  /** Every sample for this unit in the encounter, for interpolation. */
  positions: MapPositionSample[];
  point: MapPoint;
  color: string;
  kind: MapMarkerKind;
  muted: boolean;
  name: string;
  /** Health bar at the cursor, or null when the unit has none or it was decluttered. */
  health: MapUnitHealth | null;
  /** Creature entry used by the shared miniature registry (hostiles, pets, totems, etc.). */
  entry?: number;
  /** The 3D token's icon: a player's class icon, or null. */
  icon: string | null;
  /** Health at the cursor (0-1) for every unit with health data, or null. */
  healthFraction: number | null;
  /** A guardian's (pet, summon, totem) owning player. */
  owner?: string;
  /** Spell ids of the debuffs on this player at the cursor (the map tints it by their dispel type). */
  debuffs?: number[];
  /** Power at the cursor (0-1) and its raid-frame colour, for the column beside health; absent without power. */
  power?: { fraction: number; color: string };
}

export interface MapSceneGround {
  iconBaseUrl: string;
  canvas: WowMapLayer | WowMapInstanceFloor | WowMapRenderedInstance;
  overlays?: WowMapOverlay[];
}

/**
 * The ground while the dungeon mesh stands in for the tiles: no image (the
 * scene hides the tiles), just the mesh's world extent as a canvas, so markers,
 * fit and the camera keep the mesh's aspect. Its width spans world Y and its
 * height world X, as `renderedDungeonMapPoint` projects.
 */
function dungeonMeshCanvas(mesh: WowMapMeshInstance): WowMapInstanceFloor {
  return {
    floor: 0,
    width: mesh.bounds.maxY - mesh.bounds.minY,
    height: mesh.bounds.maxX - mesh.bounds.minX,
    tileWidth: 0,
    tileHeight: 0,
    bounds: mesh.bounds,
    tiles: [],
  };
}

// Tanks by inferRoles over the encounter's own damage and heal events,
// recomputed only when more events have streamed in.
const tankCache = new WeakMap<EncounterEffects, { count: number; tanks: ReadonlySet<string> }>();

function cachedTankGuids(fx: EncounterEffects, players: Record<string, { name: string; class: string }>): ReadonlySet<string> {
  const cached = tankCache.get(fx);
  if (cached && cached.count === fx.events.length) return cached.tanks;
  const damageTaken = new Map<string, number>();
  const healingDone = new Map<string, number>();
  const damageDone = new Map<string, number>();
  const add = (totals: Map<string, number>, guid: string, amount: number) => {
    if (players[guid]) totals.set(guid, (totals.get(guid) ?? 0) + amount);
  };
  for (const event of fx.events) {
    if (event.kind === "damage") {
      add(damageTaken, event.target, event.amount);
      add(damageDone, event.source, event.amount);
    } else if (event.kind === "heal") {
      add(healingDone, event.source, event.effective);
    }
  }
  const { roles } = inferRoles(damageTaken, healingDone, damageDone, players);
  const tanks = new Set([...roles.values()].filter((role) => role.role === "tank").map((role) => role.playerID));
  tankCache.set(fx, { count: fx.events.length, tanks });
  return tanks;
}

const debuffSpellIdCache = new WeakMap<Map<string, MapDebuff[]>, { count: number; ids: number[] }>();

// The distinct debuff spell ids in an encounter, cached (and kept the same
// array) until more debuffs stream in.
function encounterDebuffSpellIds(debuffsByUnit: Map<string, MapDebuff[]>): number[] {
  let count = 0;
  for (const debuffs of debuffsByUnit.values()) count += debuffs.length;
  const cached = debuffSpellIdCache.get(debuffsByUnit);
  if (cached && cached.count === count) return cached.ids;
  const ids = new Set<number>();
  for (const debuffs of debuffsByUnit.values()) for (const debuff of debuffs) ids.add(debuff.spellId);
  const result = [...ids].sort((left, right) => left - right);
  debuffSpellIdCache.set(debuffsByUnit, { count, ids: result });
  return result;
}

export type MapScene =
  | {
    status: "message";
    title: string;
    detail: string;
    /** While loading: the selected encounter's dungeon mesh, when the manifest has one, so it can be fetched early. */
    meshHint?: WowMapMeshInstance | null;
    /** Available when another floor may resolve the missing artwork. */
    floors?: number[];
    selectedFloorNumber?: number | null;
    setFloorNumber?: (floor: number) => void;
  }
  | {
    status: "ready";
    /** The scene replays the whole run: `autoFit` / `focusCentre` follow the party. */
    wholeRun: boolean;
    encounterId: string;
    mapName: string;
    displayedMapId: number;
    floors: number[];
    selectedFloorNumber: number | null;
    setFloorNumber: (floor: number) => void;
    overlayAvailable: boolean;
    syncEnabled: boolean;
    playing: boolean;
    playbackSpeed: number;
    cursorMs: number;
    /** The replayed encounter's span (the merged run's, across a whole run). */
    encounterStartMs: number;
    encounterEndMs: number;
    ground: MapSceneGround;
    /** The preferred 2D artwork retained while the active ground switches to mesh coordinates. */
    alignmentGround: MapSceneGround | null;
    markers: MapSceneMarker[];
    /** Every debuff spell seen on a player in the encounter (stable per encounter), to look up dispel types. */
    debuffSpellIds: number[];
    /** The world map the scene shows (the encounter's), which raid plans are drawn for. */
    worldMapId: number;
    /** Projects a sample onto the artwork with the same mapping as `markers`. */
    projectSample: (sample: MapPositionSample) => MapPoint | null;
    /** Boss-area bounds of the encounter's whole unit track; stable across replay ticks. */
    focusBounds: MapPointBounds | null;
    /** The auto-fit framing of `focusBounds`: a minimum span, centred on the boss when known. */
    autoFit: MapViewport | null;
    /** The boss's median position on the artwork (what `autoFit` centres on), or null when no boss is known. */
    focusCentre: MapPoint | null;
    /** Whether the view should start on `autoFit` (one boss encounter selected) rather than the full map. */
    fitByDefault: boolean;
    /** The instance's real dungeon mesh from the manifest (`instances[].mesh`), when the scene can place it. */
    mesh: WowMapMeshInstance | null;
    /** The instance has no map artwork, only `mesh`: the ground is always the mesh's extent and there is no 2D map. */
    meshOnly: boolean;
    /** The run's first sample and last event, in whole-run mode. */
    runStartMs: number | null;
    runEndMs: number | null;
    /** Combat events for the replay effects layer. */
    effects: EncounterEffects;
    bossGuids: ReadonlySet<string>;
    /** Players inferRoles takes for tanks; their heals get priority and numbers. */
    tankGuids: ReadonlySet<string>;
  };

export interface MapSceneOptions {
  /**
   * Project dungeon positions with the pure world transform instead of the
   * per-boss artwork calibration (Wailing Caverns): the 3D view's real
   * dungeon mesh is true geometry, so calibrated points would land off it.
   * The mesh entry's bounds become the canvas and the projection; without a
   * placeable mesh the option does nothing.
   */
  rawDungeonProjection?: boolean;
  /** Use the floor's automatic 2D source instead of forcing native artwork while the mesh is inactive. */
  preferRenderedCanvas?: boolean;
  /**
   * Replay every processed encounter as one run: the camera follows the
   * party's median position rather than a boss, and non-player units that
   * stopped reporting drop off the map.
   */
  wholeRun?: boolean;
  /** Reveal units suppressed by map-specific visibility rules. */
  showHiddenUnits?: boolean;
  /**
   * A clock of the scene's own for when the page's Replay is off (the mini
   * map's preview): `elapsedMs` of real time loops the encounter at
   * `previewSpeed(span)`. Ignored while Replay is on.
   */
  preview?: { elapsedMs: number; playing: boolean; maxSpeed?: number } | null;
}

/** How long one preview loop takes, whatever the fight's length. */
const PREVIEW_LOOP_MS = 90_000;

/** The preview's playback speed: a loop takes about PREVIEW_LOOP_MS, never slower than real time. */
export function previewSpeed(spanMs: number, maxSpeed = 32): number {
  return Math.max(1, Math.min(maxSpeed, Math.round(spanMs / PREVIEW_LOOP_MS)));
}

/** Where the preview is in the encounter after `elapsedMs` of real time, looping. */
export function previewCursorMs(startMs: number, endMs: number, elapsedMs: number, maxSpeed = 32): number {
  const span = Math.max(1, endMs - startMs);
  return startMs + ((elapsedMs * previewSpeed(span, maxSpeed)) % span);
}

/**
 * Everything the Map panel's views share: the encounter at the replay cursor,
 * the artwork canvas and the projected unit markers. Both the 2D and 3D views
 * consume this so filters, selection, floor and cursor stay identical.
 */
export function useMapScene(props: PanelRenderProps<MapResult>, options: MapSceneOptions = {}): MapScene {
  const sync = useSyncModeContextOptional();
  const iconBaseUrl = props.context.instance.iconBaseUrl;
  const manifestQuery = useMapManifest(iconBaseUrl);
  const timestampMs = sync?.enabled && sync.currentTimestamp ? sync.currentTimestamp.getTime() : null;
  const wholeRun = Boolean(options.wholeRun);
  const resultSignature = wholeRun ? runSignature(props.result.encounters) : "";
  const encounter = useMemo(
    () => wholeRun
      ? cachedRun(props.result.encounters)
      : selectMapEncounter(props.result.encounters, props.context.selectedEncounterIds, timestampMs),
    // resultSignature: the run is re-merged as the result streams in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.context.selectedEncounterIds, props.result.encounters, timestampMs, wholeRun, resultSignature],
  );
  const preview = !sync?.enabled ? options.preview ?? null : null;
  const cursorMs = timestampMs
    ?? (preview && encounter ? previewCursorMs(encounter.startMs, encounter.endMs, preview.elapsedMs, preview.maxSpeed) : encounter?.endMs)
    ?? null;
  const visibleUnits = useMemo(() => {
    if (!encounter || cursorMs === null) return [];
    return Array.from(encounter.positionsByUnit.entries()).flatMap(([guid, positions]) => {
      const player = props.context.instance.players?.[guid];
      const metadata = props.context.instance.units?.[guid];
      if (!player && !shouldShowMapUnit(
        props.context.instance.name,
        props.context.instance.flavor ?? [],
        metadata?.entry,
        options.showHiddenUnits,
      )) return [];
      const sample = replayPositionAt(positions, cursorMs, Boolean(player), wholeRun ? RUN_UNIT_STALE_MS : undefined);
      if (!sample) return [];
      // Across a run, nobody should glide between distant encounter samples or linger after telemetry stops.
      if (wholeRun && isStaleRunSample(sample, cursorMs)) return [];
      return [{ guid, sample, positions }];
    });
  }, [
    cursorMs,
    encounter,
    options.showHiddenUnits,
    props.context.instance.flavor,
    props.context.instance.name,
    props.context.instance.players,
    props.context.instance.units,
    wholeRun,
  ]);
  const mapId = dominantMapId(visibleUnits.map((unit) => unit.sample));
  const representativeSample = visibleUnits.find((unit) => unit.sample.mapId === mapId)?.sample;
  // A run has no single instance encounter: the first with a map stands in for artwork lookup.
  const instanceEncounter = wholeRun
    ? props.context.instance.encounters.find((candidate) => candidate.mapId)
    : props.context.instance.encounters.find((candidate) => candidate.id === encounter?.encounterId);
  const encounterMapId = instanceEncounter?.mapId ?? 0;
  const artworkMapId = encounterMapId || mapId;
  const normalizedUIMap = props.context.instance.positionCoordinateSpace === "ui-map-normalized";
  const artwork = manifestQuery.data && artworkMapId !== null
    ? resolveMapArtwork(
      manifestQuery.data,
      artworkMapId,
      normalizedUIMap ? undefined : representativeSample,
      props.context.instance.name,
    )
    : null;
  const [floorNumber, setFloorNumber] = useState<number | null>(null);

  if (!iconBaseUrl) return { status: "message", title: "Map artwork unavailable", detail: "This instance's dataset has no icon base URL." };
  if (manifestQuery.isLoading || props.loading) {
    // The selected encounter's map is known before its telemetry is processed:
    // name its mesh so the (large) download can start now.
    const selectedMapId = props.context.instance.encounters.find((candidate) => candidate.id === props.context.selectedEncounterIds[0])?.mapId;
    const hintArtwork = manifestQuery.data && selectedMapId ? resolveMapArtwork(manifestQuery.data, selectedMapId, undefined, props.context.instance.name) : null;
    const meshHint = hintArtwork?.kind === "instance" ? placeableDungeonMesh(hintArtwork.instance.mesh) : null;
    return { status: "message", title: "Loading map", detail: "Fetching artwork and position telemetry…", meshHint };
  }
  if (manifestQuery.error) return { status: "message", title: "Map artwork unavailable", detail: manifestQuery.error.message };
  if (!encounter || visibleUnits.length === 0 || mapId === null || cursorMs === null) {
    return { status: "message", title: "No position telemetry", detail: "This encounter does not contain unit-position data." };
  }
  if (!artwork) return { status: "message", title: `Map ${artworkMapId} is unavailable`, detail: "The active dataset does not publish artwork for this world map." };

  const zoneSelection = artwork.kind === "zone"
    ? artwork.map.art?.flatMap((art) => art.layers.map((layer) => ({ art, layer })))
      .find(({ layer }) => layer.width > 0 && layer.height > 0 && layer.tiles.length > 0)
    : undefined;
  const selectedFloorNumber = artwork.kind === "instance"
    ? resolveMapFloorNumber(
      artwork.instance,
      floorNumber,
      visibleUnits.filter((unit) => unit.sample.mapId === mapId).map((unit) => unit.sample),
    )
    : null;
  const selectedFloor = artwork.kind === "instance"
    ? artwork.instance.floors.find((floor) => floor.floor === selectedFloorNumber) ?? artwork.instance.floors[0]
    : undefined;
  // The active floor owns its mesh and render when published; legacy
  // instance-level assets remain the fallback. Normalized UI-map positions
  // still map onto the mesh by their floor percentages when 3D is selected.
  const mesh = artwork.kind === "instance"
    ? replayDungeonMesh(artwork.instance, selectedFloor)
    : null;
  const availableFlatCanvas = artwork.kind === "instance"
    ? replayDungeonCanvasForCoordinates(
      artwork.instance,
      selectedFloor,
      normalizedUIMap,
      Boolean(options.preferRenderedCanvas) || !selectedFloor?.bounds,
    )
    : null;
  // A mesh-only floor has no native or calibrated 2D canvas to fall back on,
  // so its mesh is the canvas from the start, not only once asked.
  const meshOnly = artwork.kind === "instance" && mesh !== null && availableFlatCanvas === null;
  const rawProjection = (Boolean(options.rawDungeonProjection) || meshOnly) && mesh !== null;
  const meshCanvas = rawProjection && mesh ? dungeonMeshCanvas(mesh) : null;
  const flatCanvas = !meshCanvas ? availableFlatCanvas : null;
  const renderCanvas = flatCanvas?.rendered ? flatCanvas.canvas : null;
  const canvas = artwork.kind === "zone" ? zoneSelection?.layer : meshCanvas ?? flatCanvas?.canvas;
  if (!canvas) return {
    status: "message",
    title: "Map artwork unavailable",
    detail: "No renderable map layer was published for this floor. Choose another floor to try its artwork.",
    ...(artwork.kind === "instance" ? {
      floors: artwork.instance.floors.map((floor) => floor.floor),
      selectedFloorNumber,
      setFloorNumber,
    } : {}),
  };

  const dungeonBounds = artwork.kind === "instance" ? meshCanvas?.bounds ?? flatCanvas?.canvas.bounds ?? null : null;
  const dungeonCalibration = artwork.kind === "instance" && encounter && !rawProjection && !renderCanvas
    ? resolveDungeonMapCalibration(
      artwork.instance.mapID,
      encounter,
      (guid) => props.context.instance.units?.[guid]?.entry,
    )
    : null;
  const overlayAvailable = normalizedUIMap || (Boolean(dungeonBounds)
    && (artwork.kind !== "instance" || artwork.instance.mapID !== 43 || rawProjection || renderCanvas !== null || dungeonCalibration !== null));
  const projectSample = (sample: MapPositionSample): MapPoint | null => normalizedUIMap
    ? uiMapPoint(sample)
    : artwork.kind === "zone"
      ? zoneMapPoint(sample, artwork.assignment)
      : dungeonBounds && overlayAvailable
        ? meshCanvas || renderCanvas
          ? renderedDungeonMapPoint(sample, dungeonBounds)
          : dungeonCalibration
            ? calibratedDungeonMapPoint(sample, dungeonBounds, dungeonCalibration)
            : dungeonMapPoint(sample, dungeonBounds)
        : null;

  const projectionKey = artwork.kind === "zone"
    ? `zone:${artwork.map.id}:${artwork.assignment.id}`
    : `instance:${artwork.instance.mapID}:${selectedFloorNumber}:${overlayAvailable}:${normalizedUIMap ? "ui-map" : meshCanvas ? "mesh" : renderCanvas ? "render" : "calibrated"}`;

  const selectedPlayers = props.context.entitySelection.playerIds;
  const bossGuids = new Set((wholeRun ? props.context.instance.encounters : instanceEncounter ? [instanceEncounter] : [])
    .flatMap((candidate) => candidate.enemies?.filter((enemy) => enemy.boss).map((enemy) => enemy.id) ?? []));
  const markers = visibleUnits.flatMap(({ guid, sample, positions }): MapSceneMarker[] => {
    if (sample.mapId !== mapId) return [];
    if (sample.floor !== undefined && selectedFloorNumber !== null && sample.floor !== selectedFloorNumber) return [];
    const point = projectSample(sample);
    if (!point) return [];
    const player = props.context.instance.players?.[guid];
    const metadata = props.context.instance.units?.[guid];
    const ownerGuid = metadata?.owner?.toString();
    const owner = ownerGuid ? props.context.instance.players?.[ownerGuid] : undefined;
    const kind: MapMarkerKind = player ? "player" : owner ? "pet" : "hostile";
    return [{
      guid,
      sample,
      positions,
      point,
      color: player ? getClassColorVar(player.class) : kind === "pet" ? "#67e8f9" : "#fb7185",
      kind,
      muted: Boolean(player) && selectedPlayers.size > 0 && !selectedPlayers.has(guid),
      name: player?.name ?? metadata?.name ?? guid,
      health: null,
      entry: metadata?.entry,
      ...(kind === "pet" && ownerGuid ? { owner: ownerGuid } : {}),
      icon: player ? `/c/icons/class_${player.class.toLowerCase().replace(/\s+/g, "")}.png` : null,
      healthFraction: null,
    }];
  });
  const bars = selectHealthBars(markers.map((marker) => marker.guid), encounter.healthByUnit, cursorMs, bossGuids, selectedPlayers);
  for (const marker of markers) {
    const debuffs = encounter.debuffsByUnit.get(marker.guid);
    if (debuffs) marker.debuffs = activeDebuffsAt(debuffs, cursorMs);
    const latest = latestHealthAt(encounter.healthByUnit.get(marker.guid) ?? [], cursorMs);
    if (latest && latest.max > 0) marker.healthFraction = Math.min(1, Math.max(0, latest.current / latest.max));
    if (latest?.maxPower && latest.power !== undefined) {
      marker.power = { fraction: Math.min(1, Math.max(0, latest.power / latest.maxPower)), color: POWER_COLORS[latest.powerType ?? ""] ?? "#767676" };
    }
    const sample = bars.get(marker.guid);
    if (sample) {
      marker.health = {
        current: sample.current,
        max: sample.max,
        absorb: sample.absorb,
        dead: isDeadAt(encounter.effects, marker.guid, cursorMs),
        healGain: deriveRecentHealGain(encounter.effects, marker.guid, cursorMs),
      };
    }
  }
  // The run's camera follows the party, so the bounds scan of the whole run is skipped.
  const focus = wholeRun ? null : cachedFocusBounds(
    encounter.positionsByUnit,
    `${mapId}|${projectionKey}|${[...bossGuids].join(",")}`,
    () => {
      const bounds = unitFocusBounds(encounter.positionsByUnit, mapId, projectSample, bossGuids);
      const centre = focusCentre(encounter.positionsByUnit, mapId, bossGuids);
      if (!bounds || !centre) return null;
      const centrePoint = centre.fromFocus ? projectSample(centre.sample) : null;
      return {
        bounds,
        autoFit: autoFitViewport(bounds, {
          minSpanYards: AUTO_FIT_MIN_SPAN_YARDS,
          scale: normalizedUIMap ? null : projectionScale(projectSample, centre.sample),
          centre: centrePoint,
        }),
        centre: centrePoint,
      };
    },
  );

  let followCentre: MapPoint | null = null;
  let followViewport: MapViewport | null = null;
  if (wholeRun) {
    const centre = groupCentre(markers.filter((marker) => marker.kind === "player").map((marker) => marker.point));
    const reference = markers.find((marker) => marker.kind === "player")?.sample;
    if (centre && reference) {
      const snap = (value: number) => Math.round(value / 100 / FOLLOW_GRID) * FOLLOW_GRID * 100;
      followCentre = { leftPercent: snap(centre.leftPercent), topPercent: snap(centre.topPercent) };
      followViewport = autoFitViewport(
        { minLeft: followCentre.leftPercent, maxLeft: followCentre.leftPercent, minTop: followCentre.topPercent, maxTop: followCentre.topPercent },
        { minSpanYards: FOLLOW_SPAN_YARDS, scale: normalizedUIMap ? null : projectionScale(projectSample, reference), centre: followCentre },
      );
    }
  }

  const tankGuids = cachedTankGuids(encounter.effects, props.context.instance.players ?? {});

  return {
    status: "ready",
    wholeRun,
    encounterId: encounter.encounterId,
    mapName: artwork.kind === "zone" ? artwork.map.name : artwork.instance.name,
    displayedMapId: artwork.kind === "instance" ? artwork.instance.mapID : mapId,
    floors: artwork.kind === "instance" ? artwork.instance.floors.map((floor) => floor.floor) : [],
    selectedFloorNumber,
    setFloorNumber,
    overlayAvailable: artwork.kind !== "instance" || overlayAvailable,
    syncEnabled: Boolean(sync?.enabled),
    playing: preview ? preview.playing : Boolean(sync?.enabled && sync.isPlaying),
    playbackSpeed: preview ? previewSpeed(encounter.endMs - encounter.startMs, preview.maxSpeed) : sync?.playbackSpeed ?? 1,
    cursorMs,
    encounterStartMs: encounter.startMs,
    encounterEndMs: encounter.endMs,
    ground: {
      iconBaseUrl,
      canvas,
      overlays: artwork.kind === "zone" ? zoneSelection?.art.overlays : undefined,
    },
    alignmentGround: artwork.kind === "instance" && availableFlatCanvas
      ? { iconBaseUrl, canvas: availableFlatCanvas.canvas }
      : null,
    markers,
    debuffSpellIds: encounterDebuffSpellIds(encounter.debuffsByUnit),
    worldMapId: artworkMapId ?? mapId,
    projectSample,
    focusBounds: focus?.bounds ?? null,
    autoFit: wholeRun ? followViewport : focus?.autoFit ?? null,
    focusCentre: wholeRun ? followCentre : focus?.centre ?? null,
    mesh,
    meshOnly,
    fitByDefault: wholeRun
      ? followViewport !== null
      : props.context.selectedEncounterIds.length === 1 && Boolean(instanceEncounter?.boss),
    runStartMs: wholeRun ? encounter.startMs : null,
    runEndMs: wholeRun ? encounter.endMs : null,
    effects: encounter.effects,
    bossGuids,
    tankGuids,
  };
}

