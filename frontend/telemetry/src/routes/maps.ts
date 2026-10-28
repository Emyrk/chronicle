import { Hono } from "hono";
import {
  MAP_MANIFEST_FORMAT,
  MAP_MANIFEST_NAMESPACES,
  emptyMapManifest,
  isPreviewableMapAssetPath,
  mergeMapManifests,
  parseMapLayer,
  parseMapManifest,
  recoverMapManifestBase,
  recoverMapManifestLayers,
  type MapLayerInstance,
  type MapLayerManifest,
  type MapManifestLayers,
  type MapManifestNamespace,
} from "../maps/manifest";
import { renderImageMetadata } from "../maps/renderImage";
import type { Env } from "../types";

const maps = new Hono<{ Bindings: Env }>();

maps.use("/internal/api/v1/maps/*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const origin = c.req.header("Origin");
  const fetchSite = c.req.header("Sec-Fetch-Site");
  const expectedOrigin = new URL(c.req.url).origin;
  if ((origin && origin !== expectedOrigin) || fetchSite === "cross-site") {
    return c.json({ error: "Cross-site map mutations are not allowed" }, 403);
  }
  return next();
});

const JSON_HEADERS = {
  httpMetadata: {
    contentType: "application/json",
    cacheControl: "public, max-age=3600",
  },
} as const;

const DRAFT_HEADERS = {
  httpMetadata: {
    contentType: "application/json",
    cacheControl: "private, no-store",
  },
} as const;

interface ManualDraft {
  renders: MapLayerManifest;
  meshes: MapLayerManifest;
}

interface DraftInput {
  version?: string | null;
  renders?: unknown;
  meshes?: unknown;
}

function isNamespace(value: string): value is MapManifestNamespace {
  return MAP_MANIFEST_NAMESPACES.includes(value as MapManifestNamespace);
}

function root(namespace: MapManifestNamespace): string {
  return `${namespace}/maps`;
}

function manifestKey(namespace: MapManifestNamespace, layer: string): string {
  return `${root(namespace)}/manifest.${layer}.json`;
}

function publishLockKey(namespace: MapManifestNamespace): string {
  return `${root(namespace)}/drafts/publish.lock`;
}

function draftKey(namespace: MapManifestNamespace): string {
  return `${root(namespace)}/drafts/manual.json`;
}

async function readJSON(bucket: R2Bucket, key: string): Promise<unknown | undefined> {
  const object = await bucket.get(key);
  if (!object) return undefined;
  try {
    return await object.json();
  } catch {
    throw new TypeError(`${key} is not valid JSON`);
  }
}

function manualLayer(product: string, instances: MapLayerInstance[] = []): MapLayerManifest {
  return {
    format: MAP_MANIFEST_FORMAT,
    target: { product, build: "", region: "", locale: "" },
    instances,
  };
}

function parseDraft(value: unknown, product: string): ManualDraft {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("map draft must be an object");
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (key !== "renders" && key !== "meshes") throw new TypeError(`map draft has unknown field ${JSON.stringify(key)}`);
  }
  const renders = parseMapLayer(input.renders ?? manualLayer(product));
  const meshes = parseMapLayer(input.meshes ?? manualLayer(product));
  for (const [kind, layer] of [["renders", renders], ["meshes", meshes]] as const) {
    if (layer.target.product !== product || layer.target.build !== "" || layer.target.region !== "" || layer.target.locale !== "") {
      throw new TypeError(`${kind} map layer target does not match original`);
    }
  }
  return { renders, meshes };
}

async function loadOptionalLayers(bucket: R2Bucket, namespace: MapManifestNamespace): Promise<MapManifestLayers> {
  const [styled, renders, meshes] = await Promise.all([
    readJSON(bucket, manifestKey(namespace, "styled")),
    readJSON(bucket, manifestKey(namespace, "renders")),
    readJSON(bucket, manifestKey(namespace, "meshes")),
  ]);
  return { styled, renders, meshes };
}

async function loadMapBase(bucket: R2Bucket, namespace: MapManifestNamespace) {
  const originalRaw = await readJSON(bucket, manifestKey(namespace, "original"));
  if (originalRaw !== undefined) {
    return { original: parseMapManifest(originalRaw), originalRaw, recoveredLayers: {} as MapManifestLayers, baseSource: "original" as const };
  }
  const readerRaw = await readJSON(bucket, `${root(namespace)}/manifest.json`);
  if (readerRaw !== undefined) {
    const original = recoverMapManifestBase(readerRaw, namespace);
    return { original, originalRaw: original, recoveredLayers: recoverMapManifestLayers(readerRaw), baseSource: "reader" as const };
  }
  const original = emptyMapManifest(namespace);
  return { original, originalRaw: original, recoveredLayers: {} as MapManifestLayers, baseSource: "empty" as const };
}

async function loadState(bucket: R2Bucket, namespace: MapManifestNamespace) {
  const { original, originalRaw, recoveredLayers, baseSource } = await loadMapBase(bucket, namespace);
  const storedLayers = await loadOptionalLayers(bucket, namespace);
  const liveLayers: MapManifestLayers = {
    styled: storedLayers.styled ?? recoveredLayers.styled,
    renders: storedLayers.renders ?? recoveredLayers.renders,
    meshes: storedLayers.meshes ?? recoveredLayers.meshes,
  };
  const published: ManualDraft = {
    renders: (liveLayers.renders as MapLayerManifest | undefined) ?? manualLayer(original.target.product),
    meshes: (liveLayers.meshes as MapLayerManifest | undefined) ?? manualLayer(original.target.product),
  };
  const draftObject = await bucket.get(draftKey(namespace));
  let draft = published;
  if (draftObject) {
    let raw: unknown;
    try {
      raw = await draftObject.json();
    } catch {
      throw new TypeError(`${draftKey(namespace)} is not valid JSON`);
    }
    draft = parseDraft(raw, original.target.product);
  }
  const preview = mergeMapManifests(originalRaw, {
    ...liveLayers,
    renders: draft.renders,
    meshes: draft.meshes,
  });
  return { original, originalRaw, baseSource, liveLayers, published, draft, draftObject, preview };
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected map manifest error";
}

function manualEntries(value: unknown, field: "renders" | "meshes"): MapLayerInstance[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
  return value as MapLayerInstance[];
}

async function verifyDraftAssets(bucket: R2Bucket, namespace: MapManifestNamespace, draft: ManualDraft): Promise<void> {
  const paths = [
    ...draft.renders.instances.flatMap((entry) => [entry.renders?.path, ...(entry.floors ?? []).map((floor) => floor.renders?.path)]),
    ...draft.meshes.instances.flatMap((entry) => [entry.mesh?.path, ...(entry.floors ?? []).map((floor) => floor.mesh?.path)]),
  ].filter((path): path is string => Boolean(path));
  const missing: string[] = [];
  await Promise.all(paths.map(async (path) => {
    if (!(await bucket.head(`${root(namespace)}/${path}`))) missing.push(path);
  }));
  if (missing.length > 0) throw new TypeError(`missing uploaded assets: ${missing.sort().join(", ")}`);
}

async function acquirePublishLock(bucket: R2Bucket, namespace: MapManifestNamespace): Promise<boolean> {
  const key = publishLockKey(namespace);
  const options: R2PutOptions = {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "text/plain", cacheControl: "private, no-store" },
  };
  let result = await bucket.put(key, new Date().toISOString(), options);
  if (result) return true;
  const existing = await bucket.head(key);
  if (!existing || Date.now() - existing.uploaded.getTime() <= 10 * 60 * 1000) return false;
  await bucket.delete(key);
  result = await bucket.put(key, new Date().toISOString(), options);
  return result !== null;
}

function uint32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function validateGLB(bytes: Uint8Array): void {
  if (bytes.length < 20 || String.fromCharCode(...bytes.slice(0, 4)) !== "glTF" ||
      uint32LE(bytes, 4) !== 2 || uint32LE(bytes, 8) !== bytes.length) {
    throw new TypeError("3D asset must be a valid GLB 2.0 file");
  }
  let offset = 12;
  let chunks = 0;
  while (offset + 8 <= bytes.length) {
    const length = uint32LE(bytes, offset);
    const type = uint32LE(bytes, offset + 4);
    const end = offset + 8 + length;
    if (length % 4 !== 0 || end > bytes.length) throw new TypeError("3D asset has a truncated GLB chunk");
    if (chunks === 0) {
      if (type !== 0x4e4f534a) throw new TypeError("3D asset must start with a JSON GLB chunk");
      try {
        const json = new TextDecoder().decode(bytes.slice(offset + 8, end)).trimEnd();
        const document = JSON.parse(json) as { asset?: { version?: string } };
        if (document.asset?.version !== "2.0") throw new Error("wrong glTF version");
      } catch {
        throw new TypeError("3D asset has invalid glTF 2.0 JSON");
      }
    } else if (type !== 0x004e4942) {
      throw new TypeError("3D asset contains an unsupported GLB chunk");
    }
    chunks++;
    offset = end;
  }
  if (chunks === 0 || offset !== bytes.length) throw new TypeError("3D asset has an invalid GLB chunk table");
}

function safeFilename(name: string, extension: string): string {
  const stem = name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${stem || "map"}.${extension}`;
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].slice(0, 8).map((value) => value.toString(16).padStart(2, "0")).join("");
}

maps.get("/internal/api/v1/maps/:namespace", async (c) => {
  const namespace = c.req.param("namespace");
  if (!isNamespace(namespace)) return c.json({ error: "Unsupported map namespace" }, 404);
  try {
    const state = await loadState(c.env.MAPS, namespace);
    const originalInstanceIDs = new Set(state.original.instances.map((instance) => instance.mapID));
    return c.json({
      namespace,
      base_source: state.baseSource,
      target: state.original.target,
      has_draft: Boolean(state.draftObject),
      draft_version: state.draftObject?.httpEtag ?? null,
      published: state.published,
      draft: state.draft,
      instances: state.preview.instances.map((instance) => ({
        mapID: instance.mapID,
        name: instance.name,
        directory: instance.directory,
        original: originalInstanceIDs.has(instance.mapID),
        floor_count: instance.floors.length,
        floors: instance.floors.map((floor) => ({ floor: floor.floor, preferred2D: floor.preferred2D, renders: floor.renders, mesh: floor.mesh })),
        styled: instance.styled,
        renders: instance.renders,
        mesh: instance.mesh,
      })),
    }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    const message = errorMessage(error);
    return c.json({ error: message }, message.endsWith("does not exist") ? 404 : 500);
  }
});

maps.get("/internal/api/v1/maps/:namespace/instances/:mapID/preview", async (c) => {
  const namespace = c.req.param("namespace");
  const mapID = Number(c.req.param("mapID"));
  if (!isNamespace(namespace)) return c.json({ error: "Unsupported map namespace" }, 404);
  if (!Number.isSafeInteger(mapID) || mapID <= 0) return c.json({ error: "Invalid map ID" }, 400);
  try {
    const state = await loadState(c.env.MAPS, namespace);
    const instance = state.preview.instances.find((candidate) => candidate.mapID === mapID);
    if (!instance) return c.json({ error: "Map instance not found" }, 404);
    const publishedRenders = state.published.renders.instances.find((entry) => entry.mapID === mapID);
    const publishedMeshes = state.published.meshes.instances.find((entry) => entry.mapID === mapID);
    return c.json({
      mapID: instance.mapID,
      name: instance.name,
      directory: instance.directory,
      floors: instance.floors,
      styled: instance.styled,
      renders: instance.renders,
      mesh: instance.mesh,
      published_renders: publishedRenders?.renders,
      published_render_floors: publishedRenders?.floors ?? [],
      published_mesh: publishedMeshes?.mesh,
      published_mesh_floors: publishedMeshes?.floors ?? [],
    }, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 500);
  }
});

maps.get("/internal/api/v1/maps/:namespace/preview-assets/:layer/:filename", async (c) => {
  const namespace = c.req.param("namespace");
  const assetPath = `${c.req.param("layer")}/${c.req.param("filename")}`;
  if (!isNamespace(namespace)) return c.json({ error: "Unsupported map namespace" }, 404);
  if (!isPreviewableMapAssetPath(assetPath)) return c.json({ error: "Invalid map asset path" }, 400);
  const object = await c.env.MAPS.get(`${root(namespace)}/${assetPath}`);
  if (!object) return c.json({ error: "Map asset not found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
});

maps.put("/internal/api/v1/maps/:namespace/draft", async (c) => {
  const namespace = c.req.param("namespace");
  if (!isNamespace(namespace)) return c.json({ error: "Unsupported map namespace" }, 404);
  if (!(await acquirePublishLock(c.env.MAPS, namespace))) {
    return c.json({ error: "This namespace is being modified. Reload and try again." }, 409);
  }
  try {
    const input = await c.req.json<DraftInput>();
    const state = await loadState(c.env.MAPS, namespace);
    const currentVersion = state.draftObject?.httpEtag ?? null;
    if ((input.version ?? null) !== currentVersion) {
      return c.json({ error: "Draft changed in another tab. Reload before saving.", draft_version: currentVersion }, 409);
    }
    const draft: ManualDraft = {
      renders: manualLayer(state.original.target.product, manualEntries(input.renders ?? [], "renders")),
      meshes: manualLayer(state.original.target.product, manualEntries(input.meshes ?? [], "meshes")),
    };
    mergeMapManifests(state.originalRaw, {
      ...state.liveLayers,
      renders: draft.renders,
      meshes: draft.meshes,
    });
    const object = await c.env.MAPS.put(draftKey(namespace), jsonText(draft), {
      ...DRAFT_HEADERS,
      onlyIf: state.draftObject ? { etagMatches: state.draftObject.etag } : { etagDoesNotMatch: "*" },
    });
    if (!object) return c.json({ error: "Draft changed in another tab. Reload before saving." }, 409);
    return c.json({ saved: true, draft_version: object.httpEtag, draft });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  } finally {
    await c.env.MAPS.delete(publishLockKey(namespace));
  }
});

maps.delete("/internal/api/v1/maps/:namespace/draft", async (c) => {
  const namespace = c.req.param("namespace");
  if (!isNamespace(namespace)) return c.json({ error: "Unsupported map namespace" }, 404);
  if (!(await acquirePublishLock(c.env.MAPS, namespace))) {
    return c.json({ error: "This namespace is being modified. Reload and try again." }, 409);
  }
  try {
    const input = await c.req.json<{ version?: string | null }>();
    const current = await c.env.MAPS.head(draftKey(namespace));
    const currentVersion = current?.httpEtag ?? null;
    if ((input.version ?? null) !== currentVersion) {
      return c.json({ error: "Draft changed in another tab. Reload before discarding." }, 409);
    }
    if (current) await c.env.MAPS.delete(draftKey(namespace));
    return c.json({ discarded: true });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  } finally {
    await c.env.MAPS.delete(publishLockKey(namespace));
  }
});

maps.post("/internal/api/v1/maps/:namespace/assets/:kind", async (c) => {
  const namespace = c.req.param("namespace");
  const kind = c.req.param("kind");
  if (!isNamespace(namespace)) return c.json({ error: "Unsupported map namespace" }, 404);
  if (kind !== "renders" && kind !== "meshes") return c.json({ error: "Asset kind must be renders or meshes" }, 400);
  try {
    const contentLength = Number(c.req.header("Content-Length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 100 * 1024 * 1024) {
      return c.json({ error: "Upload request exceeds 100 MB" }, 413);
    }
    const body = await c.req.parseBody();
    const file = body.file;
    const mapID = Number(body.mapID);
    const floor = body.floor === undefined ? undefined : Number(body.floor);
    if (!(file instanceof File)) throw new TypeError("file is required");
    if (!Number.isSafeInteger(mapID) || mapID <= 0) throw new TypeError("mapID must be a positive integer");
    if (floor !== undefined) {
      if (!Number.isSafeInteger(floor)) throw new TypeError("floor must be an integer");
      const state = await loadState(c.env.MAPS, namespace);
      const instance = state.preview.instances.find((candidate) => candidate.mapID === mapID);
      if (!instance) throw new TypeError(`mapID ${mapID} cannot attach floor artwork without native floors`);
      if (!instance.floors.some((candidate) => candidate.floor === floor)) {
        throw new TypeError(`unknown mapID ${mapID} floor ${floor}`);
      }
    }
    if (file.size === 0 || file.size > 100 * 1024 * 1024) throw new TypeError("asset must be between 1 byte and 100 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let dimensions: { width: number; height: number } | undefined;
    let extension: string;
    let contentType: string;
    if (kind === "renders") {
      const metadata = renderImageMetadata(bytes);
      dimensions = { width: metadata.width, height: metadata.height };
      extension = metadata.extension;
      contentType = metadata.contentType;
    } else {
      validateGLB(bytes);
      extension = "glb";
      contentType = "model/gltf-binary";
    }
    const filename = safeFilename(file.name, extension);
    const floorStem = floor === undefined ? "" : `-floor-${floor}`;
    const path = `${kind === "meshes" ? "3d" : kind}/${mapID}${floorStem}-${await digest(bytes)}-${filename}`;
    await c.env.MAPS.put(`${root(namespace)}/${path}`, bytes, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    });
    return c.json({ path, floor, ...dimensions }, 201);
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  }
});

maps.post("/internal/api/v1/maps/:namespace/publish", async (c) => {
  const namespace = c.req.param("namespace");
  if (!isNamespace(namespace)) return c.json({ error: "Unsupported map namespace" }, 404);
  if (!(await acquirePublishLock(c.env.MAPS, namespace))) {
    return c.json({ error: "This namespace is already being published" }, 409);
  }
  try {
    const input = await c.req.json<{ version?: string | null }>();
    const state = await loadState(c.env.MAPS, namespace);
    if (!state.draftObject) return c.json({ error: "There is no saved draft to publish" }, 400);
    if ((input.version ?? null) !== state.draftObject.httpEtag) {
      return c.json({ error: "Draft changed in another tab. Reload before publishing." }, 409);
    }
    await verifyDraftAssets(c.env.MAPS, namespace, state.draft);
    const merged = mergeMapManifests(state.originalRaw, {
      ...state.liveLayers,
      renders: state.draft.renders,
      meshes: state.draft.meshes,
    });
    if (state.baseSource !== "original" && state.liveLayers.styled) {
      await c.env.MAPS.put(manifestKey(namespace, "styled"), jsonText(state.liveLayers.styled), JSON_HEADERS);
    }
    await c.env.MAPS.put(manifestKey(namespace, "renders"), jsonText(state.draft.renders), JSON_HEADERS);
    await c.env.MAPS.put(manifestKey(namespace, "meshes"), jsonText(state.draft.meshes), JSON_HEADERS);
    if (state.baseSource !== "original") {
      // Persist recovered source layers before making the bootstrapped original
      // authoritative, so a failed publish can still recover from manifest.json.
      await c.env.MAPS.put(manifestKey(namespace, "original"), jsonText(state.original), JSON_HEADERS);
    }
    // Publish the merged reader-facing manifest last. If an earlier write fails,
    // the draft remains available and a retry reconciles all source manifests.
    await c.env.MAPS.put(`${root(namespace)}/manifest.json`, jsonText(merged), JSON_HEADERS);
    await c.env.MAPS.delete(draftKey(namespace));
    return c.json({ published: true, manifest: `${namespace}/maps/manifest.json` });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  } finally {
    await c.env.MAPS.delete(publishLockKey(namespace));
  }
});

export default maps;
