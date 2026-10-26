import { describe, expect, it } from "vitest";
import type { SupportedInstance } from "@/api/typesGenerated";
import type { WowMapInstance, WowMapManifest } from "@/pages/Technical/mapGallery";
import { dungeonShelfCards } from "./dungeonShelf";

const supported = (name: string, zoneNames?: string[]): SupportedInstance => ({
  name,
  category: "dungeon",
  zone_names: zoneNames,
});

const entry = (name: string, withMesh = false): WowMapInstance => ({
  mapID: 0,
  name,
  instanceType: 1,
  directory: name,
  floors: [],
  mesh: withMesh
    ? { path: "meshes/x.glb", bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, zMin: 0, zMax: 1, frame: "f" }
    : undefined,
});

const manifest = (instances: WowMapInstance[]): WowMapManifest => ({
  format: "chronicle-wow-map-art-v2",
  target: { product: "", build: "", region: "", locale: "" },
  maps: [],
  instances,
});

describe("dungeonShelfCards", () => {
  const instances = [
    supported("The Deadmines"),
    supported("Zul'Gurub"),
    supported("Excavation Site", ["Excavation Site: Wetlands"]),
    supported("Wailing Caverns"),
  ];

  it("marks mesh entries 3D, other entries 2D, the rest coming, in that order", () => {
    const cards = dungeonShelfCards(instances, manifest([
      entry("Wailing Caverns", true),
      entry("Zul'Gurub"),
      entry("Excavation Site: Wetlands"),
    ]));
    expect(cards).toEqual([
      { name: "Wailing Caverns", kind: "3d" },
      { name: "Excavation Site", kind: "2d" },
      { name: "Zul'Gurub", kind: "2d" },
      { name: "The Deadmines", kind: "coming" },
    ]);
  });

  it("flips a card to 3D when its manifest entry gains a mesh", () => {
    const before = dungeonShelfCards(instances, manifest([entry("Zul'Gurub")]));
    const after = dungeonShelfCards(instances, manifest([entry("Zul'Gurub", true)]));
    expect(before.find((c) => c.name === "Zul'Gurub")?.kind).toBe("2d");
    expect(after[0]).toEqual({ name: "Zul'Gurub", kind: "3d" });
  });

  it("lists every instance as coming before the manifest loads", () => {
    expect(dungeonShelfCards(instances, undefined).every((c) => c.kind === "coming")).toBe(true);
  });
});
