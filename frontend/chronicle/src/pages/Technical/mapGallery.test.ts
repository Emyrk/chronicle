import { describe, expect, it } from "vitest";
import {
  isSupportedMapManifestFormat,
  mapAssetUrl,
  mapFloorMesh,
  mapFloorRender,
  mapGalleryItems,
  mapManifestUrl,
  overlayTilePlacement,
  tilePlacement,
  type WowMapInstance,
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
        renders: {
          path: "renders/230-manual.png",
          width: 1200,
          height: 800,
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
      "renders-230",
      "styled-230",
      "zone-1411-0-2169-0",
      "zone-1411-1-2170-1",
      "zone-1412-0-1200-0",
    ]);
  });
});

describe("floor-specific instance assets", () => {
  const legacyRender = { path: "renders/legacy.png", width: 800, height: 600 };
  const floorRender = { path: "renders/floor-2.png", width: 900, height: 700 };
  const legacyMesh = {
    path: "3d/legacy.glb",
    bounds: { minX: 0, maxX: 10, minY: 0, maxY: 20 },
    zMin: 0,
    zMax: 5,
    frame: "wow-yup-mirrored-x",
  };
  const floorMesh = { ...legacyMesh, path: "3d/floor-2.glb" };
  const instance: WowMapInstance = {
    mapID: 595,
    name: "The Culling of Stratholme",
    instanceType: 1,
    directory: "StratholmeCOT",
    renders: legacyRender,
    mesh: legacyMesh,
    floors: [{
      floor: 1,
      width: 1002,
      height: 668,
      tileWidth: 256,
      tileHeight: 256,
      tiles: [{ row: 0, column: 0, fileDataID: 1, path: "original/1.webp" }],
    }, {
      floor: 2,
      width: 1002,
      height: 668,
      tileWidth: 256,
      tileHeight: 256,
      tiles: [{ row: 0, column: 0, fileDataID: 2, path: "original/2.webp" }],
      renders: floorRender,
      mesh: floorMesh,
    }],
  };

  it("resolves selected-floor assets before instance-level fallbacks", () => {
    expect(mapFloorRender(instance, instance.floors[1])).toBe(floorRender);
    expect(mapFloorMesh(instance, instance.floors[1])).toBe(floorMesh);
    expect(mapFloorRender(instance, instance.floors[0])).toBe(legacyRender);
    expect(mapFloorMesh(instance, instance.floors[0])).toBe(legacyMesh);
  });

  it("lists floor renders with stable keys without separate mesh cards beside artwork", () => {
    const items = mapGalleryItems({
      format: "chronicle-wow-map-art-v2",
      target: { product: "wow_classic_beta", build: "1.60.1.70205", region: "us", locale: "enUS" },
      maps: [],
      instances: [instance],
    });
    expect(items.map((item) => item.key)).toEqual([
      "instance-595-1",
      "instance-595-2",
      "renders-595",
      "renders-595-2",
    ]);
    expect(items.filter((item) => item.kind === "mesh")).toEqual([]);
  });

  it("lists one mesh-only card for a floor that has no image", () => {
    const meshOnlyFloor = { ...instance.floors[1], tiles: [], renders: undefined, mesh: floorMesh };
    const items = mapGalleryItems({
      format: "chronicle-wow-map-art-v2",
      target: { product: "wow_classic_beta", build: "1.60.1.70205", region: "us", locale: "enUS" },
      maps: [],
      instances: [{ ...instance, renders: undefined, mesh: undefined, floors: [meshOnlyFloor] }],
    });
    expect(items).toMatchObject([{ kind: "mesh", key: "mesh-595-2", floor: { floor: 2 }, mesh: floorMesh }]);
  });
});

describe("mesh-only instances", () => {
  const mesh = {
    path: "3d/ragefire-chasm-open-top.glb",
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
        mesh: { ...mesh, path: "3d/wailing-caverns-open-top.glb", liquid: undefined },
      },
    ],
  };

  it("lists an instance that has only a mesh, and not a mesh beside artwork", () => {
    const items = mapGalleryItems(manifest);
    expect(items.map((item) => item.key)).toEqual(["mesh-389", "instance-43-1"]);
    expect(items[0]).toMatchObject({ kind: "mesh", instance: { name: "Ragefire Chasm" }, mesh });
  });

  it("lists a manual render instead of a mesh-only card when both are present", () => {
    const renders = { path: "renders/rfc.png", width: 800, height: 600 };
    expect(mapGalleryItems({
      ...manifest,
      instances: [{ ...manifest.instances![0], renders }],
    })).toMatchObject([{ kind: "renders", render: renders }]);
  });

  it("lists nothing for an instance with neither artwork nor mesh", () => {
    expect(mapGalleryItems({ ...manifest, instances: [{ mapID: 389, name: "Ragefire Chasm", instanceType: 0, directory: "", floors: [] }] })).toEqual([]);
  });
});
