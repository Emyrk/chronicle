export const MINIATURE_MANIFEST_FORMAT = "chronicle-unit-miniatures-v1" as const;

export interface MiniatureDefinition {
  name: string;
  path: string;
  entry_ids: number[];
}

export interface MiniatureManifest {
  format: typeof MINIATURE_MANIFEST_FORMAT;
  miniatures: MiniatureDefinition[];
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

export function parseMiniatureManifest(value: unknown): MiniatureManifest {
  const input = object(value, "miniature manifest", ["format", "miniatures"]);
  if (input.format !== MINIATURE_MANIFEST_FORMAT) {
    throw new TypeError(`unsupported miniature manifest format ${JSON.stringify(input.format)}`);
  }

  const assignedEntries = new Map<number, string>();
  const paths = new Set<string>();
  const miniatures = array(input.miniatures, "miniature manifest.miniatures").map((raw, index) => {
    const context = `miniature manifest.miniatures[${index}]`;
    const item = object(raw, context, ["name", "path", "entry_ids"]);
    const name = string(item.name, `${context}.name`).trim();
    const path = string(item.path, `${context}.path`);
    if (name === "") throw new TypeError(`${context}.name must not be blank`);
    if (!isMiniatureAssetPath(path)) throw new TypeError(`${context}.path must be a clean miniatures/*.glb path`);
    if (paths.has(path)) throw new TypeError(`duplicate miniature path ${path}`);
    paths.add(path);

    const ids = array(item.entry_ids, `${context}.entry_ids`).map((id, idIndex) => entryID(id, `${context}.entry_ids[${idIndex}]`));
    if (ids.length === 0) throw new TypeError(`${context}.entry_ids must not be empty`);
    const entry_ids = [...new Set(ids)].sort((left, right) => left - right);
    if (entry_ids.length !== ids.length) throw new TypeError(`${context}.entry_ids contains duplicates`);
    for (const id of entry_ids) {
      const existing = assignedEntries.get(id);
      if (existing) throw new TypeError(`entry ID ${id} is assigned to both ${existing} and ${path}`);
      assignedEntries.set(id, path);
    }
    return { name, path, entry_ids };
  });

  miniatures.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
  return { format: MINIATURE_MANIFEST_FORMAT, miniatures };
}

export function emptyMiniatureManifest(): MiniatureManifest {
  return { format: MINIATURE_MANIFEST_FORMAT, miniatures: [] };
}
