import { describe, expect, it } from "vitest";
import { MINIATURE_MANIFEST_FORMAT, type MiniatureManifest } from "@/pages/Instance/EventsPanels/Map/bossMinis";
import { filterRegistryModels, registryModels } from "./modelRegistry";

const manifest: MiniatureManifest = {
  format: MINIATURE_MANIFEST_FORMAT,
  miniatures: [
    { name: "mc-ragnaros-mini", path: "miniatures/ragnaros-mini.glb", entry_ids: [11502], map_scale: 1 },
  ],
  game_models: [
    { name: "mc-ragnaros", path: "miniatures/ragnaros-game.glb", entry_ids: [11502], map_scale: 1.5 },
    { name: "bwl-nefarian", path: "miniatures/nefarian-game.glb", entry_ids: [11583], map_scale: 1 },
  ],
};

describe("MiniaturesPage registry tabs", () => {
  it("selects tabletop miniatures and original game models independently", () => {
    expect(registryModels(manifest, "miniatures")).toEqual(manifest.miniatures);
    expect(registryModels(manifest, "game_models")).toEqual(manifest.game_models);
    expect(registryModels(undefined, "game_models")).toEqual([]);
  });

  it("filters the active collection by name, path, or NPC entry", () => {
    expect(filterRegistryModels(manifest.game_models, "nefarian")).toEqual([manifest.game_models[1]]);
    expect(filterRegistryModels(manifest.game_models, "ragnaros-game")).toEqual([manifest.game_models[0]]);
    expect(filterRegistryModels(manifest.game_models, "11583")).toEqual([manifest.game_models[1]]);
    expect(filterRegistryModels(manifest.game_models, "missing")).toEqual([]);
  });
});
