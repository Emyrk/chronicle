import assert from "node:assert/strict";
import test from "node:test";

import {
  MINIATURE_MANIFEST_FORMAT,
  emptyMiniatureManifest,
  isMiniatureAssetPath,
  parseMiniatureManifest,
} from "../src/miniatures/manifest.ts";

function manifest(miniatures: unknown[], game_models: unknown[] = []) {
  return { format: MINIATURE_MANIFEST_FORMAT, miniatures, game_models };
}

test("parses, sorts, and normalizes shared miniature assignments", () => {
  const parsed = parseMiniatureManifest(manifest([
    { name: "Totem", path: "miniatures/totem.glb", entry_ids: [3902, 2523] },
    { name: "Boss", path: "miniatures/boss.glb", entry_ids: [11502] },
  ]));
  assert.deepEqual(parsed.miniatures.map((item) => item.name), ["Boss", "Totem"]);
  assert.deepEqual(parsed.miniatures[1]?.entry_ids, [2523, 3902]);
});

test("parses original game models independently from tabletop miniatures", () => {
  const parsed = parseMiniatureManifest(manifest(
    [{ name: "Boss miniature", path: "miniatures/boss-mini.glb", entry_ids: [11502] }],
    [{ name: "Boss game model", path: "miniatures/boss-game.glb", entry_ids: [11502] }],
  ));
  assert.deepEqual(parsed.game_models, [
    { name: "Boss game model", path: "miniatures/boss-game.glb", entry_ids: [11502], map_scale: 1 },
  ]);
});

test("defaults game models for existing v1 manifests", () => {
  const parsed = parseMiniatureManifest({
    format: MINIATURE_MANIFEST_FORMAT,
    miniatures: [{ name: "Boss", path: "miniatures/boss.glb", entry_ids: [11502] }],
  });
  assert.deepEqual(parsed.game_models, []);
});

test("normalizes and validates per-model map scale", () => {
  const parsed = parseMiniatureManifest(manifest([
    { name: "Default", path: "miniatures/default.glb", entry_ids: [1] },
    { name: "Large", path: "miniatures/large.glb", entry_ids: [2], map_scale: 1.75 },
  ]));
  assert.equal(parsed.miniatures.find((item) => item.name === "Default")?.map_scale, 1);
  assert.equal(parsed.miniatures.find((item) => item.name === "Large")?.map_scale, 1.75);
  for (const map_scale of [0, -1, 10.1, Number.NaN, Number.POSITIVE_INFINITY, "2"]) {
    assert.throws(() => parseMiniatureManifest(manifest([
      { name: "Invalid", path: "miniatures/invalid.glb", entry_ids: [3], map_scale },
    ])), /map_scale/);
  }
});

test("validates client-derived world heights by assigned entry", () => {
  const parsed = parseMiniatureManifest(manifest([
    { name: "Shared", path: "miniatures/shared.glb", entry_ids: [1, 2], world_heights: { 1: 4.5, 2: 7 } },
  ]));
  assert.deepEqual(parsed.miniatures[0]?.world_heights, { 1: 4.5, 2: 7 });
  assert.throws(() => parseMiniatureManifest(manifest([
    { name: "Invalid", path: "miniatures/invalid.glb", entry_ids: [1], world_heights: { 2: 4 } },
  ])), /unassigned entry ID/);
});

test("rejects duplicate entry assignments across models", () => {
  assert.throws(() => parseMiniatureManifest(manifest([
    { name: "One", path: "miniatures/one.glb", entry_ids: [42] },
    { name: "Two", path: "miniatures/two.glb", entry_ids: [42] },
  ])), /entry ID 42 is assigned/);
});

test("rejects duplicate paths and entry IDs", () => {
  assert.throws(() => parseMiniatureManifest(manifest([
    { name: "One", path: "miniatures/shared.glb", entry_ids: [1] },
    { name: "Two", path: "miniatures/shared.glb", entry_ids: [2] },
  ])), /duplicate model path/);
  assert.throws(() => parseMiniatureManifest(manifest([
    { name: "One", path: "miniatures/one.glb", entry_ids: [1, 1] },
  ])), /contains duplicates/);
});

test("requires a name, model path, and positive entry IDs", () => {
  for (const item of [
    { name: "", path: "miniatures/a.glb", entry_ids: [1] },
    { name: "A", path: "3d/a.glb", entry_ids: [1] },
    { name: "A", path: "miniatures/a.gltf", entry_ids: [1] },
    { name: "A", path: "miniatures/a.glb", entry_ids: [] },
    { name: "A", path: "miniatures/a.glb", entry_ids: [0] },
    { name: "A", path: "miniatures/a.glb", entry_ids: [0x1_0000_0000] },
  ]) assert.throws(() => parseMiniatureManifest(manifest([item])));
});

test("rejects unknown fields and unsafe asset paths", () => {
  assert.throws(() => parseMiniatureManifest({ ...manifest([]), extra: true }), /unknown field/);
  assert.throws(() => parseMiniatureManifest(manifest([
    { name: "A", path: "miniatures/a.glb", entry_ids: [1], scale: 2 },
  ])), /unknown field/);
  for (const path of ["miniatures/a.glb", "miniatures/a-b-123.glb"]) assert.equal(isMiniatureAssetPath(path), true);
  for (const path of ["", "miniatures/.glb", "miniatures/../a.glb", "miniatures/nested/a.glb", "miniatures//a.glb", "miniatures\\a.glb"]) assert.equal(isMiniatureAssetPath(path), false);
});

test("Miniature Foundry edits tabletop and original game models", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../src/dashboard/miniatures.tsx", import.meta.url), "utf8");
  assert.match(page, /id="add-game-model"/);
  assert.match(page, /game_models/);
  assert.match(page, /original animated GLB extracted from the game files/);
  assert.match(page, /id="map-scale"/);
  assert.match(page, /Blue capsule/);
  assert.match(page, /new THREE\.CapsuleGeometry/);
  assert.match(page, /item\.entry_ids\.join\(', '\)/);
  assert.match(page, /replaceAll\(escapedNewline,' '\)/);
  assert.match(page, /new RegExp\(separators\)/);
  assert.match(page, /id="selection-count"/);
  assert.match(page, /id="select-visible"/);
  assert.match(page, /id="bulk-scale"/);
  assert.match(page, /id="apply-scale"/);
  assert.match(page, /for\(const item of bulkSelected\)item\.map_scale=scale/);
});

test("provides an empty manifest for first-time setup", () => {
  assert.deepEqual(emptyMiniatureManifest(), { format: MINIATURE_MANIFEST_FORMAT, miniatures: [], game_models: [] });
});
