import type { CSSProperties } from "react";

export const WOW_MAP_MANIFEST_FORMAT = "chronicle-wow-map-art-v1";

export interface WowMapManifest {
  format: string;
  target: {
    product: string;
    build: string;
    region: string;
    locale: string;
  };
  maps: WowMap[];
  instances?: WowMapInstance[];
}

export interface WowMap {
  id: number;
  name: string;
  parentID: number;
  type: number;
  flags: number;
  assignments?: WowMapAssignment[];
  art?: WowMapArt[];
}

export interface WowMapAssignment {
  id: number;
  mapID: number;
  areaID: number;
  orderIndex: number;
  region: number[];
  uiMin: number[];
  uiMax: number[];
}

export interface WowMapArt {
  phaseID: number;
  artID: number;
  styleID: number;
  layers: WowMapLayer[];
  overlays?: WowMapOverlay[];
}

export interface WowMapOverlay {
  id: number;
  offsetX: number;
  offsetY: number;
  textureWidth: number;
  textureHeight: number;
  tiles: WowMapTile[];
}

export interface WowMapInstance {
  mapID: number;
  name: string;
  instanceType: number;
  directory: string;
  floors: WowMapInstanceFloor[];
}

export interface WowMapInstanceFloor {
  floor: number;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tiles: WowMapTile[];
}

export interface WowMapLayer {
  index: number;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  minScale: number;
  maxScale: number;
  additionalZoomSteps: number;
  tiles: WowMapTile[];
}

export interface WowMapTile {
  row: number;
  column: number;
  fileDataID: number;
  path: string;
}

export type MapGalleryItem =
  | {
    kind: "zone";
    key: string;
    map: WowMap;
    art: WowMapArt;
    layer: WowMapLayer;
  }
  | {
    kind: "instance";
    key: string;
    instance: WowMapInstance;
    floor: WowMapInstanceFloor;
  };

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function mapManifestUrl(iconBaseUrl: string): string {
  return `${stripTrailingSlash(iconBaseUrl)}/maps/manifest.json`;
}

export function mapAssetUrl(iconBaseUrl: string, path: string): string {
  return `${stripTrailingSlash(iconBaseUrl)}/maps/${path.replace(/^\/+/, "")}`;
}

type WowMapCanvas = Pick<WowMapLayer, "width" | "height" | "tileWidth" | "tileHeight">;

export function tilePlacement(canvas: WowMapCanvas, tile: WowMapTile): CSSProperties {
  return {
    left: `${(tile.column * canvas.tileWidth / canvas.width) * 100}%`,
    top: `${(tile.row * canvas.tileHeight / canvas.height) * 100}%`,
    width: `${(canvas.tileWidth / canvas.width) * 100}%`,
    height: `${(canvas.tileHeight / canvas.height) * 100}%`,
  };
}

export function overlayTilePlacement(
  layer: WowMapLayer,
  overlay: WowMapOverlay,
  tile: WowMapTile,
): CSSProperties {
  return {
    left: `${((overlay.offsetX + tile.column * 256) / layer.width) * 100}%`,
    top: `${((overlay.offsetY + tile.row * 256) / layer.height) * 100}%`,
    width: `${(256 / layer.width) * 100}%`,
    height: `${(256 / layer.height) * 100}%`,
  };
}

export function mapGalleryItems(manifest: WowMapManifest): MapGalleryItem[] {
  const zones: MapGalleryItem[] = manifest.maps.flatMap((map) =>
    (map.art ?? []).flatMap((art) =>
      art.layers
        .filter((layer) => layer.width > 0 && layer.height > 0 && layer.tiles.length > 0)
        .map((layer) => ({
          kind: "zone" as const,
          key: `zone-${map.id}-${art.phaseID}-${art.artID}-${layer.index}`,
          map,
          art,
          layer,
        })),
    ),
  );
  const instances: MapGalleryItem[] = (manifest.instances ?? []).flatMap((instance) =>
    instance.floors
      .filter((floor) => floor.width > 0 && floor.height > 0 && floor.tiles.length > 0)
      .map((floor) => ({
        kind: "instance" as const,
        key: `instance-${instance.mapID}-${floor.floor}`,
        instance,
        floor,
      })),
  );

  return [...zones, ...instances].sort((left, right) => {
    const leftName = left.kind === "zone" ? left.map.name : left.instance.name;
    const rightName = right.kind === "zone" ? right.map.name : right.instance.name;
    const nameOrder = leftName.localeCompare(rightName);
    if (nameOrder !== 0) return nameOrder;
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    if (left.kind === "zone" && right.kind === "zone") {
      return left.map.id - right.map.id
        || left.art.phaseID - right.art.phaseID
        || left.art.artID - right.art.artID
        || left.layer.index - right.layer.index;
    }
    if (left.kind === "instance" && right.kind === "instance") {
      return left.instance.mapID - right.instance.mapID || left.floor.floor - right.floor.floor;
    }
    return 0;
  });
}
