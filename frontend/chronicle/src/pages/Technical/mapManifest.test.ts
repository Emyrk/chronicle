import { afterEach, describe, expect, it, vi } from "vitest";
import type { WowMapManifest } from "./mapGallery";
import { applyMapManifestMeshLayer, fetchMapManifest, type WowMapMeshLayer } from "./mapManifest";

const mesh = {
  path: "meshes/389.glb",
  bounds: { minX: -416.2582, maxX: 102.9279, minY: -108.4728, maxY: 275.3513 },
  zMin: -66.1637,
  zMax: 59.4058,
  frame: "wow-yup-mirrored-x",
  liquid: { color: "#d66020", opacity: 0.85 },
};
const wcMesh = { ...mesh, path: "meshes/43.glb", liquid: undefined };
const manifest: WowMapManifest = {
  format: "chronicle-wow-map-art-v2",
  target: { product: "wow_classic_beta", build: "1.60.1.70205", region: "us", locale: "enUS" },
  maps: [],
  instances: [{
    mapID: 43,
    name: "Wailing Caverns",
    instanceType: 1,
    directory: "WailingCaverns",
    floors: [{ floor: 1, width: 1002, height: 668, tileWidth: 256, tileHeight: 256, tiles: [] }],
  }],
};
const layer: WowMapMeshLayer = {
  format: "chronicle-wow-map-art-v2",
  target: { product: "wow_classic_beta" },
  instances: [
    { mapID: 43, name: "Renamed Caverns", mesh: wcMesh },
    { mapID: 389, name: "Ragefire Chasm", mesh },
  ],
};

describe("applyMapManifestMeshLayer", () => {
  it("attaches a mesh to an existing instance and creates a mesh-only one, like the Go merge", () => {
    const merged = applyMapManifestMeshLayer(manifest, layer);
    expect(merged.instances).toEqual([
      { ...manifest.instances![0], mesh: wcMesh },
      { mapID: 389, name: "Ragefire Chasm", instanceType: 0, directory: "", floors: [], mesh },
    ]);
    expect(manifest.instances![0].mesh, "the fetched manifest is not mutated").toBeUndefined();
    expect(merged.maps).toBe(manifest.maps);
  });

  it("creates the instance list when the manifest has none", () => {
    expect(applyMapManifestMeshLayer({ ...manifest, instances: undefined }, { ...layer, instances: [layer.instances[1]] }).instances)
      .toEqual([{ mapID: 389, name: "Ragefire Chasm", instanceType: 0, directory: "", floors: [], mesh }]);
  });

  it("rejects what the Go merge rejects", () => {
    const cases: Array<[string, WowMapMeshLayer, RegExp]> = [
      ["format", { ...layer, format: "chronicle-wow-map-art-v1" }, /unsupported format/],
      ["product", { ...layer, target: { product: "other" } }, /target does not match/],
      ["build", { ...layer, target: { product: "wow_classic_beta", build: "1.60.1.70205" } }, /target does not match/],
      ["duplicate", { ...layer, instances: [layer.instances[1], layer.instances[1]] }, /duplicate mapID 389/],
      ["no mesh", { ...layer, instances: [{ mapID: 389, name: "Ragefire Chasm" }] }, /mapID 389 must contain mesh only/],
      ["artwork", { ...layer, instances: [{ mapID: 389, name: "Ragefire Chasm", mesh, floors: [] } as WowMapMeshLayer["instances"][number]] }, /mapID 389 must contain mesh only/],
      ["name required", { ...layer, instances: [{ mapID: 389, mesh }] }, /mapID 389 has no instance in the manifest and no name/],
    ];
    for (const [name, bad, want] of cases) {
      expect(() => applyMapManifestMeshLayer(manifest, bad), name).toThrow(want);
    }
  });
});

describe("fetchMapManifest", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (routes: Record<string, unknown>) => vi.fn(async (url: string) => {
    const body = routes[url];
    return body === undefined
      ? { ok: false, status: 404, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => body };
  });

  it("fetches the manifest alone without an overlay URL", async () => {
    const fetch = respond({ "https://icons.example/maps/manifest.json": manifest });
    vi.stubGlobal("fetch", fetch);
    expect(await fetchMapManifest("https://icons.example/", undefined)).toEqual(manifest);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("merges the overlay over the fetched manifest", async () => {
    vi.stubGlobal("fetch", respond({ "https://icons.example/maps/manifest.json": manifest, "/dev-manifest/forever.meshes.json": layer }));
    const merged = await fetchMapManifest("https://icons.example", "/dev-manifest/forever.meshes.json");
    expect(merged.instances?.map((instance) => instance.mapID)).toEqual([43, 389]);
  });

  it("fails loudly when the overlay is missing or invalid", async () => {
    vi.stubGlobal("fetch", respond({ "https://icons.example/maps/manifest.json": manifest, "/bad.json": { ...layer, format: "v1" } }));
    await expect(fetchMapManifest("https://icons.example", "/dev-manifest/forever.meshes.json")).rejects.toThrow(/overlay .* failed with 404/);
    await expect(fetchMapManifest("https://icons.example", "/bad.json")).rejects.toThrow(/unsupported format/);
  });

  it("still rejects an unsupported manifest format", async () => {
    vi.stubGlobal("fetch", respond({ "https://icons.example/maps/manifest.json": { ...manifest, format: "v9" } }));
    await expect(fetchMapManifest("https://icons.example", undefined)).rejects.toThrow(/Unsupported map manifest format: v9/);
  });
});
