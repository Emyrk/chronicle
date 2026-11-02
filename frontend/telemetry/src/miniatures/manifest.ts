export const MINIATURE_MANIFEST_FORMAT = "chronicle-unit-miniatures-v1" as const;

export const MIN_MAP_SCALE = 0.1;
export const MAX_MAP_SCALE = 10;

export interface UnitModelDefinition {
  name: string;
  path: string;
  entry_ids: number[];
  /** Manual multiplier applied after the client-derived default size. */
  map_scale: number;
  /** Client-derived standing height in world yards, keyed by creature entry ID. */
  world_heights?: Readonly<Record<number, number>>;
}

export interface MiniatureManifest {
  format: typeof MINIATURE_MANIFEST_FORMAT;
  miniatures: UnitModelDefinition[];
  game_models: UnitModelDefinition[];
}

type JSONObject = Record<string, unknown>;

function object(value: unknown, context: string, fields: readonly string[]): JSONObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  const result = value as JSONObject;
  for (const key of Object.keys(result)) {
    if (!fields.includes(key)) throw new TypeError(`${context} has unknown field ${JSON.stringify(key)}`);
  }
  return result;
}

function array(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${context} must be an array`);
  return value;
}

function string(value: unknown, context: string): string {
  if (typeof value !== "string") throw new TypeError(`${context} must be a string`);
  return value;
}

function entryID(value: unknown, context: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > 0xffff_ffff) {
    throw new TypeError(`${context} must be a positive 32-bit entry ID`);
  }
  return value as number;
}

function mapScale(value: unknown, context: string): number {
  if (value === undefined) return 1;
  if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_MAP_SCALE || value > MAX_MAP_SCALE) {
    throw new TypeError(`${context} must be a finite number from ${MIN_MAP_SCALE} to ${MAX_MAP_SCALE}`);
  }
  return value;
}

function worldHeights(value: unknown, entries: readonly number[], context: string): Readonly<Record<number, number>> | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${context} must be an object`);
  const assigned = new Set(entries);
  const heights: Record<number, number> = {};
  for (const [rawEntry, rawHeight] of Object.entries(value)) {
    const entry = Number(rawEntry);
    if (!Number.isSafeInteger(entry) || !assigned.has(entry)) throw new TypeError(`${context} has unassigned entry ID ${rawEntry}`);
    if (typeof rawHeight !== "number" || !Number.isFinite(rawHeight) || rawHeight < 0.1 || rawHeight > 100) {
      throw new TypeError(`${context}.${entry} must be a finite number from 0.1 to 100`);
    }
    heights[entry] = rawHeight;
  }
  return heights;
}

export function isMiniatureAssetPath(path: string): boolean {
  return /^miniatures\/[^/\\]+\.glb$/.test(path);
}

function parseModelCollection(value: unknown, context: string): UnitModelDefinition[] {
  const assignedEntries = new Map<number, string>();
  const paths = new Set<string>();
  const models = array(value, context).map((raw, index) => {
    const itemContext = `${context}[${index}]`;
    const item = object(raw, itemContext, ["name", "path", "entry_ids", "map_scale", "world_heights"]);
    const name = string(item.name, `${itemContext}.name`).trim();
    const path = string(item.path, `${itemContext}.path`);
    const map_scale = mapScale(item.map_scale, `${itemContext}.map_scale`);
    if (name === "") throw new TypeError(`${itemContext}.name must not be blank`);
    if (!isMiniatureAssetPath(path)) throw new TypeError(`${itemContext}.path must be a clean miniatures/*.glb path`);
    if (paths.has(path)) throw new TypeError(`duplicate model path ${path} in ${context}`);
    paths.add(path);

    const ids = array(item.entry_ids, `${itemContext}.entry_ids`).map((id, idIndex) => entryID(id, `${itemContext}.entry_ids[${idIndex}]`));
    if (ids.length === 0) throw new TypeError(`${itemContext}.entry_ids must not be empty`);
    const entry_ids = [...new Set(ids)].sort((left, right) => left - right);
    if (entry_ids.length !== ids.length) throw new TypeError(`${itemContext}.entry_ids contains duplicates`);
    for (const id of entry_ids) {
      const existing = assignedEntries.get(id);
      if (existing) throw new TypeError(`entry ID ${id} is assigned to both ${existing} and ${path} in ${context}`);
      assignedEntries.set(id, path);
    }
    const world_heights = worldHeights(item.world_heights, entry_ids, `${itemContext}.world_heights`);
    return { name, path, entry_ids, map_scale, ...(world_heights === undefined ? {} : { world_heights }) };
  });

  models.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
  return models;
}

export function parseMiniatureManifest(value: unknown): MiniatureManifest {
  const input = object(value, "miniature manifest", ["format", "miniatures", "game_models"]);
  if (input.format !== MINIATURE_MANIFEST_FORMAT) {
    throw new TypeError(`unsupported miniature manifest format ${JSON.stringify(input.format)}`);
  }

  return {
    format: MINIATURE_MANIFEST_FORMAT,
    miniatures: parseModelCollection(input.miniatures, "miniature manifest.miniatures"),
    game_models: parseModelCollection(input.game_models ?? [], "miniature manifest.game_models"),
  };
}

export function emptyMiniatureManifest(): MiniatureManifest {
  return { format: MINIATURE_MANIFEST_FORMAT, miniatures: [], game_models: [] };
}
