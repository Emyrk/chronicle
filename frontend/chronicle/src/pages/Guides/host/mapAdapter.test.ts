import { describe, expect, it } from "vitest";
import type { WowMapManifest } from "@/pages/Technical/mapGallery";
import { applySceneBatch, createInitialScene, type SceneOperation } from "../protocol";
import { adaptGuideMapScene, parseUnitEntry, resolveGuideMap } from "./mapAdapter";

describe("resolveGuideMap", () => {
  it("prefers bounded instance renders, exposes a placeable mesh, and round-trips normalized coordinates", () => {
    const manifest: WowMapManifest = {
      format: "chronicle-wow-map-art-v2",
      target: { product: "wow", build: "1", region: "us", locale: "enUS" },
      maps: [],
      instances: [{
        mapID: 249,
        name: "Onyxia's Lair",
        instanceType: 2,
        directory: "Onyxia",
        floors: [],
        renders: { path: "renders/249.webp", width: 1000, height: 800, bounds: { minX: 100, maxX: 300, minY: 400, maxY: 700 } },
        mesh: { path: "3d/249.glb", bounds: { minX: 100, maxX: 300, minY: 400, maxY: 700 }, zMin: 0, zMax: 40, frame: "wow-yup-mirrored-x" },
      }],
    };

    const resolved = resolveGuideMap(manifest, 249, "https://assets.example");
    expect(resolved?.ground.canvas).toMatchObject({ path: "renders/249.webp", source: "renders" });
    expect(resolved?.dungeonMesh?.url).toBe("https://assets.example/maps/3d/249.glb");
    const world = resolved!.normalizedToWorld(0.25, 0.75);
    expect(world).toEqual({ x: 150, y: 625 });
    expect(resolved!.projectSample({ timestampMs: 0, mapId: 249, ...world })).toEqual({ leftPercent: 25, topPercent: 75 });
    expect(resolved!.normalizedRadiusToYards(0.1)).toBe(20);
  });
});

describe("adaptGuideMapScene", () => {
  it("converts units, tactical shapes, map text, and closed polygons into renderer data", () => {
    const operations: SceneOperation[] = [
      { op: "create", id: "boss", kind: "unit", parentId: null, props: { x: 0.2, y: 0.3, size: 24, unit: "Creature-0-0-0-0-10184-0000000000", label: "Onyxia", role: "boss", facing: 1 } },
      { op: "create", id: "label", kind: "map-text", parentId: null, props: { x: 0.2, y: 0.3, text: "Tank here", fontSize: 14, color: "#fff" } },
      { op: "create", id: "arrow", kind: "arrow", parentId: null, props: { points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }], color: "#ff0000", width: 2, headSize: 8 } },
      { op: "create", id: "poly", kind: "polygon", parentId: null, props: { points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }], color: "#00ff00", width: 2 } },
    ];
    const scene = applySceneBatch(createInitialScene(), operations);
    const map = {
      ground: { iconBaseUrl: "", canvas: { floor: 0, width: 1, height: 1, tileWidth: 0, tileHeight: 0, tiles: [] } },
      dungeonMesh: null,
      projectSample: () => null,
      normalizedToWorld: (x: number, y: number) => ({ x: x * 100, y: y * 100 }),
      normalizedRadiusToYards: (radius: number) => radius * 100,
    };

    const adapted = adaptGuideMapScene(scene, map, 249);
    expect(adapted.markers).toHaveLength(1);
    expect(adapted.markers[0]).toMatchObject({ guid: "boss", kind: "hostile", entry: 10184, point: { leftPercent: 20, topPercent: 30 } });
    expect(adapted.bossGuids).toEqual(new Set(["boss"]));
    expect(adapted.planItems.find((item) => item.id === "label")).toMatchObject({ kind: "text", text: "Tank here", color: "#ffffff" });
    expect(adapted.planItems.find((item) => item.id === "arrow")).toMatchObject({ kind: "arrow", points: [{ x: 10, y: 20 }, { x: 40, y: 50 }] });
    const polygon = adapted.planItems.find((item) => item.id === "poly");
    expect(polygon).toMatchObject({ kind: "pen" });
    if (polygon?.kind !== "pen") throw new Error("polygon was not converted to pen");
    expect(polygon.points[0]).toEqual(polygon.points.at(-1));
  });

  it("parses explicit entries and creature GUIDs without guessing arbitrary text", () => {
    expect(parseUnitEntry("npc:10184")).toBe(10184);
    expect(parseUnitEntry("Creature-0-0-0-0-10184-0000000000")).toBe(10184);
    expect(parseUnitEntry("Onyxia")).toBeUndefined();
  });
});
