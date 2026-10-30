import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UNIT_IMAGE_MANIFEST_FORMAT,
  fetchUnitImageLookup,
  fetchUnitImageManifest,
  parseUnitImageManifest,
  unitImageAssetUrl,
  unitImageManifestUrl,
  unitImageUrl,
} from "./unitImages";

afterEach(() => vi.unstubAllGlobals());

const onyxia = {
  name: "ony-onyxia",
  entry_ids: [10184],
  images: {
    headshot: "unit-images/abc-onyxia-headshot.webp",
    full: "unit-images/def-onyxia-full.webp",
  },
};

describe("unitImages", () => {
  it("parses arbitrary labeled images and builds root-CDN URLs", () => {
    const manifest = parseUnitImageManifest({
      format: UNIT_IMAGE_MANIFEST_FORMAT,
      units: [onyxia],
    });

    expect(manifest.units[0]).toEqual(onyxia);
    expect(unitImageManifestUrl("https://icons.example/root/")).toBe("https://icons.example/root/unit-images/manifest.json");
    expect(unitImageAssetUrl(onyxia.images.headshot, "https://icons.example/root/")).toBe(
      "https://icons.example/root/unit-images/abc-onyxia-headshot.webp",
    );
  });

  it("rejects invalid or ambiguous assignments", () => {
    expect(() => parseUnitImageManifest({ format: "wrong", units: [] })).toThrow(/Unsupported/);
    expect(() => parseUnitImageManifest({
      format: UNIT_IMAGE_MANIFEST_FORMAT,
      units: [{ ...onyxia, images: { "Head Shot": onyxia.images.headshot } }],
    })).toThrow(/invalid label/);
    expect(() => parseUnitImageManifest({
      format: UNIT_IMAGE_MANIFEST_FORMAT,
      units: [{ ...onyxia, images: { headshot: "other/onyxia.webp" } }],
    })).toThrow(/invalid path/);
    expect(() => parseUnitImageManifest({
      format: UNIT_IMAGE_MANIFEST_FORMAT,
      units: [onyxia, { ...onyxia, name: "other" }],
    })).toThrow(/Duplicate unit image entry ID/);
  });

  it("fetches the manifest and derives an entry lookup", async () => {
    const payload = { format: UNIT_IMAGE_MANIFEST_FORMAT, units: [onyxia] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUnitImageManifest("https://icons.example/root/")).resolves.toEqual(payload);
    await expect(fetchUnitImageLookup("https://icons.example/root/")).resolves.toEqual(new Map([[10184, onyxia]]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://icons.example/root/unit-images/manifest.json?format=chronicle-unit-images-v1",
    );
  });

  it("resolves a requested label only when the entry and image exist", () => {
    const published = new Map([[10184, onyxia]]);
    expect(unitImageUrl(10184, "headshot", published, "https://icons.example")).toBe(
      "https://icons.example/unit-images/abc-onyxia-headshot.webp",
    );
    expect(unitImageUrl(10184, "full", published, "https://icons.example")).toBe(
      "https://icons.example/unit-images/def-onyxia-full.webp",
    );
    expect(unitImageUrl(10184, "profile", published)).toBeUndefined();
    expect(unitImageUrl(999, "headshot", published)).toBeUndefined();
    expect(unitImageUrl(undefined, "headshot", published)).toBeUndefined();
  });
});
