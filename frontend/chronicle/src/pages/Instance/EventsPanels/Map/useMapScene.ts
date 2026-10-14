import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import {
  mapManifestUrl,
  isSupportedMapManifestFormat,
  type WowMapFloorBounds,
  type WowMapInstanceFloor,
  type WowMapLayer,
  type WowMapManifest,
  type WowMapOverlay,
  type WowMapRenderedInstance,
} from "@/pages/Technical/mapGallery";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import type { PanelRenderProps } from "../types";
import type { DungeonMeshFrame } from "./dungeonMeshes";
import type { MapPositionSample, MapResult } from "./map.processor";
import { inferRoles } from "../Roles/roles.processor";
import { deriveRecentHealGain, isDeadAt, type EncounterEffects } from "./replayEffects";
import {
  AUTO_FIT_MIN_SPAN_YARDS,
  autoFitViewport,
  calibratedDungeonMapPoint,
  dominantMapId,
  dungeonMapPoint,
  focusCentre,
  latestPositionAt,
  projectionScale,
  renderedDungeonMapPoint,
  resolveDungeonMapCalibration,
  resolveMapArtwork,
  selectHealthBars,
  selectMapEncounter,
  unitFocusBounds,
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

function useMapManifest(iconBaseUrl: string | undefined) {
  return useQuery({
    queryKey: ["wow-map-manifest", iconBaseUrl],
    enabled: Boolean(iconBaseUrl),
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const response = await fetch(mapManifestUrl(iconBaseUrl!));
      if (!response.ok) throw new Error(`Map manifest request failed with ${response.status}`);
      const manifest = await response.json() as WowMapManifest;
      if (!isSupportedMapManifestFormat(manifest.format)) {
        throw new Error(`Unsupported map manifest format: ${manifest.format || "missing"}`);
      }
      return manifest;
    },
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
  /** NPC entry of a hostile unit, for its boss miniature. */
  entry?: number;
}

export interface MapSceneGround {
  iconBaseUrl: string;
  canvas: WowMapLayer | WowMapInstanceFloor | WowMapRenderedInstance;
  overlays?: WowMapOverlay[];
}

/** The world bounds a dungeon mesh is placed by, and which map image's projection they belong to. */
export interface MapSceneMeshFrame {
  bounds: WowMapFloorBounds;
  frame: DungeonMeshFrame;
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

export type MapScene =
  | { status: "message"; title: string; detail: string }
  | {
    status: "ready";
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
    ground: MapSceneGround;
    markers: MapSceneMarker[];
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
    /**
     * How a real dungeon mesh lines up with this instance: the rendered map's
     * bounds when it has one (the same WMO geometry as the mesh), else the
     * artwork floor's bounds; null for zones and floors without bounds.
     */
    meshFrame: MapSceneMeshFrame | null;
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
   * When the instance has a rendered map, it becomes the canvas and the
   * projection (`meshFrame`); otherwise the artwork floor's raw bounds do.
   */
  rawDungeonProjection?: boolean;
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
  const encounter = useMemo(
    () => selectMapEncounter(props.result.encounters, props.context.selectedEncounterIds, timestampMs),
    [props.context.selectedEncounterIds, props.result.encounters, timestampMs],
  );
  const cursorMs = timestampMs ?? encounter?.endMs ?? null;
  const visibleUnits = useMemo(() => {
    if (!encounter || cursorMs === null) return [];
    return Array.from(encounter.positionsByUnit.entries()).flatMap(([guid, positions]) => {
      const sample = latestPositionAt(positions, cursorMs);
      return sample ? [{ guid, sample, positions }] : [];
    });
  }, [cursorMs, encounter]);
  const mapId = dominantMapId(visibleUnits.map((unit) => unit.sample));
  const representativeSample = visibleUnits.find((unit) => unit.sample.mapId === mapId)?.sample;
  const instanceEncounter = props.context.instance.encounters
    .find((candidate) => candidate.id === encounter?.encounterId);
  const encounterMapId = instanceEncounter?.mapId ?? 0;
  const artworkMapId = encounterMapId || mapId;
  const artwork = manifestQuery.data && artworkMapId !== null
    ? resolveMapArtwork(manifestQuery.data, artworkMapId, representativeSample, props.context.instance.name)
    : null;
  const [floorNumber, setFloorNumber] = useState<number | null>(null);

  if (!iconBaseUrl) return { status: "message", title: "Map artwork unavailable", detail: "This instance's dataset has no icon base URL." };
  if (manifestQuery.isLoading || props.loading) return { status: "message", title: "Loading map", detail: "Fetching artwork and position telemetry…" };
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
    && artwork.instance.floors.some((floor) => floor.floor === floorNumber)
    ? floorNumber
    : artwork.kind === "instance" ? artwork.instance.floors[0]?.floor ?? null : null;
  const selectedFloor = artwork.kind === "instance"
    ? artwork.instance.floors.find((floor) => floor.floor === selectedFloorNumber) ?? artwork.instance.floors[0]
    : undefined;
  const renderedMap = artwork.kind === "instance" && artwork.instance.rendered
    && artwork.instance.rendered.width > 0 && artwork.instance.rendered.height > 0
    ? artwork.instance.rendered
    : null;
  const rawProjection = Boolean(options.rawDungeonProjection);
  // The mesh frame: the rendered map is drawn from the mesh's own geometry.
  const meshCanvas = rawProjection ? renderedMap : null;
  const canvas = artwork.kind === "zone" ? zoneSelection?.layer : meshCanvas ?? selectedFloor;
  if (!canvas) return { status: "message", title: "Map artwork unavailable", detail: "No renderable map layer was published." };

  const dungeonBounds = artwork.kind === "instance" ? meshCanvas?.bounds ?? selectedFloor?.bounds ?? null : null;
  const meshFrame: MapSceneMeshFrame | null = artwork.kind !== "instance"
    ? null
    : renderedMap
      ? { bounds: renderedMap.bounds, frame: "rendered" }
      : selectedFloor?.bounds
        ? { bounds: selectedFloor.bounds, frame: "artwork" }
        : null;
  const dungeonCalibration = artwork.kind === "instance" && encounter && !rawProjection
    ? resolveDungeonMapCalibration(
      artwork.instance.mapID,
      encounter,
      (guid) => props.context.instance.units?.[guid]?.entry,
    )
    : null;
  const overlayAvailable = Boolean(dungeonBounds)
    && (artwork.kind !== "instance" || artwork.instance.mapID !== 43 || rawProjection || dungeonCalibration !== null);
  const projectSample = (sample: MapPositionSample): MapPoint | null => artwork.kind === "zone"
    ? zoneMapPoint(sample, artwork.assignment)
    : dungeonBounds && overlayAvailable
      ? meshCanvas
        ? renderedDungeonMapPoint(sample, dungeonBounds)
        : dungeonCalibration
          ? calibratedDungeonMapPoint(sample, dungeonBounds, dungeonCalibration)
          : dungeonMapPoint(sample, dungeonBounds)
      : null;

  const selectedPlayers = props.context.entitySelection.playerIds;
  const bossGuids = new Set(instanceEncounter?.enemies?.filter((enemy) => enemy.boss).map((enemy) => enemy.id));
  const markers = visibleUnits.flatMap(({ guid, sample, positions }): MapSceneMarker[] => {
    if (sample.mapId !== mapId) return [];
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
      entry: kind === "hostile" ? metadata?.entry : undefined,
    }];
  });
  const bars = selectHealthBars(markers.map((marker) => marker.guid), encounter.healthByUnit, cursorMs, bossGuids, selectedPlayers);
  for (const marker of markers) {
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
  const projectionKey = artwork.kind === "zone"
    ? `zone:${artwork.map.id}:${artwork.assignment.id}`
    : `instance:${artwork.instance.mapID}:${selectedFloorNumber}:${overlayAvailable}:${meshCanvas ? "rendered" : rawProjection ? "raw" : "calibrated"}`;
  const focus = cachedFocusBounds(
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
          scale: projectionScale(projectSample, centre.sample),
          centre: centrePoint,
        }),
        centre: centrePoint,
      };
    },
  );

  return {
    status: "ready",
    encounterId: encounter.encounterId,
    mapName: artwork.kind === "zone" ? artwork.map.name : artwork.instance.name,
    displayedMapId: artwork.kind === "instance" ? artwork.instance.mapID : mapId,
    floors: artwork.kind === "instance" ? artwork.instance.floors.map((floor) => floor.floor) : [],
    selectedFloorNumber,
    setFloorNumber,
    overlayAvailable: artwork.kind !== "instance" || overlayAvailable,
    syncEnabled: Boolean(sync?.enabled),
    playing: Boolean(sync?.enabled && sync.isPlaying),
    playbackSpeed: sync?.playbackSpeed ?? 1,
    cursorMs,
    ground: {
      iconBaseUrl,
      canvas,
      overlays: artwork.kind === "zone" ? zoneSelection?.art.overlays : undefined,
    },
    markers,
    projectSample,
    focusBounds: focus?.bounds ?? null,
    autoFit: focus?.autoFit ?? null,
    focusCentre: focus?.centre ?? null,
    meshFrame,
    fitByDefault: props.context.selectedEncounterIds.length === 1 && Boolean(instanceEncounter?.boss),
    effects: encounter.effects,
    bossGuids,
    tankGuids: cachedTankGuids(encounter.effects, props.context.instance.players ?? {}),
  };
}

