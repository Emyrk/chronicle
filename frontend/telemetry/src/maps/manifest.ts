export const MAP_MANIFEST_FORMAT = "chronicle-wow-map-art-v2" as const;

export const MAP_MANIFEST_NAMESPACES = [
  "forever",
  "kronos",
  "epoch",
  // OctoWoW and Capy share Turtle's icons.chronicleclassic.com namespace.
  "turtle",
  "tbc",
  "vanillaplus",
  "warmane",
  "ascension",
  "azerothcore",
] as const;

export const MAP_NAMESPACES = MAP_MANIFEST_NAMESPACES;
export type MapManifestNamespace = (typeof MAP_MANIFEST_NAMESPACES)[number];
export type MapNamespace = MapManifestNamespace;

export const MAP_NAMESPACE_PRODUCTS: Record<MapManifestNamespace, string> = {
  forever: "wow_classic_beta",
  kronos: "kronos",
  epoch: "epoch",
  turtle: "turtle",
  tbc: "tbc",
  vanillaplus: "vanillaplus",
  warmane: "warmane",
  ascension: "ascension",
  azerothcore: "azerothcore",
};

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
  preferred2D?: "renders" | "art";
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  bounds?: MapFloorBounds;
  tiles: MapTile[];
  renders?: MapManualRender;
  mesh?: MapPlaceableMesh;
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

export interface MapPlaceableMesh {
  path: string;
  bounds: MapFloorBounds;
  zMin: number;
  zMax: number;
  frame: string;
  liquid?: { color: string; opacity: number };
}

/** Optional metadata only; triangle data lives in the separately hashed JSON asset. */
export interface MapFloorSupport {
  version: 1;
  path: string;
  sha256: string;
  datasetID: string;
  mapID: number;
  frame: "wow-yup-mirrored-x";
  floorIDs: number[];
  sources: { floor: number; path: string; sha256: string }[];
  /** Evaluation provenance only, not a publication gate or floor-accuracy guarantee. */
  validated: boolean;
}

export interface MapReuseSource {
  namespace: MapManifestNamespace;
  mapID: number;
}

export interface MapInstance {
  floorSupport?: MapFloorSupport;
  reusedFrom?: MapReuseSource;
  mapID: number;
  name: string;
  instanceType: number;
  directory: string;
  floors: MapInstanceFloor[];
  styled?: MapRenderedArtwork;
  renders?: MapManualRender;
  mesh?: MapPlaceableMesh;
}

export interface MapManifest {
  format: typeof MAP_MANIFEST_FORMAT;
  target: MapTarget;
  maps: MapRecord[];
  instances: MapInstance[];
}

export function emptyMapManifest(namespace: MapManifestNamespace): MapManifest {
  return {
    format: MAP_MANIFEST_FORMAT,
    target: { product: MAP_NAMESPACE_PRODUCTS[namespace], build: "", region: "", locale: "" },
    maps: [],
    instances: [],
  };
}

function parseRecoverableMapManifest(value: unknown): MapManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("map reader manifest must be an object");
  }
  const input = value as Record<string, unknown>;
  if (input.format !== MAP_MANIFEST_FORMAT && input.format !== "chronicle-wow-map-art-v1") {
    throw new TypeError(`unsupported map reader manifest format ${JSON.stringify(input.format)}`);
  }
  return parseMapManifest({ ...input, format: MAP_MANIFEST_FORMAT });
}

/**
 * Recovers a native-art base from an older reader-facing manifest. Legacy v1
 * data is structurally compatible after the format upgrade. Optional artwork
 * is removed because its source manifests remain authoritative and must be
 * able to delete or replace those fields on the next publish.
 */
export function recoverMapManifestBase(value: unknown, namespace: MapManifestNamespace): MapManifest {
  if (value === undefined) return emptyMapManifest(namespace);
  const manifest = parseRecoverableMapManifest(value);
  const expectedProduct = MAP_NAMESPACE_PRODUCTS[namespace];
  if (manifest.target.product !== expectedProduct) {
    throw new TypeError(`map reader manifest product ${JSON.stringify(manifest.target.product)} does not match namespace product ${JSON.stringify(expectedProduct)}`);
  }
  return {
    ...manifest,
    instances: manifest.instances.filter((instance) => !instance.reusedFrom).map(({ floorSupport: _floorSupport, reusedFrom: _reusedFrom, styled: _styled, renders: _renders, mesh: _mesh, ...instance }) => ({
      ...instance,
      floors: instance.floors.map(({ preferred2D: _preferred2D, renders: _floorRenders, mesh: _floorMesh, ...floor }) => floor),
    })),
  };
}

export function recoverMapManifestLayers(value: unknown): MapManifestLayers {
  if (value === undefined) return {};
  const manifest = parseRecoverableMapManifest(value);
  const target = { product: manifest.target.product, build: "", region: "", locale: "" };
  const reuses = manifest.instances.filter((instance) => instance.reusedFrom);
  const styled = manifest.instances.filter((instance) => !instance.reusedFrom).flatMap((instance) => instance.styled
    ? [{ mapID: instance.mapID, name: instance.name, styled: instance.styled }]
    : []);
  const renders = manifest.instances.filter((instance) => !instance.reusedFrom).flatMap((instance) => {
    const floors = instance.floors.flatMap((floor) => floor.renders || floor.preferred2D !== undefined
      ? [{ floor: floor.floor, ...(floor.preferred2D === undefined ? {} : { preferred2D: floor.preferred2D }), ...(floor.renders ? { renders: floor.renders } : {}) }]
      : []);
    return instance.renders || floors.length > 0
      ? [{ mapID: instance.mapID, name: instance.name, ...(instance.renders ? { renders: instance.renders } : {}), ...(floors.length > 0 ? { floors } : {}) }]
      : [];
  });
  const meshes = manifest.instances.filter((instance) => !instance.reusedFrom).flatMap((instance) => {
    const floors = instance.floors.flatMap((floor) => floor.mesh ? [{ floor: floor.floor, mesh: floor.mesh }] : []);
    return instance.floorSupport || instance.mesh || floors.length > 0
      ? [{ mapID: instance.mapID, name: instance.name, ...(instance.floorSupport ? { floorSupport: instance.floorSupport } : {}), ...(instance.mesh ? { mesh: instance.mesh } : {}), ...(floors.length > 0 ? { floors } : {}) }]
      : [];
  });
  return {
    reuses: reuses.length > 0 ? { format: MAP_MANIFEST_FORMAT, target, instances: reuses } : undefined,
    styled: styled.length > 0 ? { format: MAP_MANIFEST_FORMAT, target, instances: styled } : undefined,
    renders: renders.length > 0 ? { format: MAP_MANIFEST_FORMAT, target, instances: renders } : undefined,
    meshes: meshes.length > 0 ? { format: MAP_MANIFEST_FORMAT, target, instances: meshes } : undefined,
  };
}

export interface MapLayerFloor {
  floor: number;
  preferred2D?: "renders" | "art";
  renders?: MapManualRender;
  mesh?: MapPlaceableMesh;
}

export interface MapLayerInstance {
  floorSupport?: MapFloorSupport;
  mapID: number;
  name?: string;
  styled?: MapRenderedArtwork;
  renders?: MapManualRender;
  mesh?: MapPlaceableMesh;
  floors?: MapLayerFloor[];
}

export interface MapLayerManifest {
  format: typeof MAP_MANIFEST_FORMAT;
  target: MapTarget;
  instances: MapLayerInstance[];
}

export interface MapReuseManifest {
  format: typeof MAP_MANIFEST_FORMAT;
  target: MapTarget;
  instances: MapInstance[];
}

export interface MapManifestLayers {
  reuses?: unknown;
  styled?: unknown;
  renders?: unknown;
  meshes?: unknown;
}

type JSONObject = Record<string, unknown>;
type LayerKind = Exclude<keyof MapManifestLayers, "reuses">;

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

function preferred2D(value: unknown, context: string): "renders" | "art" {
  if (value !== "renders" && value !== "art") {
    throw new TypeError(`${context} must be "renders" or "art"`);
  }
  return value;
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
  const input = object(value, context, ["floor", "preferred2D", "width", "height", "tileWidth", "tileHeight", "bounds", "tiles", "renders", "mesh"]);
  const result: MapInstanceFloor = {
    floor: integer(input.floor, `${context}.floor`, 0),
    width: integer(input.width, `${context}.width`, 0),
    height: integer(input.height, `${context}.height`, 0),
    tileWidth: integer(input.tileWidth, `${context}.tileWidth`, 0),
    tileHeight: integer(input.tileHeight, `${context}.tileHeight`, 0),
    tiles: parseTiles(input.tiles, `${context}.tiles`),
  };
  const preferred = optional(input.preferred2D, (entry) => preferred2D(entry, `${context}.preferred2D`));
  const bounds = optional(input.bounds, (entry) => parseBounds(entry, `${context}.bounds`));
  const renders = optional(input.renders, (entry) => parseManualRender(entry, `${context}.renders`));
  const mesh = optional(input.mesh, (entry) => parseMesh(entry, `${context}.mesh`));
  if (preferred) result.preferred2D = preferred;
  if (bounds) result.bounds = bounds;
  if (renders) result.renders = renders;
  if (mesh) result.mesh = mesh;
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

function parseMesh(value: unknown, context: string): MapPlaceableMesh {
  const input = object(value, context, ["path", "bounds", "zMin", "zMax", "frame", "liquid"]);
  const boundsInput = object(input.bounds, `${context}.bounds`, ["minX", "maxX", "minY", "maxY"]);
  for (const key of ["minX", "maxX", "minY", "maxY"]) {
    if (!hasOwn(boundsInput, key)) throw new TypeError(`${context}.bounds.${key} is required`);
  }
  const bounds = parseBounds(boundsInput, `${context}.bounds`);
  const zMin = number(input.zMin, `${context}.zMin`);
  const zMax = number(input.zMax, `${context}.zMax`);
  const frame = string(input.frame, `${context}.frame`);
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY || zMin >= zMax || frame !== "wow-yup-mirrored-x") {
    throw new TypeError(`${context} requires calibrated bounds, zMin < zMax, and a coordinate frame`);
  }
  const mesh: MapPlaceableMesh = { path: string(input.path, `${context}.path`), bounds, zMin, zMax, frame };
  if (input.liquid !== undefined) {
    const liquid = object(input.liquid, `${context}.liquid`, ["color", "opacity"]);
    const color = string(liquid.color, `${context}.liquid.color`);
    const opacity = number(liquid.opacity, `${context}.liquid.opacity`);
    if (!/^#[0-9a-fA-F]{6}$/.test(color) || opacity <= 0 || opacity > 1) {
      throw new TypeError(`${context}.liquid requires a hex color and opacity in (0, 1]`);
    }
    mesh.liquid = { color, opacity };
  }
  return mesh;
}

function parseReuseSource(value: unknown, context: string): MapReuseSource {
  const input = object(value, context, ["namespace", "mapID"]);
  const namespace = string(input.namespace, `${context}.namespace`);
  if (!isNamespaceValue(namespace)) throw new TypeError(`${context}.namespace is not supported`);
  return { namespace, mapID: integer(input.mapID, `${context}.mapID`, 0) };
}

function parseInstance(value: unknown, context: string): MapInstance {
  const input = object(value, context, [
    "mapID", "name", "instanceType", "directory", "floors", "styled", "renders", "mesh", "floorSupport", "reusedFrom",
  ]);
  const result: MapInstance = {
    mapID: integer(input.mapID, `${context}.mapID`, 0),
    name: string(input.name, `${context}.name`, ""),
    instanceType: integer(input.instanceType, `${context}.instanceType`, 0),
    directory: string(input.directory, `${context}.directory`, ""),
    floors: array(input.floors ?? [], `${context}.floors`).map((entry, index) => parseFloor(entry, `${context}.floors[${index}]`)),
  };
  const styled = optional(input.styled, (entry) => parseRendered(entry, `${context}.styled`));
  const renders = optional(input.renders, (entry) => parseManualRender(entry, `${context}.renders`));
  const meshes = optional(input.mesh, (entry) => parseMesh(entry, `${context}.mesh`));
  if (styled) result.styled = styled;
  if (renders) result.renders = renders;
  if (meshes) result.mesh = meshes;
  if (input.reusedFrom !== undefined) result.reusedFrom = parseReuseSource(input.reusedFrom, `${context}.reusedFrom`);
  if (input.floorSupport !== undefined) result.floorSupport = parseFloorSupport(input.floorSupport);
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
      const item = object(entry, context, ["mapID", "name", "styled", "renders", "mesh", "floors", "floorSupport"]);
      const result: MapLayerInstance = { mapID: integer(item.mapID, `${context}.mapID`, 0) };
      if (hasOwn(item, "name")) result.name = string(item.name, `${context}.name`);
      const styled = optional(item.styled, (art) => parseRendered(art, `${context}.styled`));
      const renders = optional(item.renders, (art) => parseManualRender(art, `${context}.renders`));
      const meshes = optional(item.mesh, (art) => parseMesh(art, `${context}.mesh`));
      const floors = optional(item.floors, (entries) => array(entries, `${context}.floors`).map((floor, floorIndex) => {
        const floorContext = `${context}.floors[${floorIndex}]`;
        const floorItem = object(floor, floorContext, ["floor", "preferred2D", "renders", "mesh"]);
        const parsed: MapLayerFloor = { floor: integer(floorItem.floor, `${floorContext}.floor`) };
        const floorPreferred = optional(floorItem.preferred2D, (value) => preferred2D(value, `${floorContext}.preferred2D`));
        const floorRenders = optional(floorItem.renders, (art) => parseManualRender(art, `${floorContext}.renders`));
        const floorMesh = optional(floorItem.mesh, (art) => parseMesh(art, `${floorContext}.mesh`));
        if (floorPreferred) parsed.preferred2D = floorPreferred;
        if (floorRenders) parsed.renders = floorRenders;
        if (floorMesh) parsed.mesh = floorMesh;
        return parsed;
      }));
      if (styled) result.styled = styled;
      if (renders) result.renders = renders;
      if (meshes) result.mesh = meshes;
      if (floors) result.floors = floors;
      if (item.floorSupport !== undefined) result.floorSupport = parseFloorSupport(item.floorSupport);
      return result;
    }),
  };
}

export function parseMapReuseLayer(value: unknown): MapReuseManifest {
  const input = object(value, "map reuse layer", ["format", "target", "instances"]);
  return {
    format: format(input.format, "map reuse layer"),
    target: parseTarget(input.target, "map reuse layer.target"),
    instances: array(input.instances ?? [], "map reuse layer.instances").map((entry, index) => {
      const instance = parseInstance(entry, `map reuse layer.instances[${index}]`);
      if (!instance.reusedFrom) throw new TypeError(`map reuse layer.instances[${index}].reusedFrom is required`);
      return instance;
    }),
  };
}

export function isPreviewableMapAssetPath(assetPath: string): boolean {
  return ["original/", "tiles/", "render-styled/", "renders/", "3d/"].some((prefix) => validAssetPath(assetPath, prefix));
}

function validAssetPath(assetPath: string, prefix: string): boolean {
  if (!assetPath.startsWith(prefix) || assetPath.length === prefix.length || assetPath.includes("\\")) return false;
  const parts = assetPath.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..");
}

const MAP_ASSET_ORIGIN = "https://icons.chronicleclassic.com";

/** Resolves a local or cross-flavor map asset reference to its R2 object key. */
export function mapAssetStorageKey(namespace: MapManifestNamespace, assetPath: string): string | undefined {
  if (!/^https:\/\//i.test(assetPath)) return `${namespace}/maps/${assetPath}`;
  let url: URL;
  try {
    url = new URL(assetPath);
  } catch {
    return undefined;
  }
  if (url.origin !== MAP_ASSET_ORIGIN || url.search !== "" || url.hash !== "") return undefined;
  const match = url.pathname.match(/^\/([^/]+)\/maps\/(.+)$/);
  if (!match || !isNamespaceValue(match[1]) || !isPreviewableMapAssetPath(match[2]) && !isFloorSupportAssetPath(match[2])) return undefined;
  return `${match[1]}/maps/${match[2]}`;
}

function isNamespaceValue(value: string): value is MapManifestNamespace {
  return MAP_MANIFEST_NAMESPACES.includes(value as MapManifestNamespace);
}

function isReusableMeshPath(assetPath: string): boolean {
  return (validAssetPath(assetPath, "3d/") && assetPath.endsWith(".glb"))
    || (/^https:\/\//i.test(assetPath) && mapAssetStorageKey("forever", assetPath) !== undefined);
}

function isRenderImagePath(assetPath: string): boolean {
  return assetPath.endsWith(".png") || assetPath.endsWith(".webp");
}

function validateLayerArtwork(
  kind: LayerKind,
  artwork: MapRenderedArtwork | MapManualRender | MapPlaceableMesh | undefined,
  mapID: number,
  floor?: number,
): void {
  const location = floor === undefined ? `mapID ${mapID}` : `mapID ${mapID} floor ${floor}`;
  if (kind === "styled") {
    const styled = artwork as MapRenderedArtwork | undefined;
    if (!styled || !validAssetPath(styled.path, "render-styled/") || styled.width <= 0 || styled.height <= 0) {
      throw new TypeError(`invalid ${kind} map layer artwork for ${location}`);
    }
  } else if (kind === "renders") {
    const render = artwork as MapManualRender | undefined;
    if (!render || !validAssetPath(render.path, "renders/") || !isRenderImagePath(render.path) || render.width <= 0 || render.height <= 0) {
      throw new TypeError(`invalid renders map layer artwork for ${location}`);
    }
  } else {
    const mesh = artwork as MapPlaceableMesh | undefined;
    if (!mesh || !isReusableMeshPath(mesh.path)) {
      throw new TypeError(`invalid meshes map layer artwork for ${location}`);
    }
  }
}

function reusedAssetPath(path: string, prefix: string, extensions: readonly string[]): boolean {
  const key = mapAssetStorageKey("forever", path);
  if (!key) return false;
  const marker = "/maps/";
  const assetPath = key.slice(key.indexOf(marker) + marker.length);
  return validAssetPath(assetPath, prefix) && extensions.some((extension) => assetPath.endsWith(extension));
}

function validateReusedInstance(instance: MapInstance): void {
  if (!instance.reusedFrom) throw new TypeError(`reused mapID ${instance.mapID} requires reusedFrom`);
  if (instance.floorSupport) throw new TypeError(`reused mapID ${instance.mapID} cannot copy floorSupport`);
  const validateMesh = (mesh: MapPlaceableMesh | undefined, context: string) => {
    if (mesh && !reusedAssetPath(mesh.path, "3d/", [".glb"])) throw new TypeError(`${context} must use a Chronicle CDN 3d/*.glb URL`);
  };
  const validateRender = (render: MapManualRender | undefined, context: string) => {
    if (render && !reusedAssetPath(render.path, "renders/", [".png", ".webp"])) throw new TypeError(`${context} must use a Chronicle CDN render URL`);
  };
  if (instance.styled && !reusedAssetPath(instance.styled.path, "render-styled/", [".png", ".webp", ".jpeg"])) {
    throw new TypeError(`reused mapID ${instance.mapID} styled art must use a Chronicle CDN URL`);
  }
  validateRender(instance.renders, `reused mapID ${instance.mapID} render`);
  validateMesh(instance.mesh, `reused mapID ${instance.mapID} mesh`);
  for (const floor of instance.floors) {
    for (const tile of floor.tiles) {
      if (!reusedAssetPath(tile.path, "original/", [".webp"]) && !reusedAssetPath(tile.path, "tiles/", [".webp"])) {
        throw new TypeError(`reused mapID ${instance.mapID} floor ${floor.floor} tile must use a Chronicle CDN URL`);
      }
    }
    validateRender(floor.renders, `reused mapID ${instance.mapID} floor ${floor.floor} render`);
    validateMesh(floor.mesh, `reused mapID ${instance.mapID} floor ${floor.floor} mesh`);
  }
}

function mergeReuseLayer(rawLayer: unknown, target: MapTarget, instances: Map<number, MapInstance>): void {
  const layer = parseMapReuseLayer(rawLayer);
  if (layer.target.product !== target.product || layer.target.build !== "" || layer.target.region !== "" || layer.target.locale !== "") {
    throw new TypeError("reuses map layer target does not match original");
  }
  const seen = new Set<number>();
  for (const instance of layer.instances) {
    if (seen.has(instance.mapID)) throw new TypeError(`duplicate reuses map layer mapID ${instance.mapID}`);
    seen.add(instance.mapID);
    validateReusedInstance(instance);
    instances.set(instance.mapID, instance);
  }
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
  if (!portableTarget) {
    throw new TypeError(`${kind} map layer target does not match original`);
  }

  const seen = new Set<number>();
  for (const entry of layer.instances) {
    if (seen.has(entry.mapID)) throw new TypeError(`duplicate ${kind} map layer mapID ${entry.mapID}`);
    seen.add(entry.mapID);

    let instance = instances.get(entry.mapID);
    if (!instance) {
      if (kind !== "renders" && kind !== "meshes") throw new TypeError(`unknown ${kind} map layer mapID ${entry.mapID}`);
      if (entry.mapID <= 0 || (entry.name ?? "").trim() === "") {
        throw new TypeError(`${kind} map layer mapID ${entry.mapID} needs a positive mapID and name to create an instance`);
      }
      if ((entry.floors?.length ?? 0) > 0) {
        throw new TypeError(`${kind} map layer mapID ${entry.mapID} cannot attach floor artwork without native floors`);
      }
      instance = { mapID: entry.mapID, name: entry.name!, instanceType: 1, directory: "", floors: [] };
      instances.set(entry.mapID, instance);
      created.set(entry.mapID, instance);
    } else if (created.has(entry.mapID) && entry.name !== undefined && entry.name !== "" && entry.name !== instance.name) {
      throw new TypeError(`conflicting names for manually created instance mapID ${entry.mapID}`);
    }

    if (entry.floorSupport && kind !== "meshes") throw new TypeError("floorSupport belongs to meshes layer");
    if (entry.floorSupport) instance.floorSupport = entry.floorSupport;
    const directFields = [entry.styled, entry.renders, entry.mesh].filter((field) => field !== undefined).length;
    const expectedDirect = kind === "styled" ? entry.styled : kind === "renders" ? entry.renders : entry.mesh;
    const floors = entry.floors ?? [];
    if (directFields > (expectedDirect ? 1 : 0) || (!expectedDirect && floors.length === 0 && !(kind === "meshes" && entry.floorSupport))) {
      throw new TypeError(`${kind} map layer mapID ${entry.mapID} must contain only its own artwork`);
    }
    if (kind === "styled" && floors.length > 0) {
      throw new TypeError(`styled map layer mapID ${entry.mapID} cannot contain floor artwork`);
    }

    if (expectedDirect) {
      validateLayerArtwork(kind, expectedDirect, entry.mapID);
      if (kind === "styled") instance.styled = expectedDirect as MapRenderedArtwork;
      else if (kind === "renders") instance.renders = expectedDirect as MapManualRender;
      else instance.mesh = expectedDirect as MapPlaceableMesh;
    }

    const nativeFloors = new Map(instance.floors.map((floor) => [floor.floor, floor]));
    const seenFloors = new Set<number>();
    for (const floorEntry of floors) {
      if (seenFloors.has(floorEntry.floor)) {
        throw new TypeError(`duplicate ${kind} map layer mapID ${entry.mapID} floor ${floorEntry.floor}`);
      }
      seenFloors.add(floorEntry.floor);
      const floor = nativeFloors.get(floorEntry.floor);
      if (!floor) throw new TypeError(`unknown ${kind} map layer mapID ${entry.mapID} floor ${floorEntry.floor}`);
      const floorFields = [floorEntry.renders, floorEntry.mesh].filter((field) => field !== undefined).length;
      const artwork = kind === "renders" ? floorEntry.renders : kind === "meshes" ? floorEntry.mesh : undefined;
      const hasPreference = floorEntry.preferred2D !== undefined;
      if (floorFields > (artwork ? 1 : 0) || (!artwork && !(kind === "renders" && hasPreference)) || (kind !== "renders" && hasPreference)) {
        throw new TypeError(`${kind} map layer mapID ${entry.mapID} floor ${floorEntry.floor} must contain only its own artwork`);
      }
      if (artwork) validateLayerArtwork(kind, artwork, entry.mapID, floorEntry.floor);
      if (kind === "renders") {
        if (artwork) floor.renders = artwork as MapManualRender;
        if (floorEntry.preferred2D !== undefined) floor.preferred2D = floorEntry.preferred2D;
      } else if (artwork) floor.mesh = artwork as MapPlaceableMesh;
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

  const originalOrder = manifest.instances.map((instance) => instance.mapID);
  const instances = new Map<number, MapInstance>();
  for (const source of manifest.instances.filter((instance) => !instance.reusedFrom)) {
    if (instances.has(source.mapID)) throw new TypeError(`duplicate original instance mapID ${source.mapID}`);
    const { floorSupport: _floorSupport, styled: _styled, renders: _renders, mesh: _mesh, ...metadata } = source;
    const floorNumbers = new Set<number>();
    const floors = metadata.floors.map(({ preferred2D: _preferred2D, renders: _floorRenders, mesh: _floorMesh, ...floor }) => {
      if (floorNumbers.has(floor.floor)) throw new TypeError(`duplicate original instance mapID ${source.mapID} floor ${floor.floor}`);
      floorNumbers.add(floor.floor);
      return floor;
    });
    const instance: MapInstance = { ...metadata, floors };
    instances.set(instance.mapID, instance);
  }
  if (layers.reuses !== undefined) mergeReuseLayer(layers.reuses, manifest.target, instances);

  const created = new Map<number, MapInstance>();
  for (const kind of ["styled", "renders", "meshes"] as const) {
    if (layers[kind] !== undefined) mergeLayer(kind, layers[kind], manifest.target, instances, created);
  }
  const ordered = originalOrder.filter((mapID, index) => originalOrder.indexOf(mapID) === index && instances.has(mapID));
  const appended = [...instances.keys()].filter((mapID) => !ordered.includes(mapID)).sort((left, right) => left - right);
  manifest.instances = [...ordered, ...appended].map((mapID) => instances.get(mapID)!);
  for (const instance of manifest.instances) validateFloorSupportSources(instance);
  return manifest;
}

export function isFloorSupportAssetPath(path: string): boolean {
  return validAssetPath(path, "support/") && /^support\/[a-zA-Z0-9_./-]+\.json$/.test(path);
}

export function parseFloorSupport(value: unknown): MapFloorSupport {
  const input = object(value, "floorSupport", ["version", "path", "sha256", "datasetID", "mapID", "frame", "floorIDs", "sources", "validated"]);
  const hash = (value: unknown): string => {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError("floorSupport requires lowercase SHA-256 hashes");
    return value;
  };
  const path = string(input.path, "floorSupport.path");
  const datasetID = string(input.datasetID, "floorSupport.datasetID");
  const mapID = integer(input.mapID, "floorSupport.mapID");
  if (input.version !== 1 || input.frame !== "wow-yup-mirrored-x" || typeof input.validated !== "boolean" || !datasetID.trim() || mapID <= 0 || !isFloorSupportAssetPath(path)) {
    throw new TypeError("invalid floorSupport contract");
  }
  const floorIDs = array(input.floorIDs, "floorSupport.floorIDs").map((floor) => integer(floor, "floorSupport.floor"));
  if (!floorIDs.length || new Set(floorIDs).size !== floorIDs.length) throw new TypeError("floorSupport requires unique floors");
  const sources = array(input.sources, "floorSupport.sources").map((value) => {
    const source = object(value, "floorSupport.source", ["floor", "path", "sha256"]);
    const floor = integer(source.floor, "floorSupport.source.floor");
    const path = string(source.path, "floorSupport.source.path");
    if (!floorIDs.includes(floor) || !validAssetPath(path, "3d/") || !path.endsWith(".glb")) throw new TypeError("invalid floorSupport source");
    return { floor, path, sha256: hash(source.sha256) };
  });
  if (sources.length !== floorIDs.length || new Set(sources.map((s) => s.floor)).size !== floorIDs.length) throw new TypeError("floorSupport requires one source per floor");
  return { version: 1, path, sha256: hash(input.sha256), datasetID, mapID, frame: "wow-yup-mirrored-x", floorIDs, sources, validated: input.validated };
}

export function validateFloorSupportSources(instance: MapInstance): void {
  const support = instance.floorSupport;
  if (!support) return;
  if (support.mapID !== instance.mapID || support.sources.some((source) => instance.floors.find((floor) => floor.floor === source.floor)?.mesh?.path !== source.path)) {
    throw new TypeError(`stale floorSupport sources for mapID ${instance.mapID}`);
  }
}

/** Validates bounded binary support payloads, without loading them into a renderer. */
export function validateFloorSupportArtifact(value: unknown, descriptor: MapFloorSupport): void {
  const input = object(value, "floor support artifact", ["version", "datasetID", "mapID", "frame", "floorIDs", "sources", "encoding", "floors"]);
  const { encoding, floors, ...metadata } = input;
  const parsed = parseFloorSupport({ ...metadata, path: descriptor.path, sha256: descriptor.sha256, validated: descriptor.validated });
  if (JSON.stringify(parsed) !== JSON.stringify(descriptor) || encoding !== "indexed-f32-le-u32-le") throw new TypeError("floor support artifact does not match descriptor");
  const entries = array(floors, "support floors");
  if (entries.length !== descriptor.floorIDs.length) throw new TypeError("support floor count mismatch");
  const seen = new Set<number>();
  let totalBytes = 0;
  const decode = (value: unknown): DataView => {
    const text = string(value, "support binary");
    if (text.length > 24 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw new TypeError("invalid support base64");
    const binary = atob(text);
    totalBytes += binary.length;
    if (totalBytes > 32 * 1024 * 1024 || binary.length === 0 || binary.length % 12 !== 0) throw new TypeError("invalid support binary length");
    return new DataView(Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer);
  };
  for (const value of entries) {
    const entry = object(value, "support floor", ["floor", "positions", "indices"]);
    const floor = integer(entry.floor, "support floor ID");
    if (seen.has(floor) || !descriptor.floorIDs.includes(floor)) throw new TypeError("invalid support floor ID");
    seen.add(floor);
    const positions = decode(entry.positions);
    const indices = decode(entry.indices);
    const vertices = positions.byteLength / 12;
    if (vertices > 1_000_000) throw new TypeError("too many support vertices");
    for (let i = 0; i < positions.byteLength; i += 4) if (!Number.isFinite(positions.getFloat32(i, true))) throw new TypeError("nonfinite support position");
    for (let i = 0; i < indices.byteLength; i += 4) if (indices.getUint32(i, true) >= vertices) throw new TypeError("support index out of bounds");
  }
}
