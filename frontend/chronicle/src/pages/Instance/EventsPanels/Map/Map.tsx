/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated view components intentionally share this module. */
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon, Navigation, PawPrint, Skull, Users } from "lucide-react";
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import {
  mapAssetUrl,
  mapManifestUrl,
  overlayTilePlacement,
  tilePlacement,
  WOW_MAP_MANIFEST_FORMAT,
  type WowMapInstanceFloor,
  type WowMapLayer,
  type WowMapRenderedInstance,
  type WowMapManifest,
  type WowMapOverlay,
} from "@/pages/Technical/mapGallery";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { useSmoothReplayTime } from "../RotationTimeline/useSmoothReplayTime";
import type { UnitPositionProcessorEvent } from "../processorTypes";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { mapProcessor, type MapPositionSample, type MapResult } from "./map.processor";
import {
  dominantMapId,
  fitMapViewport,
  interpolatedPositionAt,
  pointInMapViewport,
  projectDungeonMapPoint,
  resolveDungeonMapCalibration,
  resolveMapArtwork,
  selectMapEncounter,
  zoneMapPoint,
  type MapPoint,
} from "./mapModel";

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

function MapTiles({
  canvas,
  iconBaseUrl,
  overlays,
}: {
  canvas: WowMapLayer | WowMapInstanceFloor;
  iconBaseUrl: string;
  overlays?: WowMapOverlay[];
}) {
  return (
    <>
      {canvas.tiles.map((tile) => (
        <img
          key={`base-${tile.row}-${tile.column}-${tile.fileDataID}`}
          src={mapAssetUrl(iconBaseUrl, tile.path)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none select-none"
          style={tilePlacement(canvas, tile)}
        />
      ))}
      {overlays?.flatMap((overlay) => overlay.tiles.map((tile) => (
        <img
          key={`overlay-${overlay.id}-${tile.row}-${tile.column}-${tile.fileDataID}`}
          src={mapAssetUrl(iconBaseUrl, tile.path)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute max-w-none select-none"
          style={overlayTilePlacement(canvas as WowMapLayer, overlay, tile)}
        />
      )))}
    </>
  );
}

function MapBackground({
  canvas,
  iconBaseUrl,
  overlays,
}: {
  canvas: WowMapLayer | WowMapInstanceFloor | WowMapRenderedInstance;
  iconBaseUrl: string;
  overlays?: WowMapOverlay[];
}) {
  if ("source" in canvas) {
    return (
      <img
        src={mapAssetUrl(iconBaseUrl, canvas.path)}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 size-full select-none object-contain"
      />
    );
  }
  return <MapTiles canvas={canvas} iconBaseUrl={iconBaseUrl} overlays={overlays} />;
}

interface VisibleUnit {
  guid: string;
  sample: MapPositionSample;
}

interface MapTrack {
  key: string;
  guid: string;
  points: MapPoint[];
}

function unitAppearance(guid: string, props: PanelRenderProps<MapResult>) {
  const player = props.context.instance.players?.[guid];
  const metadata = props.context.instance.units?.[guid];
  const ownerGuid = metadata?.owner?.toString();
  const owner = ownerGuid ? props.context.instance.players?.[ownerGuid] : undefined;
  const isPet = !player && Boolean(owner);
  return {
    player,
    isPet,
    name: player?.name ?? metadata?.name ?? guid,
    color: player ? getClassColorVar(player.class) : isPet ? "#67e8f9" : "#fb7185",
  };
}

function MapMarker({ unit, props, point }: {
  unit: VisibleUnit;
  props: PanelRenderProps<MapResult>;
  point: MapPoint;
}) {
  const appearance = unitAppearance(unit.guid, props);
  const selectedPlayers = props.context.entitySelection.playerIds;
  const muted = appearance.player && selectedPlayers.size > 0 && !selectedPlayers.has(unit.guid);

  return (
    <div
      className="group absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-75 ease-linear"
      style={{ left: `${point.leftPercent}%`, top: `${point.topPercent}%`, opacity: muted ? 0.28 : 1 }}
      title={`${appearance.name} · ${unit.sample.x.toFixed(1)}, ${unit.sample.y.toFixed(1)}`}
      role="img"
      aria-label={`${appearance.name} position`}
    >
      <div
        className="relative flex size-7 items-center justify-center rounded-full border-2 bg-black/85 shadow-[0_1px_8px_rgba(0,0,0,.95)]"
        style={{ borderColor: appearance.color }}
      >
        {appearance.player ? (
          <ClassIcon cls={appearance.player.class} className="size-5 rounded-full object-cover" />
        ) : appearance.isPet ? (
          <PawPrint className="size-4 text-cyan-100" />
        ) : (
          <Skull className="size-4 text-rose-100" />
        )}
        <Navigation
          className="absolute -top-2 left-1/2 size-3 -translate-x-1/2 fill-white text-black drop-shadow"
          style={{ transform: `translateX(-50%) rotate(${unit.sample.facing}rad)` }}
        />
      </div>
      <span className="pointer-events-none absolute left-1/2 top-full mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/90 px-1.5 py-0.5 text-[9px] font-medium text-white shadow-lg group-hover:block">
        {appearance.name}
      </span>
    </div>
  );
}

function MapContent(props: PanelRenderProps<MapResult>) {
  const sync = useSyncModeContextOptional();
  const iconBaseUrl = props.context.instance.iconBaseUrl;
  const manifestQuery = useMapManifest(iconBaseUrl);
  const replayTimestampMs = sync?.enabled && sync.currentTimestamp ? sync.currentTimestamp.getTime() : null;
  const smoothTimestampMs = useSmoothReplayTime(
    replayTimestampMs,
    Boolean(sync?.enabled && sync.isPlaying),
    sync?.playbackSpeed ?? 1,
  );
  const selectedEncounters = useMemo(() => props.context.selectedEncounterIds
    .map((id) => props.result.encounters.get(id))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => left.startMs - right.startMs), [props.context.selectedEncounterIds, props.result.encounters]);
  const encounter = useMemo(
    () => selectMapEncounter(props.result.encounters, props.context.selectedEncounterIds, smoothTimestampMs),
    [props.context.selectedEncounterIds, props.result.encounters, smoothTimestampMs],
  );
  const cursorMs = sync?.enabled ? smoothTimestampMs : encounter?.endMs ?? null;
  const visibleUnits = useMemo(() => {
    if (!encounter || cursorMs === null) return [];
    return Array.from(encounter.positionsByUnit.entries()).flatMap(([guid, positions]) => {
      const sample = interpolatedPositionAt(positions, cursorMs);
      return sample ? [{ guid, sample }] : [];
    });
  }, [cursorMs, encounter]);
  const representativeSamples = useMemo(() => selectedEncounters.flatMap((selectedEncounter) =>
    Array.from(selectedEncounter.positionsByUnit.values()).flatMap((positions) => positions.at(-1) ?? []),
  ), [selectedEncounters]);
  const mapId = dominantMapId(representativeSamples);
  const representativeSample = representativeSamples.find((sample) => sample.mapId === mapId);
  const encounterMapId = props.context.instance.encounters
    .find((candidate) => candidate.id === encounter?.encounterId)?.mapId ?? 0;
  const artworkMapId = encounterMapId || mapId;
  const artwork = manifestQuery.data && artworkMapId !== null
    ? resolveMapArtwork(manifestQuery.data, artworkMapId, representativeSample, props.context.instance.name)
    : null;
  const [floorNumber, setFloorNumber] = useState<number | null>(null);

  const zoneSelection = artwork?.kind === "zone"
    ? artwork.map.art?.flatMap((art) => art.layers.map((layer) => ({ art, layer })))
      .find(({ layer }) => layer.width > 0 && layer.height > 0 && layer.tiles.length > 0)
    : undefined;
  const renderedMap = artwork?.kind === "instance" ? artwork.instance.rendered : undefined;
  const selectedFloorNumber = artwork?.kind === "instance"
    && artwork.instance.floors.some((floor) => floor.floor === floorNumber)
    ? floorNumber
    : artwork?.kind === "instance" ? artwork.instance.floors[0]?.floor ?? null : null;
  const selectedFloor = artwork?.kind === "instance"
    ? artwork.instance.floors.find((floor) => floor.floor === selectedFloorNumber) ?? artwork.instance.floors[0]
    : undefined;
  const canvas = artwork?.kind === "zone" ? zoneSelection?.layer : renderedMap ?? selectedFloor;
  const dungeonBounds = artwork?.kind === "instance" ? renderedMap?.bounds ?? selectedFloor?.bounds ?? null : null;
  const dungeonCalibration = artwork?.kind === "instance" && encounter && !renderedMap
    ? resolveDungeonMapCalibration(
      artwork.instance.mapID,
      encounter,
      (guid) => props.context.instance.units?.[guid]?.entry,
    )
    : null;
  const activeDungeonOverlayAvailable = Boolean(dungeonBounds)
    && (Boolean(renderedMap) || artwork?.kind !== "instance" || artwork.instance.mapID !== 43 || dungeonCalibration !== null);

  const projectSample = useCallback((
    sample: MapPositionSample,
    calibration = dungeonCalibration,
  ): MapPoint | null => {
    if (!artwork || sample.mapId !== mapId) return null;
    if (artwork.kind === "zone") return zoneMapPoint(sample, artwork.assignment);
    if (!dungeonBounds) return null;
    return projectDungeonMapPoint(sample, dungeonBounds, artwork.instance.mapID, calibration, Boolean(renderedMap));
  }, [artwork, dungeonBounds, dungeonCalibration, mapId, renderedMap]);

  const tracks = useMemo<MapTrack[]>(() => {
    if (!artwork) return [];
    return selectedEncounters.flatMap((selectedEncounter) => {
      const calibration = artwork.kind === "instance" && !renderedMap
        ? resolveDungeonMapCalibration(
          artwork.instance.mapID,
          selectedEncounter,
          (guid) => props.context.instance.units?.[guid]?.entry,
        )
        : null;
      return Array.from(selectedEncounter.positionsByUnit.entries()).flatMap(([guid, positions]) => {
        const step = Math.max(1, Math.ceil(positions.length / 300));
        const points = positions.flatMap((sample, index) => {
          if (index % step !== 0 && index !== positions.length - 1) return [];
          const point = projectSample(sample, calibration);
          return point ? [point] : [];
        });
        return points.length > 0 ? [{ key: `${selectedEncounter.encounterId}-${guid}`, guid, points }] : [];
      });
    });
  }, [artwork, projectSample, props.context.instance.units, renderedMap, selectedEncounters]);

  const markers = visibleUnits.flatMap((unit) => {
    const point = projectSample(unit.sample);
    return point ? [{ unit, point }] : [];
  });
  const mapOverlayAvailable = artwork?.kind !== "instance"
    || (sync?.enabled ? activeDungeonOverlayAvailable : tracks.length > 0 || markers.length > 0);
  const viewport = fitMapViewport([
    ...tracks.flatMap((track) => track.points),
    ...markers.map((marker) => marker.point),
  ]);
  const viewportMarkers = markers.map(({ unit, point }) => ({
    unit,
    point: pointInMapViewport(point, viewport),
  }));
  const mapScale = 100 / viewport.spanPercent;

  if (!iconBaseUrl) return <MapMessage title="Map assets unavailable" detail="This instance's dataset has no icon base URL." />;
  if (manifestQuery.isLoading || props.loading) return <MapMessage title="Loading map" detail="Fetching map assets and position telemetry…" />;
  if (manifestQuery.error) return <MapMessage title="Map assets unavailable" detail={manifestQuery.error.message} />;
  if (!encounter || representativeSamples.length === 0 || mapId === null) {
    return <MapMessage title="No position telemetry" detail="The selected fights do not contain unit-position data." />;
  }
  if (!artwork) return <MapMessage title={`Map ${artworkMapId} is unavailable`} detail="The active dataset does not publish artwork or rendered geometry for this world map." />;
  if (!canvas) return <MapMessage title="Map assets unavailable" detail="No renderable map layer was published." />;

  const mapName = artwork.kind === "zone" ? artwork.map.name : artwork.instance.name;
  const displayedMapId = artwork.kind === "instance" ? artwork.instance.mapID : mapId;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground">
        <div className="min-w-0 truncate">
          <span className="font-semibold text-foreground">{mapName}</span>
          <span className="ml-1.5 font-mono">world {displayedMapId}</span>
          {artwork.kind === "instance" && !mapOverlayAvailable && (
            <span className="ml-1.5 text-amber-300/80">position overlay unavailable</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span>{Math.round(mapScale * 100)}%</span>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{viewportMarkers.length}</span>
          {artwork.kind === "instance" && !renderedMap && artwork.instance.floors.length > 1 && (
            <select
              aria-label="Map floor"
              value={selectedFloorNumber ?? ""}
              onChange={(event) => setFloorNumber(Number(event.target.value))}
              className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-foreground [color-scheme:dark]"
            >
              {artwork.instance.floors.map((floor) => <option key={floor.floor} value={floor.floor}>Floor {floor.floor}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-white/10 bg-black/70">
        <div className="relative mx-auto h-full max-w-full overflow-hidden bg-[#11100d]" style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
          <div
            className="absolute overflow-hidden"
            style={{
              left: `${-viewport.leftPercent * mapScale}%`,
              top: `${-viewport.topPercent * mapScale}%`,
              width: `${mapScale * 100}%`,
              height: `${mapScale * 100}%`,
            }}
          >
            <MapBackground canvas={canvas} iconBaseUrl={iconBaseUrl} overlays={artwork.kind === "zone" ? zoneSelection?.art.overlays : undefined} />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,.28))]" />
          </div>
          {!sync?.enabled && tracks.length > 0 && (
            <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {tracks.map((track) => {
                const appearance = unitAppearance(track.guid, props);
                const playerSelected = props.context.entitySelection.playerIds;
                const muted = appearance.player && playerSelected.size > 0 && !playerSelected.has(track.guid);
                const points = track.points.map((point) => pointInMapViewport(point, viewport));
                const first = points[0];
                return (
                  <g key={track.key} opacity={muted ? 0.12 : appearance.player ? 0.68 : 0.25}>
                    <polyline
                      points={points.map((point) => `${point.leftPercent},${point.topPercent}`).join(" ")}
                      fill="none"
                      stroke={appearance.color}
                      strokeWidth={appearance.player ? 0.65 : 0.38}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={appearance.player ? undefined : "1 1.3"}
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle cx={first.leftPercent} cy={first.topPercent} r={appearance.player ? 0.9 : 0.55} fill={appearance.color} />
                  </g>
                );
              })}
            </svg>
          )}
          {viewportMarkers.map(({ unit, point }) => <MapMarker key={unit.guid} unit={unit} props={props} point={point} />)}
        </div>
      </div>
      {artwork.kind === "instance" && !mapOverlayAvailable ? (
        <p className="px-1 text-[9px] text-amber-300/80">No compatible world-coordinate mapping is available for this floor, so unit markers are hidden.</p>
      ) : !sync?.enabled ? (
        <div className="flex items-center justify-between gap-3 px-1 text-[9px] text-muted-foreground">
          <span>Movement trails summarize all selected fights. Dots mark each trail's start.</span>
          <span className="shrink-0">class icon player · paw pet · skull hostile</span>
        </div>
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
