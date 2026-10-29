import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const { default: maps } = await import("../src/routes/maps.ts");

interface StoredObject {
  bytes: Uint8Array;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string; cacheControl?: string };
  json(): Promise<unknown>;
  writeHttpMetadata(headers: Headers): void;
  body: ReadableStream<Uint8Array>;
}

class FakeBucket {
  private readonly objects = new Map<string, StoredObject>();
  private version = 0;

  async get(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async head(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async put(key: string, value: string | Uint8Array, options: R2PutOptions = {}): Promise<StoredObject | null> {
    const current = this.objects.get(key);
    if (options.onlyIf && "etagDoesNotMatch" in options.onlyIf && options.onlyIf.etagDoesNotMatch === "*" && current) return null;
    if (options.onlyIf && "etagMatches" in options.onlyIf && options.onlyIf.etagMatches !== current?.etag) return null;
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
    const etag = `etag-${++this.version}`;
    const object: StoredObject = {
      bytes,
      etag,
      httpEtag: `"${etag}"`,
      uploaded: new Date(),
      httpMetadata: options.httpMetadata,
      async json() { return JSON.parse(new TextDecoder().decode(bytes)); },
      writeHttpMetadata(headers) {
        if (options.httpMetadata?.contentType) headers.set("Content-Type", options.httpMetadata.contentType);
        if (options.httpMetadata?.cacheControl) headers.set("Cache-Control", options.httpMetadata.cacheControl);
      },
      body: new Blob([bytes]).stream(),
    };
    this.objects.set(key, object);
    return object;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async json(key: string): Promise<unknown> {
    const object = this.objects.get(key);
    assert.ok(object, `missing ${key}`);
    return object.json();
  }
}

const target = { product: "wow_classic_beta", build: "1.2.3", region: "us", locale: "enUS" };
const original = {
  format: "chronicle-wow-map-art-v2",
  target,
  maps: [],
  instances: [{
    mapID: 43,
    name: "Wailing Caverns",
    instanceType: 1,
    directory: "WailingCaverns",
    floors: [0, 1].map((floor) => ({ floor, width: 1024, height: 768, tileWidth: 256, tileHeight: 256, tiles: [] })),
  }],
};

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  view.setUint32(33, 0);
  bytes.set([73, 69, 78, 68], 37);
  return bytes;
}

function glb(): Uint8Array {
  const json = new TextEncoder().encode('{"asset":{"version":"2.0"}}');
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(20 + paddedLength);
  bytes.set([..."glTF"].map((character) => character.charCodeAt(0)));
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(json, 20);
  return bytes;
}

async function request(bucket: FakeBucket, path: string, init?: RequestInit): Promise<Response> {
  return maps.request(`http://example.test${path}`, init, { MAPS: bucket } as never);
}

async function seed(bucket: FakeBucket): Promise<void> {
  await bucket.put("forever/maps/manifest.original.json", JSON.stringify(original));
}

test("Map Foundry uploads, drafts, previews, and publishes floor assets without losing siblings", async () => {
  const bucket = new FakeBucket();
  await seed(bucket);

  const floorOneForm = new FormData();
  floorOneForm.append("mapID", "43");
  floorOneForm.append("floor", "1");
  floorOneForm.append("file", new File([png(1600, 1000)], "floor one.png", { type: "image/png" }));
  const upload = await request(bucket, "/internal/api/v1/maps/forever/assets/renders", { method: "POST", body: floorOneForm });
  assert.equal(upload.status, 201);
  const uploaded = await upload.json() as { path: string; floor: number; width: number; height: number };
  assert.match(uploaded.path, /^renders\/43-floor-1-[0-9a-f]{16}-floor-one\.png$/);
  assert.deepEqual({ floor: uploaded.floor, width: uploaded.width, height: uploaded.height }, { floor: 1, width: 1600, height: 1000 });

  const meshForm = new FormData();
  meshForm.append("mapID", "43");
  meshForm.append("floor", "1");
  meshForm.append("file", new File([glb()], "floor one.glb", { type: "model/gltf-binary" }));
  const meshUpload = await request(bucket, "/internal/api/v1/maps/forever/assets/meshes", { method: "POST", body: meshForm });
  assert.equal(meshUpload.status, 201);
  const uploadedMesh = await meshUpload.json() as { path: string; floor: number };
  assert.match(uploadedMesh.path, /^3d\/43-floor-1-[0-9a-f]{16}-floor-one\.glb$/);
  assert.equal(uploadedMesh.floor, 1);

  const invalidFloorForm = new FormData();
  invalidFloorForm.append("mapID", "43");
  invalidFloorForm.append("floor", "9");
  invalidFloorForm.append("file", new File([png(1, 1)], "bad.png", { type: "image/png" }));
  const invalidFloor = await request(bucket, "/internal/api/v1/maps/forever/assets/renders", { method: "POST", body: invalidFloorForm });
  assert.equal(invalidFloor.status, 400);
  assert.match((await invalidFloor.json() as { error: string }).error, /unknown mapID 43 floor 9/);

  const floorZeroPath = "renders/43-floor-0-existing.png";
  await bucket.put(`forever/maps/${floorZeroPath}`, png(1024, 768));
  const renders = [{
    mapID: 43,
    name: "Wailing Caverns",
    floors: [
      { floor: 0, renders: { path: floorZeroPath, width: 1024, height: 768 } },
      { floor: 1, preferred2D: "art", renders: { path: uploaded.path, width: uploaded.width, height: uploaded.height } },
    ],
  }];
  const meshes = [{
    mapID: 43,
    name: "Wailing Caverns",
    floors: [{ floor: 1, mesh: {
      path: uploadedMesh.path,
      bounds: { minX: -10, maxX: 20, minY: 30, maxY: 40 },
      zMin: -5,
      zMax: 15,
      frame: "wow-yup-mirrored-x",
    } }],
  }];
  const saved = await request(bucket, "/internal/api/v1/maps/forever/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: null, renders, meshes }),
  });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json() as { draft_version: string; draft: { renders: { instances: typeof renders } } };
  assert.equal(savedBody.draft.renders.instances[0]?.floors[1]?.preferred2D, "art");
  assert.deepEqual(savedBody.draft.renders.instances[0]?.floors.map((floor) => floor.floor), [0, 1]);

  const state = await request(bucket, "/internal/api/v1/maps/forever");
  assert.equal(state.status, 200);
  const stateBody = await state.json() as { instances: { floors: { floor: number; preferred2D?: string; renders?: { path: string }; mesh?: { path: string } }[] }[] };
  assert.deepEqual(stateBody.instances[0]?.floors.map((floor) => [floor.floor, floor.preferred2D, floor.renders?.path, floor.mesh?.path]), [
    [0, undefined, floorZeroPath, undefined],
    [1, "art", uploaded.path, uploadedMesh.path],
  ]);

  const preview = await request(bucket, "/internal/api/v1/maps/forever/instances/43/preview");
  assert.equal(preview.status, 200);
  const previewBody = await preview.json() as { floors: { floor: number; renders?: { path: string }; mesh?: { path: string } }[] };
  assert.equal(previewBody.floors[1]?.renders?.path, uploaded.path);
  assert.equal(previewBody.floors[1]?.mesh?.path, uploadedMesh.path);

  const published = await request(bucket, "/internal/api/v1/maps/forever/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: savedBody.draft_version }),
  });
  assert.equal(published.status, 200);
  const source = await bucket.json("forever/maps/manifest.renders.json") as { instances: typeof renders };
  assert.equal(source.instances[0]?.floors[1]?.preferred2D, "art");
  assert.deepEqual(source.instances[0]?.floors.map((floor) => floor.floor), [0, 1]);
  const meshSource = await bucket.json("forever/maps/manifest.meshes.json") as { instances: typeof meshes };
  assert.deepEqual(meshSource.instances[0]?.floors.map((floor) => floor.floor), [1]);
  const reader = await bucket.json("forever/maps/manifest.json") as { instances: { floors: { floor: number; renders?: { path: string }; mesh?: { path: string } }[] }[] };
  assert.equal(reader.instances[0]?.floors[0]?.renders?.path, floorZeroPath);
  assert.equal(reader.instances[0]?.floors[1]?.renders?.path, uploaded.path);
  assert.equal(reader.instances[0]?.floors[1]?.mesh?.path, uploadedMesh.path);

  // Content-addressed assets are immutable at the CDN; manifests stay short-lived.
  for (const path of [uploaded.path, uploadedMesh.path]) {
    assert.equal((await bucket.head(`forever/maps/${path}`))?.httpMetadata?.cacheControl, "public, max-age=31536000, immutable");
  }
  for (const layer of ["manifest.renders.json", "manifest.meshes.json", "manifest.json"]) {
    assert.equal((await bucket.head(`forever/maps/${layer}`))?.httpMetadata?.cacheControl, "public, max-age=3600");
  }
});

test("Map Foundry keeps missing multipart floor as a legacy map-level upload", async () => {
  const bucket = new FakeBucket();
  await seed(bucket);
  const form = new FormData();
  form.append("mapID", "43");
  form.append("file", new File([png(640, 480)], "legacy.png", { type: "image/png" }));
  const response = await request(bucket, "/internal/api/v1/maps/forever/assets/renders", { method: "POST", body: form });
  assert.equal(response.status, 201);
  const body = await response.json() as { path: string; floor?: number };
  assert.match(body.path, /^renders\/43-[0-9a-f]{16}-legacy\.png$/);
  assert.equal(body.floor, undefined);
});
