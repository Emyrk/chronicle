import { describe, expect, it } from "vitest";
import {
  BOSS_MINI_SLUGS,
  MINIATURE_MANIFEST_FORMAT,
  bossMiniSlug,
  bossMiniUrl,
  miniatureAssetUrl,
  miniatureManifestUrl,
  miniatureUrlCandidates,
  parseMiniatureManifest,
} from "./bossMinis";

describe("bossMinis", () => {
  it("maps each Wailing Caverns boss entry to its model file", () => {
    expect(Object.fromEntries(BOSS_MINI_SLUGS)).toEqual({
      3671: "lady-anacondra",
      3670: "lord-pythas",
      3669: "lord-cobrahn",
      3653: "kresh",
      3674: "skum",
      3673: "lord-serpentis",
      5775: "verdan-the-everliving",
      3654: "mutanus-the-devourer",
      5912: "deviate-faerie-dragon",
    });
  });

  it("returns nothing for other or missing entries", () => {
    expect(bossMiniSlug(undefined)).toBeUndefined();
    expect(bossMiniSlug(11502)).toBeUndefined();
    expect(bossMiniUrl(11502)).toBeUndefined();
  });

  it("builds model URLs under the base URL", () => {
    expect(bossMiniUrl(3654, "/boss-minis")).toBe("/boss-minis/mutanus-the-devourer.glb");
    expect(bossMiniUrl(3653, "https://cdn.example/minis/")).toBe("https://cdn.example/minis/kresh.glb");
  });

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

  it("prefers the published model and keeps the bundled model as a fallback", () => {
    const published = new Map([[3653, "https://icons.example/miniatures/kresh.glb"], [11502, "https://icons.example/miniatures/ragnaros.glb"]]);
    expect(miniatureUrlCandidates(3653, published, "/boss-minis")).toEqual([
      "https://icons.example/miniatures/kresh.glb",
      "/boss-minis/kresh.glb",
    ]);
    expect(miniatureUrlCandidates(11502, published, "/boss-minis")).toEqual([
      "https://icons.example/miniatures/ragnaros.glb",
    ]);
    expect(miniatureUrlCandidates(999, published, "/boss-minis")).toEqual([]);
  });
});
