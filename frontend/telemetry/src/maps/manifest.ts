export const MAP_MANIFEST_FORMAT = "chronicle-wow-map-art-v2" as const;

export const MAP_MANIFEST_NAMESPACES = [
  "forever",
  "kronos",
  "octowow",
  "turtle",
  "tbc",
  "vanillaplus",
  "warmane",
  "azerothcore",
] as const;

export const MAP_NAMESPACES = MAP_MANIFEST_NAMESPACES;
export type MapManifestNamespace = (typeof MAP_MANIFEST_NAMESPACES)[number];
export type MapNamespace = MapManifestNamespace;

export interface MapTarget {
  product: string;
  build: string;
  region: string;
  locale: string;
}

export interface MapFloorBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface MapTile {
  row: number;
  column: number;
  fileDataID: number;
  path: string;
}

export interface MapAssignment {
  id: number;
  mapID: number;
  areaID: number;
  orderIndex: number;
  region: [number, number, number, number, number, number];
  uiMin: [number, number];
  uiMax: [number, number];
  wmoDoodadPlacementID?: number;
  wmoGroupID?: number;
}

export interface MapArtLayer {
  index: number;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  minScale: number;
  maxScale: number;
  additionalZoomSteps: number;
  tiles: MapTile[];
}

export interface MapArtOverlay {
  id: number;
  offsetX: number;
  offsetY: number;
  textureWidth: number;
  textureHeight: number;
  tiles: MapTile[];
}

export interface MapArtAssociation {
  phaseID: number;
  artID: number;
  styleID: number;
  layers: MapArtLayer[];
  overlays?: MapArtOverlay[];
}

export interface MapRecord {
  id: number;
  name: string;
  parentID: number;
  type: number;
  flags: number;
  assignments?: MapAssignment[];
  art?: MapArtAssociation[];
}

export interface MapInstanceFloor {
  floor: number;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  bounds?: MapFloorBounds;
  tiles: MapTile[];
}

export interface MapRenderedArtwork {
  path: string;
  width: number;
  height: number;
  source: string;
  bounds: MapFloorBounds;
  triangles?: number;
}

export interface MapManualRender {
  path: string;
  width: number;
  height: number;
  bounds?: MapFloorBounds;
}

export interface Map3DAsset {
  path: string;
}

export interface MapInstance {
  mapID: number;
  name: string;
  instanceType: number;
  directory: string;
  floors: MapInstanceFloor[];
  rendered?: MapRenderedArtwork;
  styled?: MapRenderedArtwork;
  renders?: MapManualRender;
  "3d"?: Map3DAsset;
}

export interface MapManifest {
  format: typeof MAP_MANIFEST_FORMAT;
  target: MapTarget;
  maps: MapRecord[];
  instances: MapInstance[];
}

export interface MapLayerInstance {
  mapID: number;
  name?: string;
  rendered?: MapRenderedArtwork;
  styled?: MapRenderedArtwork;
  renders?: MapManualRender;
  "3d"?: Map3DAsset;
}

export interface MapLayerManifest {
  format: typeof MAP_MANIFEST_FORMAT;
  target: MapTarget;
  instances: MapLayerInstance[];
}

export interface MapManifestLayers {
  render?: unknown;
  styled?: unknown;
  renders?: unknown;
  "3d"?: unknown;
}

type JSONObject = Record<string, unknown>;
type LayerKind = keyof MapManifestLayers;

const hasOwn = (value: JSONObject, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function object(value: unknown, context: string, fields: readonly string[]): JSONObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  const result = value as JSONObject;
  for (const key of Object.keys(result)) {
    if (!fields.includes(key)) {
      throw new TypeError(`${context} has unknown field ${JSON.stringify(key)}`);
    }
  }
  return result;
}

function array(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${context} must be an array`);
  return value;
}

function string(value: unknown, context: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") throw new TypeError(`${context} must be a string`);
  return value;
}

function number(value: unknown, context: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${context} must be a finite number`);
  }
  return value;
}

function safeInteger(value: unknown, context: string, fallback?: number): number {
  const result = number(value, context, fallback);
  if (!Number.isSafeInteger(result)) throw new TypeError(`${context} must be an integer`);
  return result;
}

function integer(value: unknown, context: string, fallback?: number): number {
  const result = safeInteger(value, context, fallback);
  if (result < -2_147_483_648 || result > 2_147_483_647) {
    throw new TypeError(`${context} must be a 32-bit integer`);
  }
  return result;
}

function tuple(value: unknown, context: string, length: number): number[] {
  const values = array(value, context);
  if (values.length !== length) throw new TypeError(`${context} must have ${length} values`);
  return values.map((entry, index) => number(entry, `${context}[${index}]`));
}

function optional<T>(value: unknown, parse: (value: unknown) => T): T | undefined {
  return value === undefined || value === null ? undefined : parse(value);
}

function parseTarget(value: unknown, context: string): MapTarget {
  const input = object(value, context, ["product", "build", "region", "locale"]);
  return {
    product: string(input.product, `${context}.product`, ""),
    build: string(input.build, `${context}.build`, ""),
    region: string(input.region, `${context}.region`, ""),
    locale: string(input.locale, `${context}.locale`, ""),
  };
}

function parseBounds(value: unknown, context: string): MapFloorBounds {
  const input = object(value, context, ["minX", "maxX", "minY", "maxY"]);
  return {
    minX: number(input.minX, `${context}.minX`, 0),
    maxX: number(input.maxX, `${context}.maxX`, 0),
    minY: number(input.minY, `${context}.minY`, 0),
    maxY: number(input.maxY, `${context}.maxY`, 0),
  };
}

function parseTile(value: unknown, context: string): MapTile {
  const input = object(value, context, ["row", "column", "fileDataID", "path"]);
  return {
    row: integer(input.row, `${context}.row`, 0),
    column: integer(input.column, `${context}.column`, 0),
    fileDataID: integer(input.fileDataID, `${context}.fileDataID`, 0),
    path: string(input.path, `${context}.path`, ""),
  };
}

function parseTiles(value: unknown, context: string): MapTile[] {
  return array(value ?? [], context).map((entry, index) => parseTile(entry, `${context}[${index}]`));
}

function parseAssignment(value: unknown, context: string): MapAssignment {
  const input = object(value, context, [
    "id", "mapID", "areaID", "orderIndex", "region", "uiMin", "uiMax",
    "wmoDoodadPlacementID", "wmoGroupID",
  ]);
  const result: MapAssignment = {
    id: integer(input.id, `${context}.id`, 0),
    mapID: integer(input.mapID, `${context}.mapID`, 0),
    areaID: integer(input.areaID, `${context}.areaID`, 0),
    orderIndex: integer(input.orderIndex, `${context}.orderIndex`, 0),
    region: tuple(input.region ?? [0, 0, 0, 0, 0, 0], `${context}.region`, 6) as MapAssignment["region"],
    uiMin: tuple(input.uiMin ?? [0, 0], `${context}.uiMin`, 2) as MapAssignment["uiMin"],
    uiMax: tuple(input.uiMax ?? [0, 0], `${context}.uiMax`, 2) as MapAssignment["uiMax"],
  };
  if (hasOwn(input, "wmoDoodadPlacementID")) result.wmoDoodadPlacementID = integer(input.wmoDoodadPlacementID, `${context}.wmoDoodadPlacementID`);
  if (hasOwn(input, "wmoGroupID")) result.wmoGroupID = integer(input.wmoGroupID, `${context}.wmoGroupID`);
  return result;
}

function parseArtLayer(value: unknown, context: string): MapArtLayer {
  const input = object(value, context, [
    "index", "width", "height", "tileWidth", "tileHeight", "minScale", "maxScale",
    "additionalZoomSteps", "tiles",
  ]);
  return {
    index: integer(input.index, `${context}.index`, 0),
    width: integer(input.width, `${context}.width`, 0),
    height: integer(input.height, `${context}.height`, 0),
    tileWidth: integer(input.tileWidth, `${context}.tileWidth`, 0),
    tileHeight: integer(input.tileHeight, `${context}.tileHeight`, 0),
    minScale: number(input.minScale, `${context}.minScale`, 0),
    maxScale: number(input.maxScale, `${context}.maxScale`, 0),
    additionalZoomSteps: integer(input.additionalZoomSteps, `${context}.additionalZoomSteps`, 0),
    tiles: parseTiles(input.tiles, `${context}.tiles`),
  };
}

function parseOverlay(value: unknown, context: string): MapArtOverlay {
  const input = object(value, context, ["id", "offsetX", "offsetY", "textureWidth", "textureHeight", "tiles"]);
  return {
    id: integer(input.id, `${context}.id`, 0),
    offsetX: integer(input.offsetX, `${context}.offsetX`, 0),
    offsetY: integer(input.offsetY, `${context}.offsetY`, 0),
    textureWidth: integer(input.textureWidth, `${context}.textureWidth`, 0),
    textureHeight: integer(input.textureHeight, `${context}.textureHeight`, 0),
    tiles: parseTiles(input.tiles, `${context}.tiles`),
  };
}

function parseArt(value: unknown, context: string): MapArtAssociation {
  const input = object(value, context, ["phaseID", "artID", "styleID", "layers", "overlays"]);
  const result: MapArtAssociation = {
    phaseID: integer(input.phaseID, `${context}.phaseID`, 0),
    artID: integer(input.artID, `${context}.artID`, 0),
    styleID: integer(input.styleID, `${context}.styleID`, 0),
    layers: array(input.layers ?? [], `${context}.layers`).map((entry, index) => parseArtLayer(entry, `${context}.layers[${index}]`)),
  };
  if (hasOwn(input, "overlays")) result.overlays = array(input.overlays, `${context}.overlays`).map((entry, index) => parseOverlay(entry, `${context}.overlays[${index}]`));
  return result;
}

function parseRecord(value: unknown, context: string): MapRecord {
  const input = object(value, context, ["id", "name", "parentID", "type", "flags", "assignments", "art"]);
  const result: MapRecord = {
    id: integer(input.id, `${context}.id`, 0),
    name: string(input.name, `${context}.name`, ""),
    parentID: integer(input.parentID, `${context}.parentID`, 0),
    type: integer(input.type, `${context}.type`, 0),
    flags: integer(input.flags, `${context}.flags`, 0),
  };
  if (hasOwn(input, "assignments")) result.assignments = array(input.assignments, `${context}.assignments`).map((entry, index) => parseAssignment(entry, `${context}.assignments[${index}]`));
  if (hasOwn(input, "art")) result.art = array(input.art, `${context}.art`).map((entry, index) => parseArt(entry, `${context}.art[${index}]`));
  return result;
}

function parseFloor(value: unknown, context: string): MapInstanceFloor {
  const input = object(value, context, ["floor", "width", "height", "tileWidth", "tileHeight", "bounds", "tiles"]);
  const result: MapInstanceFloor = {
    floor: integer(input.floor, `${context}.floor`, 0),
    width: integer(input.width, `${context}.width`, 0),
    height: integer(input.height, `${context}.height`, 0),
    tileWidth: integer(input.tileWidth, `${context}.tileWidth`, 0),
    tileHeight: integer(input.tileHeight, `${context}.tileHeight`, 0),
    tiles: parseTiles(input.tiles, `${context}.tiles`),
  };
  const bounds = optional(input.bounds, (entry) => parseBounds(entry, `${context}.bounds`));
  if (bounds) result.bounds = bounds;
  return result;
}

function parseRendered(value: unknown, context: string): MapRenderedArtwork {
  const input = object(value, context, ["path", "width", "height", "source", "bounds", "triangles"]);
  const result: MapRenderedArtwork = {
    path: string(input.path, `${context}.path`, ""),
    width: integer(input.width, `${context}.width`, 0),
    height: integer(input.height, `${context}.height`, 0),
    source: string(input.source, `${context}.source`, ""),
    bounds: input.bounds === undefined ? { minX: 0, maxX: 0, minY: 0, maxY: 0 } : parseBounds(input.bounds, `${context}.bounds`),
  };
  if (hasOwn(input, "triangles")) result.triangles = safeInteger(input.triangles, `${context}.triangles`);
  return result;
}

function parseManualRender(value: unknown, context: string): MapManualRender {
  const input = object(value, context, ["path", "width", "height", "bounds"]);
  const result: MapManualRender = {
    path: string(input.path, `${context}.path`, ""),
    width: integer(input.width, `${context}.width`, 0),
    height: integer(input.height, `${context}.height`, 0),
  };
  const bounds = optional(input.bounds, (entry) => parseBounds(entry, `${context}.bounds`));
  if (bounds) result.bounds = bounds;
  return result;
}

function parse3D(value: unknown, context: string): Map3DAsset {
  const input = object(value, context, ["path"]);
  return { path: string(input.path, `${context}.path`, "") };
}

function parseInstance(value: unknown, context: string): MapInstance {
  const input = object(value, context, [
    "mapID", "name", "instanceType", "directory", "floors", "rendered", "styled", "renders", "3d",
  ]);
  const result: MapInstance = {
    mapID: integer(input.mapID, `${context}.mapID`, 0),
    name: string(input.name, `${context}.name`, ""),
    instanceType: integer(input.instanceType, `${context}.instanceType`, 0),
    directory: string(input.directory, `${context}.directory`, ""),
    floors: array(input.floors ?? [], `${context}.floors`).map((entry, index) => parseFloor(entry, `${context}.floors[${index}]`)),
  };
  const rendered = optional(input.rendered, (entry) => parseRendered(entry, `${context}.rendered`));
  const styled = optional(input.styled, (entry) => parseRendered(entry, `${context}.styled`));
  const renders = optional(input.renders, (entry) => parseManualRender(entry, `${context}.renders`));
  const model3d = optional(input["3d"], (entry) => parse3D(entry, `${context}.3d`));
  if (rendered) result.rendered = rendered;
  if (styled) result.styled = styled;
  if (renders) result.renders = renders;
  if (model3d) result["3d"] = model3d;
  return result;
}

function format(value: unknown, context: string): typeof MAP_MANIFEST_FORMAT {
  if (value !== MAP_MANIFEST_FORMAT) throw new TypeError(`unsupported ${context} format ${JSON.stringify(value)}`);
  return MAP_MANIFEST_FORMAT;
}

export function parseMapManifest(value: unknown): MapManifest {
  const input = object(value, "original map manifest", ["format", "target", "maps", "instances"]);
  const manifest: MapManifest = {
    format: format(input.format, "original map manifest"),
    target: parseTarget(input.target, "original map manifest.target"),
    maps: array(input.maps ?? [], "original map manifest.maps").map((entry, index) => parseRecord(entry, `original map manifest.maps[${index}]`)),
    instances: array(input.instances ?? [], "original map manifest.instances").map((entry, index) => parseInstance(entry, `original map manifest.instances[${index}]`)),
  };
  if (manifest.target.product === "") throw new TypeError("original map manifest has no target product");
  return manifest;
}

export function parseMapLayer(value: unknown): MapLayerManifest {
  const input = object(value, "map layer", ["format", "target", "instances"]);
  return {
    format: format(input.format, "map layer"),
    target: parseTarget(input.target, "map layer.target"),
    instances: array(input.instances ?? [], "map layer.instances").map((entry, index) => {
      const context = `map layer.instances[${index}]`;
      const item = object(entry, context, ["mapID", "name", "rendered", "styled", "renders", "3d"]);
      const result: MapLayerInstance = { mapID: integer(item.mapID, `${context}.mapID`, 0) };
      if (hasOwn(item, "name")) result.name = string(item.name, `${context}.name`);
      const rendered = optional(item.rendered, (art) => parseRendered(art, `${context}.rendered`));
      const styled = optional(item.styled, (art) => parseRendered(art, `${context}.styled`));
      const renders = optional(item.renders, (art) => parseManualRender(art, `${context}.renders`));
      const model3d = optional(item["3d"], (art) => parse3D(art, `${context}.3d`));
      if (rendered) result.rendered = rendered;
      if (styled) result.styled = styled;
      if (renders) result.renders = renders;
      if (model3d) result["3d"] = model3d;
      return result;
    }),
  };
}

export function isPreviewableMapAssetPath(assetPath: string): boolean {
  return ["original/", "tiles/", "render/", "render-styled/", "renders/", "3d/"].some((prefix) => validAssetPath(assetPath, prefix));
}

function validAssetPath(assetPath: string, prefix: string): boolean {
  if (!assetPath.startsWith(prefix) || assetPath.length === prefix.length || assetPath.includes("\\")) return false;
  const parts = assetPath.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

function targetsEqual(left: MapTarget, right: MapTarget): boolean {
  return left.product === right.product && left.build === right.build && left.region === right.region && left.locale === right.locale;
}

function mergeLayer(
  kind: LayerKind,
  rawLayer: unknown,
  target: MapTarget,
  instances: Map<number, MapInstance>,
  created: Map<number, MapInstance>,
): void {
  const layer = parseMapLayer(rawLayer);
  const portableTarget = layer.target.product === target.product && layer.target.build === "" && layer.target.region === "" && layer.target.locale === "";
  if ((kind === "render" && !targetsEqual(layer.target, target)) || (kind !== "render" && !portableTarget)) {
    throw new TypeError(`${kind} map layer target does not match original`);
  }

  const seen = new Set<number>();
  for (const entry of layer.instances) {
    if (seen.has(entry.mapID)) throw new TypeError(`duplicate ${kind} map layer mapID ${entry.mapID}`);
    seen.add(entry.mapID);

    let instance = instances.get(entry.mapID);
    if (!instance) {
      if (kind !== "renders" && kind !== "3d") throw new TypeError(`unknown ${kind} map layer mapID ${entry.mapID}`);
      if (entry.mapID <= 0 || (entry.name ?? "").trim() === "") {
        throw new TypeError(`${kind} map layer mapID ${entry.mapID} needs a positive mapID and name to create an instance`);
      }
      instance = { mapID: entry.mapID, name: entry.name!, instanceType: 1, directory: "", floors: [] };
      instances.set(entry.mapID, instance);
      created.set(entry.mapID, instance);
    } else if (created.has(entry.mapID) && entry.name !== undefined && entry.name !== "" && entry.name !== instance.name) {
      throw new TypeError(`conflicting names for manually created instance mapID ${entry.mapID}`);
    }

    const fields = [entry.rendered, entry.styled, entry.renders, entry["3d"]].filter((field) => field !== undefined).length;
    if (fields !== 1) throw new TypeError(`${kind} map layer mapID ${entry.mapID} must contain only its own artwork`);

    if (kind === "render" || kind === "styled") {
      const artwork = kind === "render" ? entry.rendered : entry.styled;
      const prefix = kind === "render" ? "render/" : "render-styled/";
      if (!artwork || !validAssetPath(artwork.path, prefix) || artwork.width <= 0 || artwork.height <= 0) {
        throw new TypeError(`invalid ${kind} map layer artwork for mapID ${entry.mapID}`);
      }
      instance[kind === "render" ? "rendered" : "styled"] = artwork;
    } else if (kind === "renders") {
      const artwork = entry.renders;
      if (!artwork || !validAssetPath(artwork.path, "renders/") || !artwork.path.endsWith(".png") || artwork.width <= 0 || artwork.height <= 0) {
        throw new TypeError(`invalid renders map layer artwork for mapID ${entry.mapID}`);
      }
      instance.renders = artwork;
    } else {
      const artwork = entry["3d"];
      if (!artwork || !validAssetPath(artwork.path, "3d/") || !artwork.path.endsWith(".glb")) {
        throw new TypeError(`invalid 3d map layer artwork for mapID ${entry.mapID}`);
      }
      instance["3d"] = artwork;
    }
  }
}

export function mergeMapManifests(original: unknown, layers: MapManifestLayers = {}): MapManifest {
  const manifest = parseMapManifest(original);
  const mapIDs = new Set<number>();
  for (const record of manifest.maps) {
    if (mapIDs.has(record.id)) throw new TypeError(`duplicate original UI map ID ${record.id}`);
    mapIDs.add(record.id);
  }

  const instances = new Map<number, MapInstance>();
  for (const source of manifest.instances) {
    if (instances.has(source.mapID)) throw new TypeError(`duplicate original instance mapID ${source.mapID}`);
    const { rendered: _rendered, styled: _styled, renders: _renders, "3d": _model3d, ...metadata } = source;
    const instance: MapInstance = metadata;
    instances.set(instance.mapID, instance);
  }
  manifest.instances = [...instances.values()];

  const created = new Map<number, MapInstance>();
  for (const kind of ["render", "styled", "renders", "3d"] as const) {
    if (layers[kind] !== undefined) mergeLayer(kind, layers[kind], manifest.target, instances, created);
  }
  for (const mapID of [...created.keys()].sort((left, right) => left - right)) {
    manifest.instances.push(created.get(mapID)!);
  }
  return manifest;
}
