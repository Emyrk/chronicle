import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWatermark, watermarkRect } from "./videoWatermark";

describe("watermarkRect", () => {
  it("sits bottom-right at 7% of the height with a 3% margin at 1080p", () => {
    expect(watermarkRect(1920, 1080)).toEqual({ x: 1920 - 32 - 76, y: 1080 - 32 - 76, size: 76 });
  });

  it("scales with the 720p fallback", () => {
    expect(watermarkRect(1280, 720)).toEqual({ x: 1280 - 22 - 50, y: 720 - 22 - 50, size: 50 });
  });
});

describe("loadWatermark", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fails open when the image cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(loadWatermark()).resolves.toBeNull();
  });

  it("fails open on an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    await expect(loadWatermark()).resolves.toBeNull();
  });
});
