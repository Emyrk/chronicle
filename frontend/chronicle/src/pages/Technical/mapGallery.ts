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

export interface MapGalleryItem {
  key: string;
  map: WowMap;
  art: WowMapArt;
  layer: WowMapLayer;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function mapManifestUrl(iconBaseUrl: string): string {
  return `${stripTrailingSlash(iconBaseUrl)}/maps/manifest.json`;
}

export function mapAssetUrl(iconBaseUrl: string, path: string): string {
  return `${stripTrailingSlash(iconBaseUrl)}/maps/${path.replace(/^\/+/, "")}`;
}

export function tilePlacement(layer: WowMapLayer, tile: WowMapTile): CSSProperties {
  return {
    left: `${(tile.column * layer.tileWidth / layer.width) * 100}%`,
    top: `${(tile.row * layer.tileHeight / layer.height) * 100}%`,
    width: `${(layer.tileWidth / layer.width) * 100}%`,
    height: `${(layer.tileHeight / layer.height) * 100}%`,
  };
}

export function mapGalleryItems(manifest: WowMapManifest): MapGalleryItem[] {
  return manifest.maps
    .flatMap((map) =>
      (map.art ?? []).flatMap((art) =>
        art.layers
          .filter((layer) => layer.width > 0 && layer.height > 0 && layer.tiles.length > 0)
          .map((layer) => ({
            key: `${map.id}-${art.phaseID}-${art.artID}-${layer.index}`,
            map,
            art,
            layer,
          })),
      ),
    )
    .sort((left, right) =>
      left.map.name.localeCompare(right.map.name)
      || left.map.id - right.map.id
      || left.art.phaseID - right.art.phaseID
      || left.art.artID - right.art.artID
      || left.layer.index - right.layer.index,
    );
}
