import type { CSSProperties } from "react";

export const WOW_MAP_MANIFEST_FORMAT = "chronicle-wow-map-art-v2";

// Legacy datasets still publish v1 until their extractors migrate.
export function isSupportedMapManifestFormat(format: string): boolean {
  return format === WOW_MAP_MANIFEST_FORMAT || format === "chronicle-wow-map-art-v1";
}

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
  styled?: WowMapRenderedInstance;
  renders?: WowMapManualRender;
  mesh?: WowMapMeshInstance;
}

/** A dungeon's 3D mesh (glTF binary under `meshes/`) for the Replay Map, placed by its own world extent. */
export interface WowMapMeshInstance {
  path: string;
  /** World-axis bounds of the mesh: `minX..maxX` is world X, `minY..maxY` world Y. */
  bounds: WowMapFloorBounds;
  zMin: number;
  zMax: number;
  /** The glTF axis convention; see `DUNGEON_MESH_FRAME`. */
  frame: string;
  /** Tint for the mesh's `liquid_*` planes (lava, slime); absent, the GLB's own water shows. */
  liquid?: WowMapMeshLiquid;
}

export interface WowMapMeshLiquid {
  /** CSS hex colour, `#rrggbb`. */
  color: string;
  /** 0 < opacity <= 1. */
  opacity: number;
}

// Manually published 2D images. Only explicitly calibrated bounds permit position overlays.
export interface WowMapManualRender {
  path: string;
  width: number;
  height: number;
  bounds?: WowMapFloorBounds;
}

export interface WowMapRenderedInstance {
  path: string;
  width: number;
  height: number;
  source: string;
  bounds: WowMapFloorBounds;
  triangles?: number;
}

export interface WowMapFloorBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface WowMapInstanceFloor {
  floor: number;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  bounds?: WowMapFloorBounds;
  tiles: WowMapTile[];
  /** Preferred automatic 2D source for this floor; absent preserves render-first behavior. */
  preferred2D?: "renders" | "art";
  renders?: WowMapManualRender;
  mesh?: WowMapMeshInstance;
}

export function mapFloorRender(
  instance: WowMapInstance,
  floor: WowMapInstanceFloor | undefined,
): WowMapManualRender | undefined {
  return floor?.renders ?? instance.renders;
}

export function mapFloorMesh(
  instance: WowMapInstance,
  floor: WowMapInstanceFloor | undefined,
): WowMapMeshInstance | undefined {
  return floor?.mesh ?? instance.mesh;
}

export function hasNativeMapFloorArtwork(floor: WowMapInstanceFloor | undefined): boolean {
  return Boolean(floor && floor.width > 0 && floor.height > 0 && floor.tiles.length > 0);
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
  }
  | {
    kind: "renders";
    key: string;
    instance: WowMapInstance;
    floor?: WowMapInstanceFloor;
    render: WowMapManualRender;
  }
  | {
    kind: "styled";
    key: string;
    instance: WowMapInstance;
    rendered: WowMapRenderedInstance;
  }
  | {
    /** A mesh-only instance or floor: no map artwork at all, only the Replay Map's 3D mesh. */
    kind: "mesh";
    key: string;
    instance: WowMapInstance;
    floor?: WowMapInstanceFloor;
    mesh: WowMapMeshInstance;
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
  const instances: MapGalleryItem[] = (manifest.instances ?? []).flatMap((instance) => {
    const instanceRender = instance.renders && instance.renders.width > 0 && instance.renders.height > 0
      ? instance.renders
      : undefined;
    const styled = instance.styled && instance.styled.width > 0 && instance.styled.height > 0
      ? instance.styled
      : undefined;
    const items: MapGalleryItem[] = [];
    for (const floor of instance.floors) {
      const hasNativeArtwork = hasNativeMapFloorArtwork(floor);
      const floorRender = floor.renders && floor.renders.width > 0 && floor.renders.height > 0
        ? floor.renders
        : undefined;
      if (hasNativeArtwork) {
        items.push({
          kind: "instance",
          key: `instance-${instance.mapID}-${floor.floor}`,
          instance,
          floor,
        });
      }
      if (floorRender) {
        items.push({
          kind: "renders",
          key: `renders-${instance.mapID}-${floor.floor}`,
          instance,
          floor,
          render: floorRender,
        });
      }
      // A floor-specific mesh gets its own card only when that floor has no
      // image. Native and rendered floor cards expose the same mesh in 3D.
      if (floor.mesh && !hasNativeArtwork && !floorRender && !instanceRender && !styled) {
        items.push({
          kind: "mesh",
          key: `mesh-${instance.mapID}-${floor.floor}`,
          instance,
          floor,
          mesh: floor.mesh,
        });
      }
    }
    if (instanceRender) {
      items.push({
        kind: "renders",
        key: `renders-${instance.mapID}`,
        instance,
        render: instanceRender,
      });
    }
    if (styled) {
      items.push({
        kind: "styled",
        key: `styled-${instance.mapID}`,
        instance,
        rendered: styled,
      });
    }
    // Preserve the legacy instance-level mesh-only card. Do not repeat an
    // instance mesh for every metadata-only floor.
    if (instance.mesh && instance.floors.length === 0 && !instanceRender && !styled) {
      items.push({
        kind: "mesh",
        key: `mesh-${instance.mapID}`,
        instance,
        mesh: instance.mesh,
      });
    }
    return items;
  });

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
    if (left.kind !== "zone" && right.kind !== "zone") {
      return left.instance.mapID - right.instance.mapID
        || ("floor" in left ? left.floor?.floor ?? 0 : 0) - ("floor" in right ? right.floor?.floor ?? 0 : 0)
        || left.key.localeCompare(right.key);
    }
    return 0;
  });
}
