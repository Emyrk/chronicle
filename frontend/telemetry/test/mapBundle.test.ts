import assert from "node:assert/strict";
import test from "node:test";

import { createMapBundleTools } from "../src/dashboard/mapBundle.ts";

const encoder = new TextEncoder();
const tools = createMapBundleTools();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

interface ZipInput {
  name: string;
  bytes: Uint8Array;
  method?: number;
  flags?: number;
  centralExtra?: Uint8Array;
}

function storedZip(inputs: ZipInput[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const input of inputs) {
    const name = encoder.encode(input.name);
    const method = input.method ?? 0;
    const flags = input.flags ?? 0x0800;
    const checksum = crc32(input.bytes);
    const local = new Uint8Array(30 + name.length + input.bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, flags, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, input.bytes.length, true);
    localView.setUint32(22, input.bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(input.bytes, 30 + name.length);
    localParts.push(local);

    const extra = input.centralExtra ?? new Uint8Array();
    const central = new Uint8Array(46 + name.length + extra.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, flags, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, input.bytes.length, true);
    centralView.setUint32(24, input.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, extra.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    central.set(extra, 46 + name.length);
    centralParts.push(central);
    localOffset += local.length;
  }
  const central = concat(centralParts);
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, inputs.length, true);
  view.setUint16(10, inputs.length, true);
  view.setUint32(12, central.length, true);
  view.setUint32(16, localOffset, true);
  return concat([...localParts, central, eocd]);
}

function instances() {
  return [{
    mapID: 43,
    name: "Wailing Caverns",
    floors: [{ floor: 0 }, { floor: 1 }],
  }];
}

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    format: "chronicle-map-foundry-bundle-v1",
    namespace: "azerothcore",
    maps: [{
      mapID: 43,
      floors: [{
        floor: 0,
        preferred2D: "art",
        render: { file: "assets/floor.png", bounds: { minX: 1, maxX: 2, minY: 3, maxY: 4 } },
        mesh: { file: "assets/floor.glb", bounds: { minX: 10, maxX: 20, minY: 30, maxY: 40 }, zMin: -5, zMax: 15, frame: "wow-yup-mirrored-x" },
      }],
    }],
    ...overrides,
  };
}

test("STORED ZIP parser reads root metadata and asset files", () => {
  const zip = storedZip([
    { name: "foundry.json", bytes: encoder.encode("{}") },
    { name: "assets/map.png", bytes: new Uint8Array([1, 2, 3]) },
  ]);
  const files = tools.parseStoredZip(zip);
  assert.deepEqual([...files.keys()], ["foundry.json", "assets/map.png"]);
  assert.deepEqual(files.get("assets/map.png"), new Uint8Array([1, 2, 3]));
});

test("STORED ZIP parser rejects unsafe, duplicate, encrypted, compressed, ZIP64, and malformed archives", () => {
  assert.throws(() => tools.parseStoredZip(storedZip([{ name: "map.png", bytes: new Uint8Array([1]) }])), /missing root foundry.json/);
  assert.throws(() => tools.parseStoredZip(storedZip([{ name: "../map.png", bytes: new Uint8Array([1]) }])), /unsafe ZIP entry name/);
  assert.throws(() => tools.parseStoredZip(storedZip([
    { name: "map.png", bytes: new Uint8Array([1]) },
    { name: "map.png", bytes: new Uint8Array([2]) },
  ])), /duplicate ZIP entry name/);
  assert.throws(() => tools.parseStoredZip(storedZip([{ name: "map.png", bytes: new Uint8Array([1]), flags: 0x0801 }])), /encrypted ZIP entries/);
  assert.throws(() => tools.parseStoredZip(storedZip([{ name: "map.png", bytes: new Uint8Array([1]), method: 8 }])), /STORED compression method/);
  assert.throws(() => tools.parseStoredZip(storedZip([{ name: "map.png", bytes: new Uint8Array([1]), centralExtra: new Uint8Array([1, 0, 0, 0]) }])), /ZIP64 archives/);
  const malformed = storedZip([{ name: "map.png", bytes: new Uint8Array([1]) }]);
  new DataView(malformed.buffer).setUint32(malformed.length - 6, 1, true);
  assert.throws(() => tools.parseStoredZip(malformed), /central directory is malformed/);
});

test("bundle validation checks namespace, existing floors, metadata, files, and defaults preferred2D", async () => {
  const png = new Uint8Array([1, 2, 3]);
  const glb = new Uint8Array([4, 5, 6]);
  const files = new Map([["assets/floor.png", png], ["assets/floor.glb", glb]]);
  const plan = await tools.validateMapFoundryBundle(bundle(), files, "azerothcore", instances());
  assert.equal(plan.assets.length, 2);
  assert.deepEqual(plan.maps[0], { mapID: 43, firstFloor: 0, floors: [{ floor: 0, preferred2D: "art" }] });

  const defaultPlan = await tools.validateMapFoundryBundle(bundle({
    maps: [{ mapID: 43, floors: [{ floor: 0, render: { file: "assets/floor.png" } }] }],
  }), files, "azerothcore", instances());
  assert.equal(defaultPlan.maps[0]?.floors[0]?.preferred2D, "renders");

  await assert.rejects(() => tools.validateMapFoundryBundle(bundle(), files, "forever", instances()), /does not match selected namespace/);
  await assert.rejects(() => tools.validateMapFoundryBundle(bundle({ maps: [{ mapID: 43, floors: [{ floor: 9, render: { file: "assets/floor.png" } }] }] }), files, "azerothcore", instances()), /unknown mapID 43 floor 9/);
  await assert.rejects(() => tools.validateMapFoundryBundle(bundle(), new Map([["assets/floor.png", png]]), "azerothcore", instances()), /missing ZIP file/);
  await assert.rejects(() => tools.validateMapFoundryBundle(bundle({ maps: [{ mapID: 43, floors: [{ floor: 0, preferred2D: "styled", render: { file: "assets/floor.png" } }] }] }), files, "azerothcore", instances()), /preferred2D/);
});

test("bundle merge replaces calibration and preference while preserving unrelated maps and sibling floors", async () => {
  const files = new Map([["assets/floor.png", new Uint8Array([1])], ["assets/floor.glb", new Uint8Array([2])]]);
  const plan = await tools.validateMapFoundryBundle(bundle(), files, "azerothcore", instances());
  const draft = {
    renders: { instances: [
      { mapID: 43, name: "Wailing Caverns", floors: [
        { floor: 0, preferred2D: "renders", renders: { path: "renders/stale.png", width: 1, height: 1, bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 } } },
        { floor: 1, renders: { path: "renders/sibling.png", width: 8, height: 9 } },
      ] },
      { mapID: 99, name: "Other", renders: { path: "renders/other.png", width: 4, height: 5 } },
    ] },
    meshes: { instances: [{ mapID: 43, name: "Wailing Caverns", floors: [{ floor: 1, mesh: { path: "3d/sibling.glb" } }] }] },
  };
  const merged = tools.mergeMapFoundryBundle(draft, plan, [
    { path: "renders/new.png", width: 1600, height: 1000 },
    { path: "3d/new.glb" },
  ]);
  const renders = merged.renders.instances as { mapID: number; floors?: Record<string, unknown>[] }[];
  const map = renders.find((entry) => entry.mapID === 43)!;
  assert.deepEqual(map.floors?.[0], {
    floor: 0,
    preferred2D: "art",
    renders: { path: "renders/new.png", width: 1600, height: 1000, bounds: { minX: 1, maxX: 2, minY: 3, maxY: 4 } },
  });
  assert.equal((map.floors?.[1]?.renders as { path: string }).path, "renders/sibling.png");
  assert.equal(renders.find((entry) => entry.mapID === 99)?.mapID, 99);
  assert.equal((draft.renders.instances[0]!.floors[0]!.renders).path, "renders/stale.png");
  const meshes = merged.meshes.instances as { mapID: number; floors?: Record<string, unknown>[] }[];
  assert.deepEqual(meshes[0]?.floors?.map((floor) => floor.floor), [0, 1]);
  assert.deepEqual(meshes[0]?.floors?.[0]?.mesh, {
    path: "3d/new.glb",
    bounds: { minX: 10, maxX: 20, minY: 30, maxY: 40 },
    zMin: -5,
    zMax: 15,
    frame: "wow-yup-mirrored-x",
  });
});

test("serialized browser bundle helpers remain valid JavaScript", () => {
  assert.doesNotThrow(() => new Function(`return (${createMapBundleTools.toString()})`));
});
