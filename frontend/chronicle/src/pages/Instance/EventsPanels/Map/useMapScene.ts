import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import {
  mapManifestUrl,
  WOW_MAP_MANIFEST_FORMAT,
  type WowMapInstanceFloor,
  type WowMapLayer,
  type WowMapManifest,
  type WowMapOverlay,
} from "@/pages/Technical/mapGallery";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import type { PanelRenderProps } from "../types";
import type { MapPositionSample, MapResult } from "./map.processor";
import type { EncounterEffects } from "./replayEffects";
import {
  calibratedDungeonMapPoint,
  dominantMapId,
  dungeonMapPoint,
  latestPositionAt,
  resolveDungeonMapCalibration,
  resolveMapArtwork,
  selectMapEncounter,
  unitFocusBounds,
  zoneMapPoint,
  type MapPoint,
  type MapPointBounds,
} from "./mapModel";

// Fit bounds scan the encounter's whole track, so cache them per encounter
// and projection instead of recomputing on every replay tick.
const focusBoundsCache = new WeakMap<Map<string, MapPositionSample[]>, Map<string, MapPointBounds | null>>();

function cachedFocusBounds(
  positionsByUnit: Map<string, MapPositionSample[]>,
  key: string,
  compute: () => MapPointBounds | null,
): MapPointBounds | null {
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
      if (manifest.format !== WOW_MAP_MANIFEST_FORMAT) {
        throw new Error(`Unsupported map manifest format: ${manifest.format || "missing"}`);
      }
      return manifest;
    },
  });
}

export type MapMarkerKind = "player" | "pet" | "hostile";

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
}

export interface MapSceneGround {
  iconBaseUrl: string;
  canvas: WowMapLayer | WowMapInstanceFloor;
  overlays?: WowMapOverlay[];
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
    /** Whether the view should start framed on `focusBounds` rather than the full map. */
    fitByDefault: boolean;
    /** Combat events for the replay effects layer. */
    effects: EncounterEffects;
    bossGuids: ReadonlySet<string>;
  };

/**
 * Everything the Map panel's views share: the encounter at the replay cursor,
 * the artwork canvas and the projected unit markers. Both the 2D and 3D views
 * consume this so filters, selection, floor and cursor stay identical.
 */
export function useMapScene(props: PanelRenderProps<MapResult>): MapScene {
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
  const canvas = artwork.kind === "zone" ? zoneSelection?.layer : selectedFloor;
  if (!canvas) return { status: "message", title: "Map artwork unavailable", detail: "No renderable map layer was published." };

  const dungeonBounds = artwork.kind === "instance" ? selectedFloor?.bounds ?? null : null;
  const dungeonCalibration = artwork.kind === "instance" && encounter
    ? resolveDungeonMapCalibration(
      artwork.instance.mapID,
      encounter,
      (guid) => props.context.instance.units?.[guid]?.entry,
    )
    : null;
  const overlayAvailable = Boolean(dungeonBounds)
    && (artwork.kind !== "instance" || artwork.instance.mapID !== 43 || dungeonCalibration !== null);
  const projectSample = (sample: MapPositionSample): MapPoint | null => artwork.kind === "zone"
    ? zoneMapPoint(sample, artwork.assignment)
    : dungeonBounds && overlayAvailable
      ? dungeonCalibration
        ? calibratedDungeonMapPoint(sample, dungeonBounds, dungeonCalibration)
        : dungeonMapPoint(sample, dungeonBounds)
      : null;

  const selectedPlayers = props.context.entitySelection.playerIds;
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
    }];
  });

  const bossGuids = new Set(instanceEncounter?.enemies?.filter((enemy) => enemy.boss).map((enemy) => enemy.id));
  const projectionKey = artwork.kind === "zone"
    ? `zone:${artwork.map.id}:${artwork.assignment.id}`
    : `instance:${artwork.instance.mapID}:${selectedFloorNumber}:${overlayAvailable}`;
  const focusBounds = cachedFocusBounds(
    encounter.positionsByUnit,
    `${mapId}|${projectionKey}|${[...bossGuids].join(",")}`,
    () => unitFocusBounds(encounter.positionsByUnit, mapId, projectSample, bossGuids),
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
    focusBounds,
    fitByDefault: Boolean(sync?.enabled) && props.context.selectedEncounterIds.length === 1,
    effects: encounter.effects,
    bossGuids,
  };
}
