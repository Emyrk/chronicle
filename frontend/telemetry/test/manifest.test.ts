import assert from "node:assert/strict";
import test from "node:test";

import {
  MAP_MANIFEST_NAMESPACES,
  isPreviewableMapAssetPath,
  mergeMapManifests,
  parseMapLayer,
  parseMapManifest,
} from "../src/maps/manifest.ts";

const target = { product: "wow_classic_beta", build: "1.2.3", region: "us", locale: "enUS" };
const portableTarget = { product: target.product };

function original() {
  return {
    format: "chronicle-wow-map-art-v2",
    target,
    maps: [{ id: 1411, name: "Durotar", parentID: 0, type: 0, flags: 0 }],
    instances: [{
      mapID: 43,
      name: "Wailing Caverns",
      instanceType: 1,
      directory: "WailingCaverns",
      floors: [],
      rendered: { path: "render/stale.png", width: 1, height: 1 },
      renders: { path: "renders/stale.png", width: 1, height: 1 },
    }],
  };
}

function layer(instance: Record<string, unknown>, layerTarget: Record<string, unknown> = portableTarget) {
  return { format: "chronicle-wow-map-art-v2", target: layerTarget, instances: [instance] };
}

test("exports the supported namespaces", () => {
  assert.deepEqual(MAP_MANIFEST_NAMESPACES, [
    "forever", "kronos", "octowow", "turtle", "tbc", "vanillaplus", "warmane", "azerothcore",
  ]);
});

test("merges layers in deterministic order and strips original artwork", () => {
  const merged = mergeMapManifests(original(), {
    "3d": layer({ mapID: 43, "3d": { path: "3d/wailing-caverns.glb" } }),
    renders: layer({ mapID: 43, renders: { path: "renders/wailing-caverns.png", width: 1600, height: 1000 } }),
    styled: layer({ mapID: 43, styled: { path: "render-styled/wailing-caverns.jpeg", width: 1600, height: 1000 } }),
    render: layer({ mapID: 43, rendered: { path: "render/wailing-caverns.png", width: 1200, height: 800 } }, target),
  });

  assert.deepEqual(Object.keys(merged.instances[0]!), [
    "mapID", "name", "instanceType", "directory", "floors", "rendered", "styled", "renders", "3d",
  ]);
  assert.equal(merged.instances[0]?.rendered?.source, "");
  assert.deepEqual(merged.instances[0]?.rendered?.bounds, { minX: 0, maxX: 0, minY: 0, maxY: 0 });
  assert.doesNotThrow(() => JSON.stringify(merged));
});

test("rejects an incompatible target", () => {
  assert.throws(
    () => mergeMapManifests(original(), { renders: layer({ mapID: 43, renders: { path: "renders/a.png", width: 1, height: 1 } }, target) }),
    /target does not match/,
  );
});

test("rejects unsafe asset paths", () => {
  assert.throws(
    () => mergeMapManifests(original(), { "3d": layer({ mapID: 43, "3d": { path: "3d\/../other.glb" } }) }),
    /invalid 3d/,
  );
});

test("rejects invalid manual dimensions and extensions", () => {
  assert.throws(
    () => mergeMapManifests(original(), { renders: layer({ mapID: 43, renders: { path: "renders/a.png", width: 0, height: 1 } }) }),
    /invalid renders/,
  );
  assert.throws(
    () => mergeMapManifests(original(), { "3d": layer({ mapID: 43, "3d": { path: "3d/a.gltf" } }) }),
    /invalid 3d/,
  );
});

test("rejects duplicate IDs", () => {
  const duplicate = original();
  duplicate.instances.push({ ...duplicate.instances[0]!, rendered: undefined, renders: undefined });
  assert.throws(() => mergeMapManifests(duplicate), /duplicate original instance/);

  assert.throws(
    () => mergeMapManifests(original(), { renders: { ...layer({ mapID: 43, renders: { path: "renders/a.png", width: 1, height: 1 } }), instances: [
      { mapID: 43, renders: { path: "renders/a.png", width: 1, height: 1 } },
      { mapID: 43, renders: { path: "renders/b.png", width: 1, height: 1 } },
    ] } }),
    /duplicate renders/,
  );
});

test("creates and sorts manual-only instances", () => {
  const merged = mergeMapManifests(original(), {
    renders: { ...layer({}), instances: [
      { mapID: 2999, name: "Ruins of Lordaeron", renders: { path: "renders/rol.png", width: 1024, height: 1024 } },
      { mapID: 389, name: "Ragefire Chasm", renders: { path: "renders/rfc.png", width: 1774, height: 2400 } },
    ] },
    "3d": layer({ mapID: 389, name: "Ragefire Chasm", "3d": { path: "3d/rfc.glb" } }),
  });

  assert.deepEqual(merged.instances.map((instance) => instance.mapID), [43, 389, 2999]);
  assert.deepEqual(merged.instances[1]?.floors, []);
  assert.equal(merged.instances[1]?.instanceType, 1);
});

test("rejects conflicting manual instance names", () => {
  assert.throws(() => mergeMapManifests(original(), {
    renders: layer({ mapID: 389, name: "Ragefire Chasm", renders: { path: "renders/rfc.png", width: 1, height: 1 } }),
    "3d": layer({ mapID: 389, name: "Wrong", "3d": { path: "3d/rfc.glb" } }),
  }), /conflicting names/);
});

test("requires exactly the artwork field belonging to the layer", () => {
  assert.throws(() => mergeMapManifests(original(), {
    renders: layer({
      mapID: 43,
      renders: { path: "renders/a.png", width: 1, height: 1 },
      "3d": { path: "3d/a.glb" },
    }),
  }), /only its own artwork/);

  assert.throws(() => mergeMapManifests(original(), {
    styled: layer({ mapID: 43, rendered: { path: "render/a.png", width: 1, height: 1 } }),
  }), /styled/);
});

test("allows only clean preview asset paths from known map layers", () => {
  for (const path of [
    "original/123.webp",
    "render/43-build-digest.png",
    "render-styled/wailing-caverns.jpeg",
    "renders/wailing-caverns.png",
    "3d/wailing-caverns.glb",
  ]) {
    assert.equal(isPreviewableMapAssetPath(path), true, path);
  }
  for (const path of ["", "manifest.json", "3d/../secret.glb", "original//123.webp", "other/map.png", "3d\\map.glb"]) {
    assert.equal(isPreviewableMapAssetPath(path), false, path);
  }
});

test("rejects unknown fields recursively", () => {
  assert.throws(() => parseMapLayer({ ...layer({ mapID: 43, renders: { path: "renders/a.png", width: 1, height: 1, extra: true } }) }), /unknown field/);
  assert.throws(() => parseMapManifest({ ...original(), maps: [{ ...original().maps[0], extra: true }] }), /unknown field/);
});
