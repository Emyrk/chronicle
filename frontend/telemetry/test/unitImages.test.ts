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

const manifestModule = await import("../src/unitImages/manifest.ts");
const { default: unitImages } = await import("../src/routes/unitImages.ts");
const {
  UNIT_IMAGE_MANIFEST_FORMAT,
  emptyUnitImageManifest,
  isUnitImageAssetPath,
  parseUnitImageManifest,
} = manifestModule;

interface StoredObject {
  bytes: Uint8Array;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  size: number;
  httpMetadata?: { contentType?: string; cacheControl?: string };
  json(): Promise<unknown>;
  text(): Promise<string>;
  writeHttpMetadata(headers: Headers): void;
  body: ReadableStream<Uint8Array>;
}

class FakeBucket {
  private readonly objects = new Map<string, StoredObject>();
  private version = 0;

  async get(key: string): Promise<StoredObject | null> { return this.objects.get(key) ?? null; }
  async head(key: string): Promise<StoredObject | null> { return this.objects.get(key) ?? null; }
  async delete(key: string): Promise<void> { this.objects.delete(key); }

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
      size: bytes.byteLength,
      httpMetadata: options.httpMetadata,
      async json() { return JSON.parse(new TextDecoder().decode(bytes)); },
      async text() { return new TextDecoder().decode(bytes); },
      writeHttpMetadata(headers) {
        if (options.httpMetadata?.contentType) headers.set("Content-Type", options.httpMetadata.contentType);
        if (options.httpMetadata?.cacheControl) headers.set("Cache-Control", options.httpMetadata.cacheControl);
      },
      body: new Blob([bytes]).stream(),
    };
    this.objects.set(key, object);
    return object;
  }

  async json(key: string): Promise<unknown> {
    const object = this.objects.get(key);
    assert.ok(object, `missing ${key}`);
    return object.json();
  }
}

function manifest(units: unknown[]) {
  return { format: UNIT_IMAGE_MANIFEST_FORMAT, units };
}

function webp(): Uint8Array {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
}

async function request(bucket: FakeBucket, path: string, init?: RequestInit): Promise<Response> {
  return unitImages.request(`http://example.test${path}`, init, { MAPS: bucket } as never);
}

test("parses, sorts, and normalizes unit image assignments", () => {
  const parsed = parseUnitImageManifest(manifest([
    { name: "Totem", entry_ids: [3902, 2523], images: { full: "unit-images/totem.webp" } },
    { name: "Boss", entry_ids: [11502], images: { headshot: "unit-images/boss.png" } },
  ]));
  assert.deepEqual(parsed.units.map((item: { name: string }) => item.name), ["Boss", "Totem"]);
  assert.deepEqual(parsed.units[1]?.entry_ids, [2523, 3902]);
});

test("rejects ambiguous IDs, duplicate paths, invalid labels, and unsafe paths", () => {
  assert.throws(() => parseUnitImageManifest(manifest([
    { name: "One", entry_ids: [42], images: { full: "unit-images/one.webp" } },
    { name: "Two", entry_ids: [42], images: { full: "unit-images/two.webp" } },
  ])), /entry ID 42 is assigned/);
  assert.throws(() => parseUnitImageManifest(manifest([
    { name: "One", entry_ids: [1], images: { full: "unit-images/shared.webp" } },
    { name: "Two", entry_ids: [2], images: { full: "unit-images/shared.webp" } },
  ])), /duplicate unit image path/);
  assert.throws(() => parseUnitImageManifest(manifest([
    { name: "One", entry_ids: [1], images: { "Head Shot": "unit-images/one.webp" } },
  ])), /invalid label/);
  assert.throws(() => parseUnitImageManifest(manifest([
    { name: "One", entry_ids: [1], images: { full: "other/one.webp" } },
  ])), /clean unit-images/);
  assert.deepEqual(emptyUnitImageManifest(), { format: UNIT_IMAGE_MANIFEST_FORMAT, units: [] });
  assert.equal(isUnitImageAssetPath("unit-images/one.webp"), true);
  assert.equal(isUnitImageAssetPath("unit-images/nested/one.webp"), false);
});

test("Unit Image Foundry uploads, previews, drafts, and publishes images", async () => {
  const bucket = new FakeBucket();
  const form = new FormData();
  form.append("file", new File([webp()], "Onyxia Headshot.webp", { type: "image/webp" }));
  const upload = await request(bucket, "/internal/api/v1/unit-images/assets", { method: "POST", body: form });
  assert.equal(upload.status, 201);
  const uploaded = await upload.json() as { path: string; size: number };
  assert.match(uploaded.path, /^unit-images\/[0-9a-f]{64}-onyxia-headshot\.webp$/);
  assert.equal(uploaded.size, webp().byteLength);

  const preview = await request(bucket, `/internal/api/v1/unit-images/preview/${uploaded.path.split("/").pop()}`);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("Content-Type"), "image/webp");
  assert.deepEqual(new Uint8Array(await preview.arrayBuffer()), webp());

  const units = [{ name: "ony-onyxia", entry_ids: [10184], images: { headshot: uploaded.path } }];
  const saved = await request(bucket, "/internal/api/v1/unit-images/draft", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: null, units }),
  });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json() as { draft_version: string };

  const published = await request(bucket, "/internal/api/v1/unit-images/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: savedBody.draft_version }),
  });
  assert.equal(published.status, 200);
  assert.deepEqual(await bucket.json("unit-images/manifest.json"), manifest(units));

  const state = await request(bucket, "/internal/api/v1/unit-images");
  assert.equal(state.status, 200);
  const stateBody = await state.json() as {
    has_draft: boolean;
    published: { units: typeof units };
    asset_sizes: Record<string, number>;
  };
  assert.equal(stateBody.has_draft, false);
  assert.deepEqual(stateBody.published.units, units);
  assert.equal(stateBody.asset_sizes[uploaded.path], webp().byteLength);
});

test("Unit Image Foundry rejects invalid images and cross-site mutations", async () => {
  const bucket = new FakeBucket();
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "bad.webp", { type: "image/webp" }));
  const invalid = await request(bucket, "/internal/api/v1/unit-images/assets", { method: "POST", body: form });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json() as { error: string }).error, /must be AVIF, JPEG, PNG, or WebP/);

  const oversized = await request(bucket, "/internal/api/v1/unit-images/assets", {
    method: "POST",
    body: new Uint8Array(21 * 1024 * 1024 + 1),
  });
  assert.equal(oversized.status, 413);

  const blocked = await request(bucket, "/internal/api/v1/unit-images/assets", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
    body: new FormData(),
  });
  assert.equal(blocked.status, 403);
});
