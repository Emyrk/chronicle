export const MINIATURE_MANIFEST_FORMAT = "chronicle-unit-miniatures-v1" as const;

export interface UnitModelDefinition {
  name: string;
  path: string;
  entry_ids: number[];
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

export function isMiniatureAssetPath(path: string): boolean {
  return /^miniatures\/[^/\\]+\.glb$/.test(path);
}

function parseModelCollection(value: unknown, context: string): UnitModelDefinition[] {
  const assignedEntries = new Map<number, string>();
  const paths = new Set<string>();
  const models = array(value, context).map((raw, index) => {
    const itemContext = `${context}[${index}]`;
    const item = object(raw, itemContext, ["name", "path", "entry_ids"]);
    const name = string(item.name, `${itemContext}.name`).trim();
    const path = string(item.path, `${itemContext}.path`);
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
    return { name, path, entry_ids };
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
