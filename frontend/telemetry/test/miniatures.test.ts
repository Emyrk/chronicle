import assert from "node:assert/strict";
import test from "node:test";

import {
  MINIATURE_MANIFEST_FORMAT,
  emptyMiniatureManifest,
  isMiniatureAssetPath,
  parseMiniatureManifest,
} from "../src/miniatures/manifest.ts";

function manifest(miniatures: unknown[]) {
  return { format: MINIATURE_MANIFEST_FORMAT, miniatures };
}

test("parses, sorts, and normalizes shared miniature assignments", () => {
  const parsed = parseMiniatureManifest(manifest([
    { name: "Totem", path: "miniatures/totem.glb", entry_ids: [3902, 2523] },
    { name: "Boss", path: "miniatures/boss.glb", entry_ids: [11502] },
  ]));
  assert.deepEqual(parsed.miniatures.map((item) => item.name), ["Boss", "Totem"]);
  assert.deepEqual(parsed.miniatures[1]?.entry_ids, [2523, 3902]);
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
  ])), /duplicate miniature path/);
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

test("provides an empty manifest for first-time setup", () => {
  assert.deepEqual(emptyMiniatureManifest(), { format: MINIATURE_MANIFEST_FORMAT, miniatures: [] });
});
