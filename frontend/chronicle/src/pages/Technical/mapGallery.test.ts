import { describe, expect, it } from "vitest";
import {
  isSupportedMapManifestFormat,
  mapAssetUrl,
  mapGalleryItems,
  mapManifestUrl,
  overlayTilePlacement,
  tilePlacement,
  type WowMapLayer,
  type WowMapManifest,
} from "./mapGallery";

const layer: WowMapLayer = {
  index: 0,
  width: 1000,
  height: 500,
  tileWidth: 250,
  tileHeight: 250,
  minScale: 1,
  maxScale: 2,
  additionalZoomSteps: 0,
  tiles: [
    { row: 1, column: 2, fileDataID: 30, path: "original/30.webp" },
  ],
};

describe("map manifest versions", () => {
  it("accepts v1 legacy manifests and v2 Forever manifests", () => {
    expect(isSupportedMapManifestFormat("chronicle-wow-map-art-v1")).toBe(true);
    expect(isSupportedMapManifestFormat("chronicle-wow-map-art-v2")).toBe(true);
    expect(isSupportedMapManifestFormat("unknown")).toBe(false);
  });
});

describe("map gallery URLs", () => {
  it("builds manifest and tile URLs from the dataset icon base URL", () => {
    expect(mapManifestUrl("https://icons.example.test/forever/"))
      .toBe("https://icons.example.test/forever/maps/manifest.json");
    expect(mapAssetUrl("https://icons.example.test/forever/", "/original/30.webp"))
      .toBe("https://icons.example.test/forever/maps/original/30.webp");
  });
});

describe("map gallery rendering model", () => {
  it("positions tiles using the layer canvas dimensions", () => {
    expect(tilePlacement(layer, layer.tiles[0])).toEqual({
      left: "50%",
      top: "50%",
      width: "25%",
      height: "50%",
    });
  });

  it("positions exploration overlays on the base map canvas", () => {
    expect(overlayTilePlacement(layer, {
      id: 1,
      offsetX: 0,
      offsetY: 0,
      textureWidth: 300,
      textureHeight: 200,
      tiles: [],
    }, { row: 0, column: 1, fileDataID: 31, path: "original/31.webp" })).toEqual({
      left: "25.6%",
      top: "0%",
      width: "25.6%",
      height: "51.2%",
    });
  });

  it("flattens renderable art layers in map-name order", () => {
    const manifest: WowMapManifest = {
      format: "chronicle-wow-map-art-v2",
      target: { product: "wow_classic_beta", build: "1.60.1.70205", region: "us", locale: "enUS" },
      maps: [
        {
          id: 1412,
          name: "Mulgore",
          parentID: 1414,
          type: 3,
          flags: 2,
          art: [{ phaseID: 0, artID: 1200, styleID: 1, layers: [layer] }],
        },
        {
          id: 1411,
          name: "Durotar",
          parentID: 1414,
          type: 3,
          flags: 2,
          art: [
            { phaseID: 1, artID: 2170, styleID: 1, layers: [{ ...layer, index: 1 }] },
            { phaseID: 0, artID: 2169, styleID: 1, layers: [layer] },
          ],
        },
        {
          id: 9999,
          name: "Missing Artwork",
          parentID: 0,
          type: 0,
          flags: 0,
          art: [{ phaseID: 0, artID: 9999, styleID: 1, layers: [{ ...layer, tiles: [] }] }],
        },
      ],
      instances: [{
        mapID: 230,
        name: "Blackrock Depths",
        instanceType: 1,
        directory: "blackrockdepths",
        rendered: {
          path: "render/230-build.png",
          width: 1200,
          height: 800,
          source: "wmo-geometry",
          bounds: { minX: -10, maxX: 20, minY: -30, maxY: 40 },
          triangles: 1234,
        },
        styled: {
          path: "render-styled/230-v1.jpeg",
          width: 1600,
          height: 1066,
          source: "hand-styled",
          bounds: { minX: -10, maxX: 20, minY: -30, maxY: 40 },
        },
        floors: [{
          floor: 1,
          width: 1002,
          height: 668,
          tileWidth: 256,
          tileHeight: 256,
          tiles: [{ row: 0, column: 0, fileDataID: 40, path: "original/40.webp" }],
        }],
      }],
    };

    const items = mapGalleryItems(manifest);

    expect(items.map((item) => item.key)).toEqual([
      "instance-230-1",
      "rendered-230",
      "styled-230",
      "zone-1411-0-2169-0",
      "zone-1411-1-2170-1",
      "zone-1412-0-1200-0",
    ]);
  });
});

describe("mesh-only instances", () => {
  const mesh = {
    path: "meshes/389.glb",
    bounds: { minX: -416.2582, maxX: 102.9279, minY: -108.4728, maxY: 275.3513 },
    zMin: -66.1637,
    zMax: 59.4058,
    frame: "wow-yup-mirrored-x",
    liquid: { color: "#d66020", opacity: 0.85 },
  };
  const manifest: WowMapManifest = {
    format: "chronicle-wow-map-art-v2",
    target: { product: "wow_classic_beta", build: "1.60.1.70205", region: "us", locale: "enUS" },
    maps: [],
    instances: [
      { mapID: 389, name: "Ragefire Chasm", instanceType: 0, directory: "", floors: [], mesh },
      {
        mapID: 43,
        name: "Wailing Caverns",
        instanceType: 1,
        directory: "WailingCaverns",
        floors: [{ floor: 1, width: 1002, height: 668, tileWidth: 256, tileHeight: 256, tiles: [{ row: 0, column: 0, fileDataID: 1, path: "original/1.webp" }] }],
        mesh: { ...mesh, path: "meshes/43.glb", liquid: undefined },
      },
    ],
  };

  it("lists an instance that has only a mesh, and not a mesh beside artwork", () => {
    const items = mapGalleryItems(manifest);
    expect(items.map((item) => item.key)).toEqual(["mesh-389", "instance-43-1"]);
    expect(items[0]).toMatchObject({ kind: "mesh", instance: { name: "Ragefire Chasm" }, mesh });
  });

  it("lists nothing for an instance with neither artwork nor mesh", () => {
    expect(mapGalleryItems({ ...manifest, instances: [{ mapID: 389, name: "Ragefire Chasm", instanceType: 0, directory: "", floors: [] }] })).toEqual([]);
  });
});
