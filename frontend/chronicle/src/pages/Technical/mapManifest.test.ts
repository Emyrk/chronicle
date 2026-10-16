import { afterEach, describe, expect, it, vi } from "vitest";
import type { WowMapManifest } from "./mapGallery";
import { fetchMapManifest } from "./mapManifest";

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
describe("fetchMapManifest", () => {
  afterEach(() => vi.unstubAllGlobals());

  const respond = (routes: Record<string, unknown>) => vi.fn(async (url: string) => {
    const body = routes[url];
    return body === undefined
      ? { ok: false, status: 404, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => body };
  });

  it("fetches only the tenant-configured icon manifest", async () => {
    const fetch = respond({ "https://icons.example/maps/manifest.json": manifest });
    vi.stubGlobal("fetch", fetch);
    expect(await fetchMapManifest("https://icons.example/")).toEqual(manifest);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://icons.example/maps/manifest.json");
  });

  it("still rejects an unsupported manifest format", async () => {
    vi.stubGlobal("fetch", respond({ "https://icons.example/maps/manifest.json": { ...manifest, format: "v9" } }));
    await expect(fetchMapManifest("https://icons.example")).rejects.toThrow(/Unsupported map manifest format: v9/);
  });
});
