import { describe, expect, it } from "vitest";
import {
  mapAssetUrl,
  mapGalleryItems,
  mapManifestUrl,
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
    { row: 1, column: 2, fileDataID: 30, path: "tiles/30.webp" },
  ],
};

describe("map gallery URLs", () => {
  it("builds manifest and tile URLs from the dataset icon base URL", () => {
    expect(mapManifestUrl("https://icons.example.test/forever/"))
      .toBe("https://icons.example.test/forever/maps/manifest.json");
    expect(mapAssetUrl("https://icons.example.test/forever/", "/tiles/30.webp"))
      .toBe("https://icons.example.test/forever/maps/tiles/30.webp");
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

  it("flattens renderable art layers in map-name order", () => {
    const manifest: WowMapManifest = {
      format: "chronicle-wow-map-art-v1",
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
    };

    const items = mapGalleryItems(manifest);

    expect(items.map((item) => item.key)).toEqual([
      "1411-0-2169-0",
      "1411-1-2170-1",
      "1412-0-1200-0",
    ]);
  });
});
