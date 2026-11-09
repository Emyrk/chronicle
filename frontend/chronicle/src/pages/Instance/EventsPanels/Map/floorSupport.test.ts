import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFloorSupport, indexFloorSupport, usableFloorSupport, type FloorSupportArtifact, type FloorSupportDescriptor } from "./floorSupport";
const hash = "a".repeat(64);
const descriptor: FloorSupportDescriptor = { version: 1, path: `support/90-${hash}.json`, sha256: hash, datasetID: "dataset", mapID: 90, frame: "wow-yup-mirrored-x", floorIDs: [1], sources: [{ floor: 1, path: "3d/mesh.glb", sha256: hash }], validated: false };
function encode(values: number[], float: boolean) {
  const bytes = new Uint8Array(values.length * 4); const view = new DataView(bytes.buffer);
  values.forEach((value, i) => float ? view.setFloat32(i * 4, value, true) : view.setUint32(i * 4, value, true));
  return btoa(String.fromCharCode(...bytes));
}
const artifact: FloorSupportArtifact = { version: 1, datasetID: "dataset", mapID: 90, frame: "wow-yup-mirrored-x", floorIDs: [1], sources: descriptor.sources, encoding: "indexed-f32-le-u32-le", floors: [{ floor: 1, positions: encode([0, 5, 0, 10, 5, 0, 0, 5, 10], true), indices: encode([0, 1, 2], false) }] };
const floors = [{ floor: 1, mesh: { path: "3d/mesh.glb" } }];
describe("floor support", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("fails closed on network errors, oversized bodies and bad checksums", async () => {
    for (const response of [new Response("missing", { status: 404 }), new Response("{}", { headers: { "content-length": "999999999" } }), new Response(JSON.stringify(artifact))]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(fetchFloorSupport("https://example.test/support.json", descriptor)).rejects.toThrow();
    }
  });
  it("loads only byte-verified geometry", async () => {
    const body = JSON.stringify(artifact);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    const index = await fetchFloorSupport("https://example.test/support.json", { ...descriptor, sha256 });
    expect(index.candidates(-2, 2)).toEqual([1]);
  });
  it("gates unvalidated, absent, stale, wrong-dataset and wrong-floor descriptors", () => {
    expect(usableFloorSupport(undefined, "dataset", 90, floors)).toBe(false);
    expect(usableFloorSupport(descriptor, "dataset", 90, floors)).toBe(false);
    expect(usableFloorSupport(descriptor, "dataset", 90, floors, true)).toBe(true);
    expect(usableFloorSupport({ ...descriptor, validated: true }, "other", 90, floors)).toBe(false);
    expect(usableFloorSupport(descriptor, "dataset", 90, [{ floor: 1, mesh: { path: "3d/new.glb" } }], true)).toBe(false);
    expect(usableFloorSupport(descriptor, "dataset", 90, [{ floor: 2 }], true)).toBe(false);
  });
  it("projects exact triangles with correct axes and optional height", () => {
    const index = indexFloorSupport(artifact, descriptor);
    expect(index.candidates(-2, 2)).toEqual([1]);
    expect(index.candidates(2, 2)).toEqual([]);
    expect(index.candidates(-2, 2, 5)).toEqual([1]);
    expect(index.candidates(-2, 2, 20)).toEqual([]);
    expect(index.candidates(-9, 9)).toEqual([]);
  });
  it("rejects mismatched provenance, invalid indices and nonfinite geometry", () => {
    expect(() => indexFloorSupport({ ...artifact, mapID: 91 }, descriptor)).toThrow();
    expect(() => indexFloorSupport({ ...artifact, datasetID: "another-dataset" }, descriptor)).toThrow();
    expect(() => indexFloorSupport({ ...artifact, sources: [{ ...descriptor.sources[0], sha256: "b".repeat(64) }] }, descriptor)).toThrow();
    for (const floor of [{ ...artifact.floors[0], indices: encode([0, 1, 99], false) }, { ...artifact.floors[0], positions: encode([NaN, 0, 0], true) }]) {
      expect(() => indexFloorSupport({ ...artifact, floors: [floor] }, descriptor)).toThrow();
    }
  });
});
