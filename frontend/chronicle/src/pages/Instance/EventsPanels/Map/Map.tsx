/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated view components intentionally share this module. */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon, Navigation, PawPrint, Skull, Users } from "lucide-react";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import {
  mapAssetUrl,
  mapManifestUrl,
  overlayTilePlacement,
  tilePlacement,
  WOW_MAP_MANIFEST_FORMAT,
  type WowMapInstanceFloor,
  type WowMapLayer,
  type WowMapManifest,
  type WowMapOverlay,
} from "@/pages/Technical/mapGallery";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import type { UnitPositionProcessorEvent } from "../processorTypes";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { mapProcessor, type MapPositionSample, type MapResult } from "./map.processor";
import {
  dominantMapId,
  latestPositionAt,
  observedBounds,
  observedMapPoint,
  resolveMapArtwork,
  selectMapEncounter,
  zoneMapPoint,
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

interface VisibleUnit {
  guid: string;
  sample: MapPositionSample;
}

function MapMarker({ unit, props, point }: {
  unit: VisibleUnit;
  props: PanelRenderProps<MapResult>;
  point: { leftPercent: number; topPercent: number };
}) {
  const player = props.context.instance.players?.[unit.guid];
  const metadata = props.context.instance.units?.[unit.guid];
  const ownerGuid = metadata?.owner?.toString();
  const owner = ownerGuid ? props.context.instance.players?.[ownerGuid] : undefined;
  const isPet = !player && Boolean(owner);
  const color = player
    ? getClassColorVar(player.class)
    : isPet
      ? "#67e8f9"
      : "#fb7185";
  const name = player?.name ?? metadata?.name ?? unit.guid;
  const selectedPlayers = props.context.entitySelection.playerIds;
  const muted = player && selectedPlayers.size > 0 && !selectedPlayers.has(unit.guid);

  return (
    <div
      className="group absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${point.leftPercent}%`, top: `${point.topPercent}%`, opacity: muted ? 0.28 : 1 }}
      title={`${name} · ${unit.sample.x.toFixed(1)}, ${unit.sample.y.toFixed(1)}`}
    >
      <div className="relative flex h-5 w-5 items-center justify-center">
        <span
          className="absolute h-3.5 w-3.5 rounded-full border-2 border-black/80 shadow-[0_0_8px_rgba(0,0,0,.9)]"
          style={{ backgroundColor: color }}
        />
        <Navigation
          className="absolute h-3 w-3 fill-black/65 text-black/80"
          style={{ transform: `rotate(${unit.sample.facing}rad)` }}
        />
        {isPet && <PawPrint className="absolute -bottom-1.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-black/80 p-0.5 text-cyan-200" />}
        {!player && !isPet && <Skull className="absolute -bottom-1.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-black/80 p-0.5 text-rose-200" />}
      </div>
      <span className="pointer-events-none absolute left-1/2 top-full mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 text-[9px] font-medium text-white shadow-lg group-hover:block">
        {name}
      </span>
    </div>
  );
}

function MapContent(props: PanelRenderProps<MapResult>) {
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
      return sample ? [{ guid, sample }] : [];
    });
  }, [cursorMs, encounter]);
  const mapId = dominantMapId(visibleUnits.map((unit) => unit.sample));
  const representativeSample = visibleUnits.find((unit) => unit.sample.mapId === mapId)?.sample;
  const artwork = manifestQuery.data && mapId !== null
    ? resolveMapArtwork(manifestQuery.data, mapId, representativeSample, props.context.instance.name)
    : null;
  const [floorNumber, setFloorNumber] = useState<number | null>(null);

  if (!iconBaseUrl) return <MapMessage title="Map artwork unavailable" detail="This instance's dataset has no icon base URL." />;
  if (manifestQuery.isLoading || props.loading) return <MapMessage title="Loading map" detail="Fetching artwork and position telemetry…" />;
  if (manifestQuery.error) return <MapMessage title="Map artwork unavailable" detail={manifestQuery.error.message} />;
  if (!encounter || visibleUnits.length === 0 || mapId === null) {
    return <MapMessage title="No position telemetry" detail="This encounter does not contain unit-position data." />;
  }
  if (!artwork) return <MapMessage title={`Map ${mapId} is unavailable`} detail="The active dataset does not publish artwork for this world map." />;

  const bounds = artwork.kind === "instance" ? observedBounds(encounter, mapId) : null;
  const zoneSelection = artwork.kind === "zone"
    ? artwork.map.art?.flatMap((art) => art.layers.map((layer) => ({ art, layer })))
      .find(({ layer }) => layer.width > 0 && layer.height > 0 && layer.tiles.length > 0)
    : undefined;
  const selectedFloorNumber = artwork.kind === "instance"
    && artwork.instance.floors.some((floor) => floor.floor === floorNumber)
    ? floorNumber
    : artwork.kind === "instance" ? artwork.instance.floors[0]?.floor ?? null : null;
  const canvas = artwork.kind === "zone"
    ? zoneSelection?.layer
    : artwork.instance.floors.find((floor) => floor.floor === selectedFloorNumber) ?? artwork.instance.floors[0];
  if (!canvas) return <MapMessage title="Map artwork unavailable" detail="No renderable map layer was published." />;

  const mapName = artwork.kind === "zone" ? artwork.map.name : artwork.instance.name;
  const displayedMapId = artwork.kind === "instance" ? artwork.instance.mapID : mapId;
  const markers = visibleUnits.flatMap((unit) => {
    if (unit.sample.mapId !== mapId) return [];
    const point = artwork.kind === "zone"
      ? zoneMapPoint(unit.sample, artwork.assignment)
      : bounds && observedMapPoint(unit.sample, bounds);
    return point ? [{ unit, point }] : [];
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground">
        <div className="min-w-0 truncate">
          <span className="font-semibold text-foreground">{mapName}</span>
          <span className="ml-1.5 font-mono">world {displayedMapId}</span>
          {artwork.kind === "instance" && <span className="ml-1.5 text-amber-300/70">relative placement</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{markers.length}</span>
          {artwork.kind === "instance" && artwork.instance.floors.length > 1 && (
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
          <MapTiles canvas={canvas} iconBaseUrl={iconBaseUrl} overlays={artwork.kind === "zone" ? zoneSelection?.art.overlays : undefined} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(0,0,0,.28))]" />
          {markers.map(({ unit, point }) => <MapMarker key={unit.guid} unit={unit} props={props} point={point} />)}
        </div>
      </div>
      {!sync?.enabled && <p className="px-1 text-[9px] text-muted-foreground">Showing the final position snapshot. Enable Replay to watch units move.</p>}
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
    render: (props) => <MapContent {...props} />,
  };
}
