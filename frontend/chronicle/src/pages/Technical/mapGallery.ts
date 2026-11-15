import type { CSSProperties } from "react";

import {
  hasNativeMapFloorArtwork,
  type WowMap,
  type WowMapArt,
  type WowMapInstance,
  type WowMapInstanceFloor,
  type WowMapLayer,
  type WowMapManifest,
  type WowMapManualRender,
  type WowMapMeshInstance,
  type WowMapOverlay,
  type WowMapRenderedInstance,
  type WowMapTile,
} from "@/config/mapManifest";

// The map manifest's types and helpers live in src/config/mapManifest.ts (the product's one definition, with its
// parser). Re-exported here for modules that still import this file (the 3D engine and its scene tests).
export {
  hasNativeMapFloorArtwork,
  isSupportedMapManifestFormat,
  mapAssetUrl,
  mapFloorMesh,
  mapFloorRender,
  mapManifestUrl,
  WOW_MAP_MANIFEST_FORMAT,
  type WowMap,
  type WowMapArt,
  type WowMapAssignment,
  type WowMapFloorBounds,
  type WowMapFloorSupport,
  type WowMapInstance,
  type WowMapInstanceFloor,
  type WowMapLayer,
  type WowMapManifest,
  type WowMapManualRender,
  type WowMapMeshInstance,
  type WowMapMeshLiquid,
  type WowMapOverlay,
  type WowMapRenderedInstance,
  type WowMapReuseSource,
  type WowMapTile,
} from "@/config/mapManifest";

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
