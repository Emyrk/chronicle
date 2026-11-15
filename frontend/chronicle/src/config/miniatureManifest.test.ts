import { describe, expect, it } from "vitest";
import fixture from "./fixtures/miniatureManifest.fixture.json";
import { parseMiniatureManifest, parseMiniatureManifestReport } from "./miniatureManifest";

type Model = Record<string, unknown>;
const copy = () => structuredClone(fixture) as unknown as { format: string; miniatures: Model[]; game_models: Model[] };

describe("miniature manifest parser: the shared fixture", () => {
  it("reads every field: map_scale, world_heights, entry_ids and the animation pack", () => {
    const { manifest, problems } = parseMiniatureManifestReport(copy());
    expect(problems).toEqual([]);
    expect(manifest.miniatures[0]).toEqual({ name: "Ragnaros", path: "miniatures/ragnaros.glb", entry_ids: [11502], map_scale: 2.5, world_heights: { 11502: 22.5 } });
    // map_scale defaults to 1; no world heights or animation pack when absent.
    expect(manifest.miniatures[1]).toEqual({ name: "Core Hound", path: "miniatures/core-hound.glb", entry_ids: [11671, 11673], map_scale: 1 });
    expect(manifest.game_models[0]).toEqual({
      name: "Onyxia",
      path: "miniatures/onyxia-game.glb",
      animation_path: "miniatures/onyxia-animations.glb",
      entry_ids: [10184],
      map_scale: 1.5,
      world_heights: { 10184: 18 },
    });
  });
});

describe("miniature manifest parser: a bad model is dropped on its own, with a reason", () => {
  function reject(breakIt: (manifest: ReturnType<typeof copy>) => void) {
    const manifest = copy();
    breakIt(manifest);
    const parsed = parseMiniatureManifestReport(manifest);
    expect(parsed.problems).toHaveLength(1);
    return { ...parsed, problem: parsed.problems[0] };
  }

  it("drops a model with an invalid map scale; the others load", () => {
    const { manifest, problem } = reject((m) => { m.miniatures[0].map_scale = 50; });
    expect(manifest.miniatures.map((model) => model.name)).toEqual(["Core Hound"]);
    expect(manifest.game_models).toHaveLength(1);
    expect(problem).toEqual({ path: 'miniatures[0] "Ragnaros"', reason: "Miniature 0 has an invalid map scale" });
  });

  it("drops a model with a world height for an unassigned entry", () => {
    expect(reject((m) => { m.miniatures[0].world_heights = { 1: 5 }; }).problem.reason).toBe("Miniature 0 has a world height for unassigned entry ID 1");
  });

  it("drops a model with an invalid entry ID, and a later model that repeats an entry (the first keeps it)", () => {
    expect(reject((m) => { m.miniatures[1].entry_ids = [0]; }).problem.reason).toBe("Miniature 1 has an invalid entry ID");
    const { manifest, problem } = reject((m) => { m.miniatures[1].entry_ids = [11502]; });
    expect(manifest.miniatures.map((model) => model.name)).toEqual(["Ragnaros"]);
    expect(problem.reason).toBe("Duplicate miniature entry ID: 11502");
  });

  it("drops a game model with an invalid animation pack", () => {
    const { manifest, problem } = reject((m) => { m.game_models[0].animation_path = "animations/onyxia.glb"; });
    expect(manifest.game_models).toEqual([]);
    expect(problem.reason).toBe("Game model 0 has an invalid animation path");
  });

  it("drops a model with a path outside miniatures/", () => {
    expect(reject((m) => { m.miniatures[1].path = "miniatures/nested/hound.glb"; }).problem.reason).toBe("Miniature 1 has an invalid path");
  });

  it("does not let a dropped model claim its entries or path", () => {
    const manifest = copy();
    manifest.miniatures.unshift({ name: "Broken", path: "miniatures/ragnaros.glb", entry_ids: [11502], map_scale: "big" });
    const { manifest: parsed, problems } = parseMiniatureManifestReport(manifest);
    expect(problems.map((problem) => problem.reason)).toEqual(["Miniature 0 has an invalid map scale"]);
    expect(parsed.miniatures.map((model) => model.name)).toEqual(["Ragnaros", "Core Hound"]);
  });

  it("keeps the strict form for publishing checks: any problem rejects, with the same reason", () => {
    const manifest = copy();
    manifest.miniatures[0].map_scale = 50;
    expect(() => parseMiniatureManifest(manifest)).toThrow("Miniature 0 has an invalid map scale");
    expect(parseMiniatureManifest(copy()).miniatures).toHaveLength(2);
  });
});
