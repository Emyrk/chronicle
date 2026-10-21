import { describe, expect, it, vi } from "vitest";
import { createAssetUrlRegistry, guideHostReducer, INITIAL_GUIDE_HOST_STATE } from "./lifecycle";

describe("guideHostReducer", () => {
  it("uses explicit lifecycle transitions and clears stale errors on restart", () => {
    const failed = guideHostReducer(INITIAL_GUIDE_HOST_STATE, { type: "error", error: new Error("boom") });
    expect(failed).toMatchObject({ status: "error", error: "boom", run: 0 });
    const restarted = guideHostReducer(failed, { type: "start" });
    expect(restarted).toEqual({ status: "loading", error: null, run: 1 });
    expect(guideHostReducer(restarted, { type: "ready" }).status).toBe("running");
    expect(guideHostReducer(restarted, { type: "stop" }).status).toBe("stopped");
  });
});

describe("createAssetUrlRegistry", () => {
  it("owns copied Blob URLs and revokes each URL exactly once", () => {
    const createObjectURL = vi.fn((blob: Blob) => `blob:${blob.type}:${createObjectURL.mock.calls.length}`);
    const revokeObjectURL = vi.fn();
    const registry = createAssetUrlRegistry(
      ["icons/tank.png", "art/room.svg"],
      (path) => new TextEncoder().encode(path),
      { createObjectURL, revokeObjectURL },
    );

    expect(registry.urls.get("icons/tank.png")).toBe("blob:image/png:1");
    expect(registry.urls.get("art/room.svg")).toBe("blob:image/svg+xml:2");
    registry.revoke();
    registry.revoke();
    expect(revokeObjectURL.mock.calls).toEqual([["blob:image/png:1"], ["blob:image/svg+xml:2"]]);
  });

  it("revokes already-created URLs when a later asset read fails", () => {
    const revokeObjectURL = vi.fn();
    expect(() => createAssetUrlRegistry(
      ["first.png", "missing.png"],
      (path) => {
        if (path === "missing.png") throw new Error("missing");
        return new Uint8Array([1]);
      },
      { createObjectURL: () => "blob:first", revokeObjectURL },
    )).toThrow("missing");
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });
});
