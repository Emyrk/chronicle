import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/mapManifest.fixture.json";
import { fetchMapManifestReport, mapFloorMesh, mapFloorRender, parseMapManifest } from "./mapManifest";

type Json = Record<string, unknown> & { maps: Json[]; instances: Json[] } & { [key: string]: unknown };

/** A fresh copy of the valid fixture to break one field of. */
const copy = (): Json => structuredClone(fixture) as unknown as Json;
const floorOf = (manifest: Json) => (manifest.instances[0].floors as Json[])[0];

describe("map manifest parser: the valid fixture", () => {
  it("keeps every entry and field exactly, with no problems", () => {
    const { manifest, problems } = parseMapManifest(copy());
    expect(problems).toEqual([]);
    expect(manifest).toEqual(fixture);
  });

  it("rejects the whole manifest only when it is not one, or has an unsupported format", () => {
    expect(() => parseMapManifest(null)).toThrow(/must be an object/);
    expect(() => parseMapManifest({ ...copy(), format: "v9" })).toThrow(/Unsupported map manifest format: v9/);
    expect(() => parseMapManifest({ ...copy(), format: undefined })).toThrow(/missing/);
    expect(parseMapManifest({ ...copy(), format: "chronicle-wow-map-art-v1" }).problems).toEqual([]);
  });
});

describe("map manifest parser: each rejected field drops only its entry, with a reason", () => {
  /** Breaks one field, parses, and returns the result plus the single problem it caused. */
  function reject(breakIt: (manifest: Json) => void) {
    const manifest = copy();
    breakIt(manifest);
    const parsed = parseMapManifest(manifest);
    expect(parsed.problems).toHaveLength(1);
    return { ...parsed, problem: parsed.problems[0] };
  }

  it("drops a map without a numeric id; the instances still load", () => {
    const { manifest, problem } = reject((m) => { m.maps[0].id = "1"; });
    expect(manifest.maps).toEqual([]);
    expect(manifest.instances).toHaveLength(2);
    expect(problem).toEqual({ path: "maps[0] (map 1)", reason: "id is not a number" });
  });

  it("drops a map without a name", () => {
    expect(reject((m) => { m.maps[0].name = ""; }).problem.reason).toBe("has no name");
  });

  it("drops a malformed assignment, keeping the map", () => {
    const { manifest, problem } = reject((m) => { (m.maps[0].assignments as Json[])[0].uiMin = [0, "x"]; });
    expect(manifest.maps[0].assignments).toEqual([]);
    expect(manifest.maps[0].art).toHaveLength(1);
    expect(problem.reason).toBe("assignment uiMin is not a list of numbers");
  });

  it("drops an art entry without a layer list, keeping the map", () => {
    const { manifest, problem } = reject((m) => { delete ((m.maps[0].art as Json[])[0] as Json).layers; });
    expect(manifest.maps[0].art).toEqual([]);
    expect(problem).toEqual({ path: "maps[0] (map 1).art[0]", reason: "art has no layer list" });
  });

  it("drops a layer with a non-numeric size, keeping the art", () => {
    const { manifest, problem } = reject((m) => { ((m.maps[0].art as Json[])[0].layers as Json[])[0].width = null; });
    expect(manifest.maps[0].art?.[0].layers).toEqual([]);
    expect(manifest.maps[0].art?.[0].overlays).toHaveLength(1);
    expect(problem.reason).toBe("layer width is not a number");
  });

  it("drops a tile without a path, keeping its layer", () => {
    const { manifest, problem } = reject((m) => { (((m.maps[0].art as Json[])[0].layers as Json[])[0].tiles as Json[])[0].path = ""; });
    expect(manifest.maps[0].art?.[0].layers[0].tiles).toEqual([]);
    expect(problem.path).toBe("maps[0] (map 1).art[0].layers[0].tiles[0]");
  });

  it("drops a malformed overlay, keeping the layers", () => {
    const { manifest, problem } = reject((m) => { ((m.maps[0].art as Json[])[0].overlays as Json[])[0].offsetX = "10"; });
    expect(manifest.maps[0].art?.[0].overlays).toEqual([]);
    expect(problem.reason).toBe("overlay offsetX is not a number");
  });

  it("drops an instance without a floor list; the other instance still loads", () => {
    const { manifest, problem } = reject((m) => { delete m.instances[0].floors; });
    expect(manifest.instances?.map((instance) => instance.name)).toEqual(["Ragefire Chasm"]);
    expect(problem).toEqual({ path: "instances[0] (Molten Core, map 409)", reason: "has no floor list" });
  });

  it("drops an instance with a non-numeric map id", () => {
    expect(reject((m) => { m.instances[0].mapID = "409"; }).problem.reason).toBe("mapID is not a number");
  });

  it("drops a 3D dungeon in the wrong axis frame, keeping the instance and its flat maps", () => {
    const { manifest, problem } = reject((m) => { (m.instances[0].mesh as Json).frame = "wow-zup"; });
    expect(manifest.instances?.[0].mesh).toBeUndefined();
    expect(manifest.instances?.[0].renders).toBeDefined();
    expect(problem).toEqual({ path: "instances[0] (Molten Core, map 409).mesh", reason: '3D map frame "wow-zup" is not wow-yup-mirrored-x' });
  });

  it("drops a 3D dungeon with empty bounds", () => {
    const { manifest, problem } = reject((m) => { ((m.instances[1].mesh as Json).bounds as Json).maxX = -50; });
    expect(manifest.instances?.[1].mesh).toBeUndefined();
    expect(problem.reason).toBe("3D map bounds are empty (max must exceed min)");
  });

  it("drops a 3D dungeon without a path", () => {
    expect(reject((m) => { (m.instances[1].mesh as Json).path = ""; }).problem.reason).toBe("3D map has no path");
  });

  it("drops only a malformed liquid tint, keeping the 3D dungeon", () => {
    const { manifest, problem } = reject((m) => { ((m.instances[0].mesh as Json).liquid as Json).color = "orange"; });
    expect(manifest.instances?.[0].mesh?.path).toBe("3d/409.glb");
    expect(manifest.instances?.[0].mesh?.liquid).toBeUndefined();
    expect(problem.reason).toBe("liquid colour is not #rrggbb");
  });

  it("drops a floor without numeric dimensions, keeping the instance", () => {
    const { manifest, problem } = reject((m) => { floorOf(m).tileWidth = undefined; });
    expect(manifest.instances?.[0].floors).toEqual([]);
    expect(manifest.instances?.[0].mesh).toBeDefined();
    expect(problem).toEqual({ path: "instances[0] (Molten Core, map 409).floors[0] (floor 1)", reason: "tileWidth is not a number" });
  });

  it("drops only invalid floor bounds, keeping the floor", () => {
    const { manifest, problem } = reject((m) => { (floorOf(m).bounds as Json).minY = "x"; });
    expect(manifest.instances?.[0].floors[0].floor).toBe(1);
    expect(manifest.instances?.[0].floors[0].bounds).toBeUndefined();
    expect(problem.reason).toBe("bounds.minY is not a number");
  });

  it("drops only an unknown preferred 2D source", () => {
    const { manifest, problem } = reject((m) => { floorOf(m).preferred2D = "satellite"; });
    expect(manifest.instances?.[0].floors[0].preferred2D).toBeUndefined();
    expect(problem.reason).toBe('"satellite" is not renders or art');
  });

  it("marks a floor render without a path invalid: that floor gets no render, not the instance-wide one", () => {
    const { manifest, problem } = reject((m) => { (floorOf(m).renders as Json).path = undefined; });
    const instance = manifest.instances![0];
    expect(instance.floors[0].renders?.invalid).toBe("render has no path");
    expect(mapFloorRender(instance, instance.floors[0])).toBeUndefined();
    expect(instance.renders?.path).toBe("renders/409.webp");
    expect(instance.floors[0].mesh).toBeDefined();
    expect(problem.reason).toBe("render has no path");
  });

  it("marks a floor's own 3D map in the wrong frame invalid: that floor gets no 3D map, not the instance-wide one", () => {
    const { manifest, problem } = reject((m) => { (floorOf(m).mesh as Json).frame = "wow-zup"; });
    const instance = manifest.instances![0];
    expect(mapFloorMesh(instance, instance.floors[0])).toBeUndefined();
    // As before this parser: the old placement check rejected the floor's entry after the fallback, so no 3D.
    expect(instance.mesh?.path).toBe("3d/409.glb");
    // The entry stays, marked, so floor support still matches its path.
    expect(instance.floors[0].mesh?.path).toBe("3d/409-1.glb");
    expect(instance.floors[0].tiles).toHaveLength(1);
    expect(problem.path).toBe("instances[0] (Molten Core, map 409).floors[0] (floor 1).mesh");
  });

  it("drops a styled render without its source, which is how the viewer tells it from tiles", () => {
    const { manifest, problem } = reject((m) => { delete (m.instances[0].styled as Json).source; });
    expect(manifest.instances?.[0].styled).toBeUndefined();
    expect(problem.reason).toBe("styled render has no source (it marks the canvas as a styled render)");
  });

  it("drops only a styled render without bounds", () => {
    const { manifest, problem } = reject((m) => { delete (m.instances[0].styled as Json).bounds; });
    expect(manifest.instances?.[0].styled).toBeUndefined();
    expect(problem.reason).toBe("styled render bounds are missing");
  });

  it("drops only an instance render's invalid bounds, keeping the render (it then permits no overlays)", () => {
    const { manifest, problem } = reject((m) => { ((m.instances[0].renders as Json).bounds as Json).maxY = -200; });
    expect(manifest.instances?.[0].renders?.path).toBe("renders/409.webp");
    expect(manifest.instances?.[0].renders?.bounds).toBeUndefined();
    expect(problem.reason).toBe("bounds are empty (max must exceed min)");
  });

  it("treats a non-list of maps as no maps, keeping the instances", () => {
    const { manifest, problem } = reject((m) => { (m as Record<string, unknown>).maps = {}; });
    expect(manifest.maps).toEqual([]);
    expect(manifest.instances).toHaveLength(2);
    expect(problem).toEqual({ path: "maps", reason: "is not a list" });
  });
});

describe("map manifest parser: fields the viewer never reads never cost an entry", () => {
  /** Breaks fields nobody reads, parses, and expects no problems and the entry still whole. */
  function stillWhole(breakIt: (manifest: Json) => void) {
    const manifest = copy();
    breakIt(manifest);
    const parsed = parseMapManifest(manifest);
    expect(parsed.problems).toEqual([]);
    return parsed.manifest;
  }

  it("an instance missing instanceType and directory loads whole: floors, renders and 3D map", () => {
    const manifest = stillWhole((m) => { delete m.instances[0].instanceType; delete m.instances[0].directory; });
    expect(manifest.instances?.[0].floors).toHaveLength(1);
    expect(manifest.instances?.[0].mesh?.path).toBe("3d/409.glb");
    expect(manifest.instances?.[0].renders?.path).toBe("renders/409.webp");
  });

  it("a map missing parentID and type, with flags null, loads whole with its art", () => {
    const manifest = stillWhole((m) => { delete m.maps[0].parentID; delete m.maps[0].type; m.maps[0].flags = null; });
    expect(manifest.maps[0].art?.[0].layers).toHaveLength(1);
    expect(manifest.maps[0].assignments).toHaveLength(1);
  });

  it("an assignment missing orderIndex and areaID loads whole", () => {
    const manifest = stillWhole((m) => { const assignment = (m.maps[0].assignments as Json[])[0]; delete assignment.orderIndex; delete assignment.areaID; });
    expect(manifest.maps[0].assignments?.[0].region).toEqual([0, 0, 0, 100, 100, 0]);
  });

  it("a layer missing minScale, maxScale and additionalZoomSteps loads whole", () => {
    const manifest = stillWhole((m) => {
      const layer = ((m.maps[0].art as Json[])[0].layers as Json[])[0];
      delete layer.minScale;
      delete layer.maxScale;
      delete layer.additionalZoomSteps;
    });
    expect(manifest.maps[0].art?.[0].layers[0].tiles).toHaveLength(1);
  });

  it("an art entry missing styleID and phaseID loads whole", () => {
    const manifest = stillWhole((m) => { const art = (m.maps[0].art as Json[])[0]; delete art.styleID; delete art.phaseID; });
    expect(manifest.maps[0].art?.[0].layers).toHaveLength(1);
  });

  it("other unread or key-only fields pass through too: tile fileDataID, overlay texture size, 3D map heights, styled triangles, reuse source, floor support (checked where it is used)", () => {
    const manifest = stillWhole((m) => {
      delete (((m.maps[0].art as Json[])[0].layers as Json[])[0].tiles as Json[])[0].fileDataID;
      delete ((m.maps[0].art as Json[])[0].overlays as Json[])[0].textureWidth;
      delete (m.instances[0].mesh as Json).zMin;
      (m.instances[0].mesh as Json).zMax = "high";
      delete (m.instances[0].styled as Json).triangles;
      (m.instances[0].reusedFrom as Json).mapID = "409";
      (m.instances[0].floorSupport as Json).version = 2;
    });
    expect(manifest.instances?.[0].mesh?.path).toBe("3d/409.glb");
    expect(manifest.instances?.[0].floorSupport?.version).toBe(2);
  });
});

describe("fetchMapManifestReport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the dropped entries and warns once for each", async () => {
    const broken = copy();
    (broken.instances[0].mesh as Json).frame = "wow-zup";
    broken.maps[0].name = "";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => broken })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { manifest, problems } = await fetchMapManifestReport("https://icons.example/");
    expect(problems).toHaveLength(2);
    expect(manifest.instances).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('Map manifest: dropped instances[0] (Molten Core, map 409).mesh: 3D map frame "wow-zup" is not wow-yup-mirrored-x');
    warn.mockRestore();
  });
});
