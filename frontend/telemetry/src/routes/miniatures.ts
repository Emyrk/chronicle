import { Hono } from "hono";
import {
  MINIATURE_MANIFEST_FORMAT,
  emptyMiniatureManifest,
  isMiniatureAssetPath,
  parseMiniatureManifest,
  type MiniatureManifest,
} from "../miniatures/manifest";
import type { Env } from "../types";

const miniatures = new Hono<{ Bindings: Env }>();

const MANIFEST_KEY = "miniatures/manifest.json";
const DRAFT_KEY = "miniatures/draft.json";
const LOCK_KEY = "miniatures/publish.lock";
const LOCK_STALE_AFTER_MS = 10 * 60 * 1000;

interface LockLease {
  etag: string;
}

miniatures.use("/internal/api/v1/miniatures/*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const origin = c.req.header("Origin");
  const fetchSite = c.req.header("Sec-Fetch-Site");
  const expectedOrigin = new URL(c.req.url).origin;
  if ((origin && origin !== expectedOrigin) || fetchSite === "cross-site") {
    return c.json({ error: "Cross-site miniature mutations are not allowed" }, 403);
  }
  return next();
});

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected miniature manifest error";
}

async function readManifest(bucket: R2Bucket, key: string): Promise<MiniatureManifest | undefined> {
  const object = await bucket.get(key);
  if (!object) return undefined;
  try {
    return parseMiniatureManifest(await object.json());
  } catch (error) {
    throw new TypeError(`${key}: ${errorMessage(error)}`);
  }
}

async function loadState(bucket: R2Bucket) {
  const published = (await readManifest(bucket, MANIFEST_KEY)) ?? emptyMiniatureManifest();
  const draftObject = await bucket.get(DRAFT_KEY);
  let draft = published;
  if (draftObject) {
    try {
      draft = parseMiniatureManifest(await draftObject.json());
    } catch (error) {
      throw new TypeError(`${DRAFT_KEY}: ${errorMessage(error)}`);
    }
  }
  return { published, draft, draftObject };
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

function uint32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function validateGLB(bytes: Uint8Array): void {
  if (bytes.length < 20 || String.fromCharCode(...bytes.slice(0, 4)) !== "glTF" || uint32LE(bytes, 4) !== 2 || uint32LE(bytes, 8) !== bytes.length) {
    throw new TypeError("miniature must be a valid GLB 2.0 file");
  }
  let offset = 12;
  let chunks = 0;
  while (offset + 8 <= bytes.length) {
    const length = uint32LE(bytes, offset);
    const type = uint32LE(bytes, offset + 4);
    const end = offset + 8 + length;
    if (length % 4 !== 0 || end > bytes.length) throw new TypeError("miniature has a truncated GLB chunk");
    if (chunks === 0) {
      if (type !== 0x4e4f534a) throw new TypeError("miniature must start with a JSON GLB chunk");
      try {
        const json = new TextDecoder().decode(bytes.slice(offset + 8, end)).trimEnd();
        const document = JSON.parse(json) as { asset?: { version?: string } };
        if (document.asset?.version !== "2.0") throw new Error("wrong glTF version");
      } catch {
        throw new TypeError("miniature has invalid glTF 2.0 JSON");
      }
    } else if (type !== 0x004e4942) {
      throw new TypeError("miniature contains an unsupported GLB chunk");
    }
    chunks++;
    offset = end;
  }
  if (chunks === 0 || offset !== bytes.length) throw new TypeError("miniature has an invalid GLB chunk table");
}

function safeFilename(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${stem || "miniature"}.glb`;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

miniatures.get("/internal/api/v1/miniatures", async (c) => {
  try {
    const state = await loadState(c.env.MAPS);
    return c.json({
      has_draft: Boolean(state.draftObject),
      draft_version: state.draftObject?.httpEtag ?? null,
      published: state.published,
      draft: state.draft,
    }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 500);
  }
});

miniatures.get("/internal/api/v1/miniatures/preview/:filename", async (c) => {
  const path = `miniatures/${c.req.param("filename")}`;
  if (!isMiniatureAssetPath(path)) return c.json({ error: "Invalid miniature asset path" }, 400);
  const object = await c.env.MAPS.get(path);
  if (!object) return c.json({ error: "Miniature asset not found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
});

miniatures.post("/internal/api/v1/miniatures/assets", async (c) => {
  try {
    const contentLength = Number(c.req.header("Content-Length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 100 * 1024 * 1024) return c.json({ error: "Upload request exceeds 100 MB" }, 413);
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw new TypeError("file is required");
    if (file.size === 0 || file.size > 100 * 1024 * 1024) throw new TypeError("miniature must be between 1 byte and 100 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    validateGLB(bytes);
    const path = `miniatures/${await digest(bytes)}-${safeFilename(file.name)}`;
    await c.env.MAPS.put(path, bytes, {
      httpMetadata: { contentType: "model/gltf-binary", cacheControl: "public, max-age=31536000, immutable" },
    });
    return c.json({ path }, 201);
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  }
});

miniatures.put("/internal/api/v1/miniatures/draft", async (c) => {
  const lease = await acquireLock(c.env.MAPS);
  if (!lease) return c.json({ error: "Miniatures are being modified. Reload and try again." }, 409);
  try {
    const input = await c.req.json<{ version?: string | null; miniatures?: unknown }>();
    const state = await loadState(c.env.MAPS);
    const currentVersion = state.draftObject?.httpEtag ?? null;
    if ((input.version ?? null) !== currentVersion) return c.json({ error: "Draft changed in another tab. Reload before saving." }, 409);
    const draft = parseMiniatureManifest({ format: MINIATURE_MANIFEST_FORMAT, miniatures: input.miniatures ?? [] });
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

miniatures.delete("/internal/api/v1/miniatures/draft", async (c) => {
  const lease = await acquireLock(c.env.MAPS);
  if (!lease) return c.json({ error: "Miniatures are being modified. Reload and try again." }, 409);
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

miniatures.post("/internal/api/v1/miniatures/publish", async (c) => {
  const lease = await acquireLock(c.env.MAPS);
  if (!lease) return c.json({ error: "Miniatures are already being published." }, 409);
  try {
    const input = await c.req.json<{ version?: string | null }>();
    const state = await loadState(c.env.MAPS);
    if (!state.draftObject) return c.json({ error: "There is no saved draft to publish" }, 400);
    if ((input.version ?? null) !== state.draftObject.httpEtag) return c.json({ error: "Draft changed in another tab. Reload before publishing." }, 409);
    const missing: string[] = [];
    await Promise.all(state.draft.miniatures.map(async (item) => {
      if (!(await c.env.MAPS.head(item.path))) missing.push(item.path);
    }));
    if (missing.length > 0) throw new TypeError(`missing uploaded miniatures: ${missing.sort().join(", ")}`);
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

export default miniatures;
