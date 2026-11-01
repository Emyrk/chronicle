export const UNIT_IMAGE_MANIFEST_FORMAT = "chronicle-unit-images-v1" as const;

export interface UnitImageDefinition {
  name: string;
  display_name?: string;
  entry_ids: number[];
  images: Record<string, string>;
}

export interface UnitImageManifest {
  format: typeof UNIT_IMAGE_MANIFEST_FORMAT;
  units: UnitImageDefinition[];
}

type JSONObject = Record<string, unknown>;

function object(value: unknown, context: string, fields: readonly string[]): JSONObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${context} must be an object`);
  const result = value as JSONObject;
  for (const key of Object.keys(result)) {
    if (!fields.includes(key)) throw new TypeError(`${context} has unknown field ${JSON.stringify(key)}`);
  }
  return result;
}

function record(value: unknown, context: string): JSONObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${context} must be an object`);
  return value as JSONObject;
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

export function isUnitImageAssetPath(path: string): boolean {
  return /^unit-images\/[^/\\]+\.(?:avif|jpe?g|png|webp)$/.test(path);
}

export function parseUnitImageManifest(value: unknown): UnitImageManifest {
  const input = object(value, "unit image manifest", ["format", "units"]);
  if (input.format !== UNIT_IMAGE_MANIFEST_FORMAT) {
    throw new TypeError(`unsupported unit image manifest format ${JSON.stringify(input.format)}`);
  }

  const assignedEntries = new Map<number, string>();
  const names = new Set<string>();
  const displayNames = new Set<string>();
  const paths = new Set<string>();
  const units = array(input.units, "unit image manifest.units").map((raw, index) => {
    const context = `unit image manifest.units[${index}]`;
    const item = object(raw, context, ["name", "display_name", "entry_ids", "images"]);
    const name = string(item.name, `${context}.name`).trim();
    if (name === "") throw new TypeError(`${context}.name must not be blank`);
    if (names.has(name)) throw new TypeError(`duplicate unit image name ${name}`);
    names.add(name);

    let display_name: string | undefined;
    if (item.display_name !== undefined) {
      display_name = string(item.display_name, `${context}.display_name`).trim();
      if (display_name === "") throw new TypeError(`${context}.display_name must not be blank`);
      const normalized = display_name.toLocaleLowerCase("en-US");
      if (displayNames.has(normalized)) throw new TypeError(`duplicate unit image display name ${display_name}`);
      displayNames.add(normalized);
    }

    const ids = array(item.entry_ids, `${context}.entry_ids`).map((id, idIndex) => entryID(id, `${context}.entry_ids[${idIndex}]`));
    if (ids.length === 0) throw new TypeError(`${context}.entry_ids must not be empty`);
    const entry_ids = [...new Set(ids)].sort((left, right) => left - right);
    if (entry_ids.length !== ids.length) throw new TypeError(`${context}.entry_ids contains duplicates`);
    for (const id of entry_ids) {
      const existing = assignedEntries.get(id);
      if (existing) throw new TypeError(`entry ID ${id} is assigned to both ${existing} and ${name}`);
      assignedEntries.set(id, name);
    }

    const rawImages = record(item.images, `${context}.images`);
    const images: Record<string, string> = {};
    for (const [label, rawPath] of Object.entries(rawImages)) {
      if (!/^[a-z][a-z0-9_-]*$/.test(label)) throw new TypeError(`${context}.images has invalid label ${JSON.stringify(label)}`);
      const path = string(rawPath, `${context}.images.${label}`);
      if (!isUnitImageAssetPath(path)) throw new TypeError(`${context}.images.${label} must be a clean unit-images image path`);
      if (paths.has(path)) throw new TypeError(`duplicate unit image path ${path}`);
      paths.add(path);
      images[label] = path;
    }
    if (Object.keys(images).length === 0) throw new TypeError(`${context}.images must not be empty`);
    return { name, ...(display_name === undefined ? {} : { display_name }), entry_ids, images };
  });

  units.sort((left, right) => left.name.localeCompare(right.name));
  return { format: UNIT_IMAGE_MANIFEST_FORMAT, units };
}

export function emptyUnitImageManifest(): UnitImageManifest {
  return { format: UNIT_IMAGE_MANIFEST_FORMAT, units: [] };
}
