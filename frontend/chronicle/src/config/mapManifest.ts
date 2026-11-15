/**
 * The map manifest the replay map reads from a dataset's icon CDN
 * (`maps/manifest.json`): zone art, dungeon floors, renders and 3D dungeons.
 * One definition on the viewer side: the types, the URLs, and a runtime
 * parser that checks what the viewer relies on. An invalid entry is dropped on
 * its own, with a reason, and the rest of the manifest still loads.
 */

export const WOW_MAP_MANIFEST_FORMAT = "chronicle-wow-map-art-v2";

/** The axis convention a 3D dungeon's glTF must use to be placed (see dungeonMeshes.ts). */
export const DUNGEON_MESH_FRAME = "wow-yup-mirrored-x";

// Legacy datasets still publish v1 until their extractors migrate.
export function isSupportedMapManifestFormat(format: string): boolean {
  return format === WOW_MAP_MANIFEST_FORMAT || format === "chronicle-wow-map-art-v1";
}

export interface WowMapManifest {
  format: string;
  target: {
    product: string;
    build: string;
    region: string;
    locale: string;
  };
  maps: WowMap[];
  instances?: WowMapInstance[];
}

export interface WowMap {
  id: number;
  name: string;
  parentID: number;
  type: number;
  flags: number;
  assignments?: WowMapAssignment[];
  art?: WowMapArt[];
}

export interface WowMapAssignment {
  id: number;
  mapID: number;
  areaID: number;
  orderIndex: number;
  region: number[];
  uiMin: number[];
  uiMax: number[];
}

export interface WowMapArt {
  phaseID: number;
  artID: number;
  styleID: number;
  layers: WowMapLayer[];
  overlays?: WowMapOverlay[];
}

export interface WowMapOverlay {
  id: number;
  offsetX: number;
  offsetY: number;
  textureWidth: number;
  textureHeight: number;
  tiles: WowMapTile[];
}

/** Hash-pinned offline support geometry. Unvalidated data is local-preview-only. */
export interface WowMapFloorSupport {
  version: 1;
  path: string;
  sha256: string;
  datasetID: string;
  mapID: number;
  frame: "wow-yup-mirrored-x";
  floorIDs: number[];
  sources: { floor: number; path: string; sha256: string }[];
  validated: boolean;
}

export interface WowMapReuseSource {
  namespace: string;
  mapID: number;
}

export interface WowMapInstance {
  floorSupport?: WowMapFloorSupport;
  reusedFrom?: WowMapReuseSource;
  mapID: number;
  name: string;
  instanceType: number;
  directory: string;
  floors: WowMapInstanceFloor[];
  styled?: WowMapRenderedInstance;
  renders?: WowMapManualRender;
  mesh?: WowMapMeshInstance;
}

/** A dungeon's 3D mesh (glTF binary under `meshes/`) for the Replay Map, placed by its own world extent. */
export interface WowMapMeshInstance {
  path: string;
  /** World-axis bounds of the mesh: `minX..maxX` is world X, `minY..maxY` world Y. */
  bounds: WowMapFloorBounds;
  zMin: number;
  zMax: number;
  /** The glTF axis convention; see `DUNGEON_MESH_FRAME`. */
  frame: string;
  /** Tint for the mesh's `liquid_*` planes (lava, slime); absent, the GLB's own water shows. */
  liquid?: WowMapMeshLiquid;
}

export interface WowMapMeshLiquid {
  /** CSS hex colour, `#rrggbb`. */
  color: string;
  /** 0 < opacity <= 1. */
  opacity: number;
}

// Manually published 2D images. Only explicitly calibrated bounds permit position overlays.
export interface WowMapManualRender {
  path: string;
  width: number;
  height: number;
  bounds?: WowMapFloorBounds;
}

export interface WowMapRenderedInstance {
  path: string;
  width: number;
  height: number;
  source: string;
  bounds: WowMapFloorBounds;
  triangles?: number;
}

export interface WowMapFloorBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface WowMapInstanceFloor {
  floor: number;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  bounds?: WowMapFloorBounds;
  tiles: WowMapTile[];
  /** Preferred automatic 2D source for this floor; absent preserves render-first behavior. */
  preferred2D?: "renders" | "art";
  renders?: WowMapManualRender;
  mesh?: WowMapMeshInstance;
}

export interface WowMapLayer {
  index: number;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  minScale: number;
  maxScale: number;
  additionalZoomSteps: number;
  tiles: WowMapTile[];
}

export interface WowMapTile {
  row: number;
  column: number;
  fileDataID: number;
  path: string;
}

export function mapFloorRender(
  instance: WowMapInstance,
  floor: WowMapInstanceFloor | undefined,
): WowMapManualRender | undefined {
  return floor?.renders ?? instance.renders;
}

export function mapFloorMesh(
  instance: WowMapInstance,
  floor: WowMapInstanceFloor | undefined,
): WowMapMeshInstance | undefined {
  return floor?.mesh ?? instance.mesh;
}

export function hasNativeMapFloorArtwork(floor: WowMapInstanceFloor | undefined): boolean {
  return Boolean(floor && floor.width > 0 && floor.height > 0 && floor.tiles.length > 0);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function mapManifestUrl(iconBaseUrl: string): string {
  return `${stripTrailingSlash(iconBaseUrl)}/maps/manifest.json`;
}

export function mapAssetUrl(iconBaseUrl: string, path: string): string {
  if (/^https:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.origin === "https://icons.chronicleclassic.com"
        && /^\/[^/]+\/maps\/(?:original|tiles|render-styled|renders|3d)\/.+/.test(url.pathname)
        && url.search === ""
        && url.hash === "") return path;
    } catch {
      // Fall through to a same-CDN path, which will safely fail instead of fetching an arbitrary origin.
    }
  }
  return `${stripTrailingSlash(iconBaseUrl)}/maps/${path.replace(/^\/+/, "")}`;
}

// ---------------------------------------------------------------------------
// Parsing

/** An entry the parser dropped: where it was in the manifest, and why. */
export interface ManifestProblem {
  path: string;
  reason: string;
}

export interface ParsedMapManifest {
  manifest: WowMapManifest;
  /** Entries dropped from the manifest, each with its reason. */
  problems: ManifestProblem[];
}

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/** The first required field of `fields` that is not a finite number, or null. */
function missingNumber(raw: Raw, fields: readonly string[]): string | null {
  return fields.find((field) => !isNumber(raw[field])) ?? null;
}

/** The first required field of `fields` that is not a non-empty string, or null. */
function missingText(raw: Raw, fields: readonly string[]): string | null {
  return fields.find((field) => !isText(raw[field])) ?? null;
}

class Problems {
  readonly list: ManifestProblem[] = [];
  drop(path: string, reason: string): null {
    this.list.push({ path, reason });
    return null;
  }
}

/** Each element parsed; the invalid ones dropped (they record their own problem). */
function parseList<T>(value: unknown, path: string, problems: Problems, parse: (raw: unknown, path: string) => T | null): T[] {
  if (!Array.isArray(value)) {
    problems.drop(path, "is not a list");
    return [];
  }
  return value.flatMap((raw, index) => {
    const parsed = parse(raw, `${path}[${index}]`);
    return parsed === null ? [] : [parsed];
  });
}

function boundsReason(value: unknown): string | null {
  if (!isObject(value)) return "bounds are missing";
  const missing = missingNumber(value, ["minX", "maxX", "minY", "maxY"]);
  if (missing) return `bounds.${missing} is not a number`;
  if (!((value.maxX as number) > (value.minX as number)) || !((value.maxY as number) > (value.minY as number))) return "bounds are empty (max must exceed min)";
  return null;
}

function parseTile(raw: unknown, path: string, problems: Problems): WowMapTile | null {
  if (!isObject(raw)) return problems.drop(path, "tile is not an object");
  const missing = missingNumber(raw, ["row", "column", "fileDataID"]);
  if (missing) return problems.drop(path, `tile ${missing} is not a number`);
  if (!isText(raw.path)) return problems.drop(path, "tile has no path");
  return raw as unknown as WowMapTile;
}

function parseLayer(raw: unknown, path: string, problems: Problems): WowMapLayer | null {
  if (!isObject(raw)) return problems.drop(path, "layer is not an object");
  const missing = missingNumber(raw, ["index", "width", "height", "tileWidth", "tileHeight", "minScale", "maxScale", "additionalZoomSteps"]);
  if (missing) return problems.drop(path, `layer ${missing} is not a number`);
  return { ...raw, tiles: parseList(raw.tiles, `${path}.tiles`, problems, (tile, at) => parseTile(tile, at, problems)) } as unknown as WowMapLayer;
}

function parseOverlay(raw: unknown, path: string, problems: Problems): WowMapOverlay | null {
  if (!isObject(raw)) return problems.drop(path, "overlay is not an object");
  const missing = missingNumber(raw, ["id", "offsetX", "offsetY", "textureWidth", "textureHeight"]);
  if (missing) return problems.drop(path, `overlay ${missing} is not a number`);
  return { ...raw, tiles: parseList(raw.tiles, `${path}.tiles`, problems, (tile, at) => parseTile(tile, at, problems)) } as unknown as WowMapOverlay;
}

function parseArt(raw: unknown, path: string, problems: Problems): WowMapArt | null {
  if (!isObject(raw)) return problems.drop(path, "art is not an object");
  const missing = missingNumber(raw, ["phaseID", "artID", "styleID"]);
  if (missing) return problems.drop(path, `art ${missing} is not a number`);
  if (!Array.isArray(raw.layers)) return problems.drop(path, "art has no layer list");
  const art: Raw = { ...raw, layers: parseList(raw.layers, `${path}.layers`, problems, (layer, at) => parseLayer(layer, at, problems)) };
  if (raw.overlays !== undefined) art.overlays = parseList(raw.overlays, `${path}.overlays`, problems, (overlay, at) => parseOverlay(overlay, at, problems));
  return art as unknown as WowMapArt;
}

const isNumberList = (value: unknown) => Array.isArray(value) && value.every(isNumber);

function parseAssignment(raw: unknown, path: string, problems: Problems): WowMapAssignment | null {
  if (!isObject(raw)) return problems.drop(path, "assignment is not an object");
  const missing = missingNumber(raw, ["id", "mapID", "areaID", "orderIndex"]);
  if (missing) return problems.drop(path, `assignment ${missing} is not a number`);
  const badList = ["region", "uiMin", "uiMax"].find((field) => !isNumberList(raw[field]));
  if (badList) return problems.drop(path, `assignment ${badList} is not a list of numbers`);
  return raw as unknown as WowMapAssignment;
}

function parseMap(raw: unknown, path: string, problems: Problems): WowMap | null {
  if (!isObject(raw)) return problems.drop(path, "map is not an object");
  const label = `${path} (map ${String(raw.id ?? "?")})`;
  const missing = missingNumber(raw, ["id", "parentID", "type", "flags"]);
  if (missing) return problems.drop(label, `${missing} is not a number`);
  if (!isText(raw.name)) return problems.drop(label, "has no name");
  const map: Raw = { ...raw };
  if (raw.assignments !== undefined) map.assignments = parseList(raw.assignments, `${label}.assignments`, problems, (item, at) => parseAssignment(item, at, problems));
  if (raw.art !== undefined) map.art = parseList(raw.art, `${label}.art`, problems, (item, at) => parseArt(item, at, problems));
  return map as unknown as WowMap;
}

/** An optional sub-entry: kept when valid, else removed from its parent with a problem. */
function optional<T>(parent: Raw, field: string, path: string, parse: (raw: unknown, path: string) => T | null) {
  if (parent[field] === undefined) return;
  const parsed = parse(parent[field], `${path}.${field}`);
  if (parsed === null) delete parent[field];
  else parent[field] = parsed;
}

function parseMesh(raw: unknown, path: string, problems: Problems): WowMapMeshInstance | null {
  if (!isObject(raw)) return problems.drop(path, "3D dungeon entry is not an object");
  if (!isText(raw.path)) return problems.drop(path, "3D dungeon has no path");
  if (raw.frame !== DUNGEON_MESH_FRAME) return problems.drop(path, `3D dungeon frame "${String(raw.frame ?? "missing")}" is not ${DUNGEON_MESH_FRAME}`);
  const bounds = boundsReason(raw.bounds);
  if (bounds) return problems.drop(path, `3D dungeon ${bounds}`);
  const missing = missingNumber(raw, ["zMin", "zMax"]);
  if (missing) return problems.drop(path, `3D dungeon ${missing} is not a number`);
  if ((raw.zMax as number) < (raw.zMin as number)) return problems.drop(path, "3D dungeon zMax is below zMin");
  const mesh: Raw = { ...raw };
  optional(mesh, "liquid", path, (liquid, at) => {
    if (!isObject(liquid) || typeof liquid.color !== "string" || !/^#[0-9a-f]{6}$/i.test(liquid.color)) return problems.drop(at, "liquid colour is not #rrggbb");
    if (!isNumber(liquid.opacity) || !(liquid.opacity > 0) || liquid.opacity > 1) return problems.drop(at, "liquid opacity is not in (0, 1]");
    return liquid;
  });
  return mesh as unknown as WowMapMeshInstance;
}

function parseManualRender(raw: unknown, path: string, problems: Problems): WowMapManualRender | null {
  if (!isObject(raw)) return problems.drop(path, "render is not an object");
  if (!isText(raw.path)) return problems.drop(path, "render has no path");
  const missing = missingNumber(raw, ["width", "height"]);
  if (missing) return problems.drop(path, `render ${missing} is not a number`);
  const render: Raw = { ...raw };
  optional(render, "bounds", path, (bounds, at) => {
    const reason = boundsReason(bounds);
    return reason ? problems.drop(at, reason) : bounds;
  });
  return render as unknown as WowMapManualRender;
}

function parseStyled(raw: unknown, path: string, problems: Problems): WowMapRenderedInstance | null {
  if (!isObject(raw)) return problems.drop(path, "styled render is not an object");
  const text = missingText(raw, ["path", "source"]);
  if (text) return problems.drop(path, `styled render has no ${text}`);
  const missing = missingNumber(raw, ["width", "height"]);
  if (missing) return problems.drop(path, `styled render ${missing} is not a number`);
  const bounds = boundsReason(raw.bounds);
  if (bounds) return problems.drop(path, `styled render ${bounds}`);
  if (raw.triangles !== undefined && !isNumber(raw.triangles)) return problems.drop(path, "styled render triangles is not a number");
  return raw as unknown as WowMapRenderedInstance;
}

function parseFloorSupport(raw: unknown, path: string, problems: Problems): WowMapFloorSupport | null {
  if (!isObject(raw)) return problems.drop(path, "floor support is not an object");
  if (raw.version !== 1) return problems.drop(path, `floor support version ${String(raw.version)} is not 1`);
  const text = missingText(raw, ["path", "sha256", "datasetID"]);
  if (text) return problems.drop(path, `floor support has no ${text}`);
  if (!isNumber(raw.mapID)) return problems.drop(path, "floor support mapID is not a number");
  if (raw.frame !== "wow-yup-mirrored-x") return problems.drop(path, "floor support frame is not wow-yup-mirrored-x");
  if (!isNumberList(raw.floorIDs)) return problems.drop(path, "floor support floorIDs is not a list of numbers");
  if (!Array.isArray(raw.sources) || !raw.sources.every((source) => isObject(source) && isNumber(source.floor) && isText(source.path) && isText(source.sha256))) {
    return problems.drop(path, "floor support sources are malformed");
  }
  if (typeof raw.validated !== "boolean") return problems.drop(path, "floor support validated is not true or false");
  return raw as unknown as WowMapFloorSupport;
}

function parseFloor(raw: unknown, path: string, problems: Problems): WowMapInstanceFloor | null {
  if (!isObject(raw)) return problems.drop(path, "floor is not an object");
  const label = `${path} (floor ${String(raw.floor ?? "?")})`;
  const missing = missingNumber(raw, ["floor", "width", "height", "tileWidth", "tileHeight"]);
  if (missing) return problems.drop(label, `${missing} is not a number`);
  const floor: Raw = { ...raw, tiles: parseList(raw.tiles, `${label}.tiles`, problems, (tile, at) => parseTile(tile, at, problems)) };
  optional(floor, "bounds", label, (bounds, at) => {
    const reason = boundsReason(bounds);
    return reason ? problems.drop(at, reason) : bounds;
  });
  optional(floor, "preferred2D", label, (value, at) => value === "renders" || value === "art" ? value : problems.drop(at, `"${String(value)}" is not renders or art`));
  optional(floor, "renders", label, (render, at) => parseManualRender(render, at, problems));
  optional(floor, "mesh", label, (mesh, at) => parseMesh(mesh, at, problems));
  return floor as unknown as WowMapInstanceFloor;
}

function parseInstance(raw: unknown, path: string, problems: Problems): WowMapInstance | null {
  if (!isObject(raw)) return problems.drop(path, "instance is not an object");
  const label = `${path} (${isText(raw.name) ? raw.name : "unnamed"}, map ${String(raw.mapID ?? "?")})`;
  const missing = missingNumber(raw, ["mapID", "instanceType"]);
  if (missing) return problems.drop(label, `${missing} is not a number`);
  if (!isText(raw.name)) return problems.drop(label, "has no name");
  // Published instances may leave the extractor's directory empty (mesh-only dungeons): any string will do.
  if (typeof raw.directory !== "string") return problems.drop(label, "directory is not a string");
  if (!Array.isArray(raw.floors)) return problems.drop(label, "has no floor list");
  const instance: Raw = { ...raw, floors: parseList(raw.floors, `${label}.floors`, problems, (floor, at) => parseFloor(floor, at, problems)) };
  optional(instance, "floorSupport", label, (value, at) => parseFloorSupport(value, at, problems));
  optional(instance, "reusedFrom", label, (value, at) => isObject(value) && isText(value.namespace) && isNumber(value.mapID)
    ? value
    : problems.drop(at, "reusedFrom needs a namespace and a numeric mapID"));
  optional(instance, "styled", label, (value, at) => parseStyled(value, at, problems));
  optional(instance, "renders", label, (value, at) => parseManualRender(value, at, problems));
  optional(instance, "mesh", label, (value, at) => parseMesh(value, at, problems));
  return instance as unknown as WowMapInstance;
}

/**
 * Checks a fetched map manifest against what the viewer relies on. Throws only
 * when the whole manifest is unusable (not an object, an unsupported format);
 * any invalid map, instance, floor, layer, tile or optional asset is dropped on
 * its own and listed in `problems`.
 */
export function parseMapManifest(value: unknown): ParsedMapManifest {
  if (!isObject(value)) throw new Error("Map manifest must be an object");
  const format = typeof value.format === "string" ? value.format : "";
  if (!isSupportedMapManifestFormat(format)) throw new Error(`Unsupported map manifest format: ${format || "missing"}`);
  const problems = new Problems();
  const manifest: Raw = { ...value, maps: parseList(value.maps, "maps", problems, (map, at) => parseMap(map, at, problems)) };
  if (value.instances !== undefined) manifest.instances = parseList(value.instances, "instances", problems, (instance, at) => parseInstance(instance, at, problems));
  return { manifest: manifest as unknown as WowMapManifest, problems: problems.list };
}

/** The dataset's map manifest and the entries dropped from it, fetched from its tenant-configured icon CDN. */
export async function fetchMapManifestReport(iconBaseUrl: string): Promise<ParsedMapManifest> {
  const response = await fetch(mapManifestUrl(iconBaseUrl));
  if (!response.ok) throw new Error(`Map manifest request failed with ${response.status}`);
  const parsed = parseMapManifest(await response.json());
  for (const problem of parsed.problems) console.warn(`Map manifest: dropped ${problem.path}: ${problem.reason}`);
  return parsed;
}

/** The dataset's map manifest (invalid entries dropped, each with a console warning). */
export async function fetchMapManifest(iconBaseUrl: string): Promise<WowMapManifest> {
  return (await fetchMapManifestReport(iconBaseUrl)).manifest;
}
