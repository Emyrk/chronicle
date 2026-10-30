import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  UNIT_IMAGE_MANIFEST_FORMAT,
  emptyUnitImageManifest,
  isUnitImageAssetPath,
  parseUnitImageManifest,
  type UnitImageManifest,
} from "../unitImages/manifest";
import type { Env } from "../types";

const unitImages = new Hono<{ Bindings: Env }>();

const MANIFEST_KEY = "unit-images/manifest.json";
const DRAFT_KEY = "unit-images/draft.json";
const LOCK_KEY = "unit-images/publish.lock";
const LOCK_STALE_AFTER_MS = 10 * 60 * 1000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_REQUEST_BYTES = MAX_IMAGE_BYTES + 1024 * 1024;

interface LockLease { etag: string }
interface ImageType { extension: "avif" | "jpg" | "png" | "webp"; contentType: string }

unitImages.use("/internal/api/v1/unit-images/*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const origin = c.req.header("Origin");
  const fetchSite = c.req.header("Sec-Fetch-Site");
  const expectedOrigin = new URL(c.req.url).origin;
  if ((origin && origin !== expectedOrigin) || fetchSite === "cross-site") {
    return c.json({ error: "Cross-site unit image mutations are not allowed" }, 403);
  }
  return next();
});

unitImages.use(
  "/internal/api/v1/unit-images/assets",
  bodyLimit({
    maxSize: MAX_IMAGE_REQUEST_BYTES,
    onError: (c) => c.json({ error: "Upload request is too large" }, 413),
  })
);

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected unit image manifest error";
}

async function readManifest(bucket: R2Bucket, key: string): Promise<UnitImageManifest | undefined> {
  const object = await bucket.get(key);
  if (!object) return undefined;
  try {
    return parseUnitImageManifest(await object.json());
  } catch (error) {
    throw new TypeError(`${key}: ${errorMessage(error)}`);
  }
}

async function loadState(bucket: R2Bucket) {
  const published = (await readManifest(bucket, MANIFEST_KEY)) ?? emptyUnitImageManifest();
  const draftObject = await bucket.get(DRAFT_KEY);
  let draft = published;
  if (draftObject) {
    try {
      draft = parseUnitImageManifest(await draftObject.json());
    } catch (error) {
      throw new TypeError(`${DRAFT_KEY}: ${errorMessage(error)}`);
    }
  }
  return { published, draft, draftObject };
}

async function loadAssetSizes(bucket: R2Bucket, manifests: UnitImageManifest[]): Promise<Record<string, number>> {
  const paths = new Set(manifests.flatMap((manifest) => manifest.units.flatMap((unit) => Object.values(unit.images))));
  const entries = await Promise.all([...paths].map(async (path) => {
    const object = await bucket.head(path);
    return object ? [path, object.size] as const : undefined;
  }));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, number] => Boolean(entry)));
}

function lockBody(state: "held" | "released"): string {
  return `${state}:${crypto.randomUUID()}:${new Date().toISOString()}`;
}

async function putLock(bucket: R2Bucket, body: string, onlyIf: R2Conditional): Promise<LockLease | null> {
  const object = await bucket.put(LOCK_KEY, body, {
    onlyIf,
    httpMetadata: { contentType: "text/plain", cacheControl: "private, no-store" },
  });
  return object ? { etag: object.etag } : null;
}

async function acquireLock(bucket: R2Bucket): Promise<LockLease | null> {
  const acquired = await putLock(bucket, lockBody("held"), { etagDoesNotMatch: "*" });
  if (acquired) return acquired;
  const existing = await bucket.get(LOCK_KEY);
  if (!existing) return putLock(bucket, lockBody("held"), { etagDoesNotMatch: "*" });
  const released = (await existing.text()).startsWith("released:");
  const stale = Date.now() - existing.uploaded.getTime() > LOCK_STALE_AFTER_MS;
  if (!released && !stale) return null;
  return putLock(bucket, lockBody("held"), { etagMatches: existing.etag });
}

async function releaseLock(bucket: R2Bucket, lease: LockLease): Promise<void> {
  await putLock(bucket, lockBody("released"), { etagMatches: lease.etag });
}

function imageType(bytes: Uint8Array): ImageType | undefined {
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { extension: "webp", contentType: "image/webp" };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { extension: "png", contentType: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = new TextDecoder().decode(bytes.slice(8, 12));
    if (brand === "avif" || brand === "avis") return { extension: "avif", contentType: "image/avif" };
  }
  return undefined;
}

function safeFilename(name: string, extension: ImageType["extension"]): string {
  const stem = name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${stem || "unit-image"}.${extension}`;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

unitImages.get("/internal/api/v1/unit-images", async (c) => {
  try {
    const state = await loadState(c.env.MAPS);
    const asset_sizes = await loadAssetSizes(c.env.MAPS, [state.published, state.draft]);
    return c.json({
      has_draft: Boolean(state.draftObject),
      draft_version: state.draftObject?.httpEtag ?? null,
      published: state.published,
      draft: state.draft,
      asset_sizes,
    }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 500);
  }
});

unitImages.get("/internal/api/v1/unit-images/preview/:filename", async (c) => {
  const path = `unit-images/${c.req.param("filename")}`;
  if (!isUnitImageAssetPath(path)) return c.json({ error: "Invalid unit image asset path" }, 400);
  const object = await c.env.MAPS.get(path);
  if (!object) return c.json({ error: "Unit image asset not found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
});

unitImages.post("/internal/api/v1/unit-images/assets", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw new TypeError("file is required");
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new TypeError("unit image must be between 1 byte and 20 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = imageType(bytes);
    if (!type) throw new TypeError("unit image must be AVIF, JPEG, PNG, or WebP");
    const path = `unit-images/${await digest(bytes)}-${safeFilename(file.name, type.extension)}`;
    await c.env.MAPS.put(path, bytes, {
      httpMetadata: { contentType: type.contentType, cacheControl: "public, max-age=31536000, immutable" },
    });
    return c.json({ path, size: bytes.byteLength }, 201);
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  }
});

unitImages.put("/internal/api/v1/unit-images/draft", async (c) => {
  const lease = await acquireLock(c.env.MAPS);
  if (!lease) return c.json({ error: "Unit images are being modified. Reload and try again." }, 409);
  try {
    const input = await c.req.json<{ version?: string | null; units?: unknown }>();
    const state = await loadState(c.env.MAPS);
    const currentVersion = state.draftObject?.httpEtag ?? null;
    if ((input.version ?? null) !== currentVersion) return c.json({ error: "Draft changed in another tab. Reload before saving." }, 409);
    const draft = parseUnitImageManifest({ format: UNIT_IMAGE_MANIFEST_FORMAT, units: input.units ?? [] });
    const object = await c.env.MAPS.put(DRAFT_KEY, jsonText(draft), {
      onlyIf: state.draftObject ? { etagMatches: state.draftObject.etag } : { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
    });
    if (!object) return c.json({ error: "Draft changed in another tab. Reload before saving." }, 409);
    return c.json({ saved: true, draft_version: object.httpEtag, draft });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  } finally {
    await releaseLock(c.env.MAPS, lease);
  }
});

unitImages.delete("/internal/api/v1/unit-images/draft", async (c) => {
  const lease = await acquireLock(c.env.MAPS);
  if (!lease) return c.json({ error: "Unit images are being modified. Reload and try again." }, 409);
  try {
    const input = await c.req.json<{ version?: string | null }>();
    const current = await c.env.MAPS.head(DRAFT_KEY);
    const currentVersion = current?.httpEtag ?? null;
    if ((input.version ?? null) !== currentVersion) return c.json({ error: "Draft changed in another tab. Reload before discarding." }, 409);
    if (current) await c.env.MAPS.delete(DRAFT_KEY);
    return c.json({ discarded: true });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  } finally {
    await releaseLock(c.env.MAPS, lease);
  }
});

unitImages.post("/internal/api/v1/unit-images/publish", async (c) => {
  const lease = await acquireLock(c.env.MAPS);
  if (!lease) return c.json({ error: "Unit images are already being published." }, 409);
  try {
    const input = await c.req.json<{ version?: string | null }>();
    const state = await loadState(c.env.MAPS);
    if (!state.draftObject) return c.json({ error: "There is no saved draft to publish" }, 400);
    if ((input.version ?? null) !== state.draftObject.httpEtag) return c.json({ error: "Draft changed in another tab. Reload before publishing." }, 409);
    const missing: string[] = [];
    await Promise.all(state.draft.units.flatMap((unit) => Object.values(unit.images)).map(async (path) => {
      if (!(await c.env.MAPS.head(path))) missing.push(path);
    }));
    if (missing.length > 0) throw new TypeError(`missing uploaded unit images: ${missing.sort().join(", ")}`);
    await c.env.MAPS.put(MANIFEST_KEY, jsonText(state.draft), {
      httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=3600" },
    });
    await c.env.MAPS.delete(DRAFT_KEY);
    return c.json({ published: true, manifest: MANIFEST_KEY });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  } finally {
    await releaseLock(c.env.MAPS, lease);
  }
});

export default unitImages;
