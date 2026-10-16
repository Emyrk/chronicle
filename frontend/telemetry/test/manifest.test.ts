import assert from "node:assert/strict";
import test from "node:test";

import {
  MAP_MANIFEST_NAMESPACES,
  MAP_NAMESPACE_PRODUCTS,
  emptyMapManifest,
  isPreviewableMapAssetPath,
  mergeMapManifests,
  parseMapLayer,
  parseMapManifest,
  recoverMapManifestBase,
  recoverMapManifestLayers,
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
      renders: { path: "renders/stale.png", width: 1, height: 1 },
    }],
  };
}

function mesh(path: string) {
  return { path, bounds: { minX: -10, maxX: 20, minY: 30, maxY: 40 }, zMin: -5, zMax: 15, frame: "wow-yup-mirrored-x" };
}

function layer(instance: Record<string, unknown>, layerTarget: Record<string, unknown> = portableTarget) {
  return { format: "chronicle-wow-map-art-v2", target: layerTarget, instances: [instance] };
}

test("exports the supported namespaces", () => {
  assert.deepEqual(MAP_MANIFEST_NAMESPACES, [
    "forever", "kronos", "epoch", "turtle", "tbc", "vanillaplus", "warmane", "ascension", "azerothcore",
  ]);
});

test("bootstraps every foundry namespace with its product", () => {
  assert.equal(MAP_NAMESPACE_PRODUCTS.forever, "wow_classic_beta");
  for (const namespace of MAP_MANIFEST_NAMESPACES) {
    const manifest = emptyMapManifest(namespace);
    assert.equal(manifest.target.product, MAP_NAMESPACE_PRODUCTS[namespace]);
    assert.deepEqual(manifest.maps, []);
    assert.deepEqual(manifest.instances, []);
  }
});

test("recovers a v1 reader manifest as a clean v2 native base", () => {
  const reader = {
    ...original(),
    format: "chronicle-wow-map-art-v1",
    target: { ...target, product: "turtle" },
    instances: [{
      ...original().instances[0],
      styled: { path: "render-styled/wc.jpeg", width: 10, height: 10, source: "manual", bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 } },
      renders: { path: "renders/wc.png", width: 10, height: 10 },
      mesh: mesh("3d/wc.glb"),
    }],
  };
  const layers = recoverMapManifestLayers(reader);
  assert.equal((layers.renders as { instances: { renders: { path: string } }[] }).instances[0]?.renders.path, "renders/wc.png");
  assert.equal((layers.meshes as { instances: { mesh: { path: string } }[] }).instances[0]?.mesh.path, "3d/wc.glb");
  assert.equal((layers.styled as { instances: { styled: { path: string } }[] }).instances[0]?.styled.path, "render-styled/wc.jpeg");
  const recovered = recoverMapManifestBase(reader, "turtle");
  assert.equal(recovered.format, "chronicle-wow-map-art-v2");
  assert.equal(recovered.target.product, "turtle");
  assert.deepEqual(recovered.instances[0], {
    mapID: 43,
    name: "Wailing Caverns",
    instanceType: 1,
    directory: "WailingCaverns",
    floors: [],
  });
});

test("rejects incompatible reader formats and namespace products", () => {
  assert.throws(
    () => recoverMapManifestBase({ ...original(), format: "chronicle-wow-map-art-v0" }, "forever"),
    /unsupported map reader manifest format/,
  );
  assert.throws(
    () => recoverMapManifestBase({ ...original(), format: "chronicle-wow-map-art-v1" }, "turtle"),
    /does not match namespace product/,
  );
});

test("merges layers in deterministic order and strips original artwork", () => {
  const merged = mergeMapManifests(original(), {
    meshes: layer({ mapID: 43, mesh: mesh("3d/wailing-caverns.glb") }),
    renders: layer({ mapID: 43, renders: { path: "renders/wailing-caverns.png", width: 1600, height: 1000 } }),
    styled: layer({ mapID: 43, styled: { path: "render-styled/wailing-caverns.jpeg", width: 1600, height: 1000 } }),
  });

  assert.deepEqual(Object.keys(merged.instances[0]!), [
    "mapID", "name", "instanceType", "directory", "floors", "styled", "renders", "mesh",
  ]);
  assert.equal(merged.instances[0]?.mesh?.frame, "wow-yup-mirrored-x");
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
    () => mergeMapManifests(original(), { meshes: layer({ mapID: 43, mesh: mesh("3d/../other.glb") }) }),
    /invalid meshes/,
  );
});

test("rejects invalid manual dimensions and extensions", () => {
  assert.throws(
    () => mergeMapManifests(original(), { renders: layer({ mapID: 43, renders: { path: "renders/a.png", width: 0, height: 1 } }) }),
    /invalid renders/,
  );
  assert.throws(
    () => mergeMapManifests(original(), { meshes: layer({ mapID: 43, mesh: mesh("3d/a.gltf") }) }),
    /invalid meshes/,
  );
});

test("rejects duplicate IDs", () => {
  const duplicate = original();
  duplicate.instances.push({ ...duplicate.instances[0]!, renders: undefined });
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
    meshes: layer({ mapID: 389, name: "Ragefire Chasm", mesh: mesh("3d/rfc.glb") }),
  });

  assert.deepEqual(merged.instances.map((instance) => instance.mapID), [43, 389, 2999]);
  assert.deepEqual(merged.instances[1]?.floors, []);
  assert.equal(merged.instances[1]?.instanceType, 1);
});

test("rejects conflicting manual instance names", () => {
  assert.throws(() => mergeMapManifests(original(), {
    renders: layer({ mapID: 389, name: "Ragefire Chasm", renders: { path: "renders/rfc.png", width: 1, height: 1 } }),
    meshes: layer({ mapID: 389, name: "Wrong", mesh: mesh("3d/rfc.glb") }),
  }), /conflicting names/);
});

test("requires exactly the artwork field belonging to the layer", () => {
  assert.throws(() => mergeMapManifests(original(), {
    renders: layer({
      mapID: 43,
      renders: { path: "renders/a.png", width: 1, height: 1 },
      mesh: mesh("3d/a.glb"),
    }),
  }), /only its own artwork/);

  assert.throws(() => mergeMapManifests(original(), {
    styled: layer({ mapID: 43, renders: { path: "renders/a.png", width: 1, height: 1 } }),
  }), /styled/);
});

test("allows only clean preview asset paths from known map layers", () => {
  for (const path of [
    "original/123.webp",
    "tiles/7474519.webp",
    "render-styled/wailing-caverns.jpeg",
    "renders/wailing-caverns.png",
    "3d/wailing-caverns.glb",
  ]) {
    assert.equal(isPreviewableMapAssetPath(path), true, path);
  }
  for (const path of ["", "manifest.json", "3d/../secret.glb", "original//123.webp", "other/map.png", "3d\\map.glb", "render/old.png"]) {
    assert.equal(isPreviewableMapAssetPath(path), false, path);
  }
});

test("requires explicit calibrated mesh metadata and rejects legacy layers", () => {
  for (const bad of [
    { path: "3d/old.glb" },
    { ...mesh("3d/a.glb"), bounds: { maxX: 1, minY: 1, maxY: 2 } },
    { ...mesh("3d/a.glb"), bounds: { minX: 0, maxX: 0, minY: 1, maxY: 2 } },
    { ...mesh("3d/a.glb"), zMax: -5 },
    { ...mesh("3d/a.glb"), frame: "unknown" },
    { ...mesh("3d/a.glb"), liquid: { color: "red", opacity: 0 } },
  ]) {
    assert.throws(() => mergeMapManifests(original(), { meshes: layer({ mapID: 43, mesh: bad }) }));
  }
  assert.throws(() => parseMapManifest({ ...original(), instances: [{ ...original().instances[0], "3d": { path: "3d/a.glb" } }] }), /unknown field/);
  assert.deepEqual(mergeMapManifests(original(), { meshes: layer({ mapID: 43, mesh: { ...mesh("3d/a.glb"), liquid: { color: "#aabbcc", opacity: 0.5 } } }) }).instances[0]?.mesh?.liquid, { color: "#aabbcc", opacity: 0.5 });
});

test("rejects unknown fields recursively", () => {
  assert.throws(() => parseMapLayer({ ...layer({ mapID: 43, renders: { path: "renders/a.png", width: 1, height: 1, extra: true } }) }), /unknown field/);
  assert.throws(() => parseMapManifest({ ...original(), maps: [{ ...original().maps[0], extra: true }] }), /unknown field/);
});
