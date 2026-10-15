import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MINIATURE_MANIFEST_FORMAT,
  fetchMiniatureManifest,
  fetchMiniatureUrls,
  miniatureAssetUrl,
  miniatureManifestUrl,
  miniatureUrl,
  parseMiniatureManifest,
} from "./bossMinis";

afterEach(() => vi.unstubAllGlobals());

describe("bossMinis", () => {
  it("parses the shared miniature registry and builds root-CDN URLs", () => {
    const manifest = parseMiniatureManifest({
      format: MINIATURE_MANIFEST_FORMAT,
      miniatures: [{
        name: "Shared serpent",
        path: "miniatures/abc-serpent.glb",
        entry_ids: [3670, 3671],
      }],
    });
    expect(manifest.miniatures[0]?.entry_ids).toEqual([3670, 3671]);
    expect(miniatureManifestUrl("https://icons.example/root/")).toBe("https://icons.example/root/miniatures/manifest.json");
    expect(miniatureAssetUrl("miniatures/abc-serpent.glb", "https://icons.example/root/")).toBe("https://icons.example/root/miniatures/abc-serpent.glb");
  });

  it("rejects invalid or ambiguous miniature assignments", () => {
    expect(() => parseMiniatureManifest({ format: "wrong", miniatures: [] })).toThrow(/Unsupported/);
    expect(() => parseMiniatureManifest({
      format: MINIATURE_MANIFEST_FORMAT,
      miniatures: [{ name: "Nested", path: "miniatures/nested/a.glb", entry_ids: [1] }],
    })).toThrow(/invalid path/);
    expect(() => parseMiniatureManifest({
      format: MINIATURE_MANIFEST_FORMAT,
      miniatures: [
        { name: "One", path: "miniatures/one.glb", entry_ids: [1] },
        { name: "Two", path: "miniatures/two.glb", entry_ids: [1] },
      ],
    })).toThrow(/Duplicate miniature entry ID/);
  });

  it("fetches the full manifest and derives the replay lookup from it", async () => {
    const payload = {
      format: MINIATURE_MANIFEST_FORMAT,
      miniatures: [
        { name: "Shared serpent", path: "miniatures/serpent.glb", entry_ids: [3670, 3671] },
        { name: "Firelord", path: "miniatures/firelord.glb", entry_ids: [11502] },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMiniatureManifest("https://icons.example/root/")).resolves.toEqual(payload);
    await expect(fetchMiniatureUrls("https://icons.example/root/")).resolves.toEqual(new Map([
      [3670, "https://icons.example/root/miniatures/serpent.glb"],
      [3671, "https://icons.example/root/miniatures/serpent.glb"],
      [11502, "https://icons.example/root/miniatures/firelord.glb"],
    ]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("https://icons.example/root/miniatures/manifest.json");
  });

  it("uses only models published by the manifest", () => {
    const published = new Map([
      [3653, "https://icons.example/miniatures/kresh.glb"],
      [11502, "https://icons.example/miniatures/ragnaros.glb"],
    ]);
    expect(miniatureUrl(3653, published)).toBe("https://icons.example/miniatures/kresh.glb");
    expect(miniatureUrl(11502, published)).toBe("https://icons.example/miniatures/ragnaros.glb");
    expect(miniatureUrl(999, published)).toBeUndefined();
    expect(miniatureUrl(undefined, published)).toBeUndefined();
    expect(miniatureUrl(3653, undefined)).toBeUndefined();
  });
});
