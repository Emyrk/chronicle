import { ICON_CDN } from "./iconUrl";

export const UNIT_IMAGE_MANIFEST_FORMAT = "chronicle-unit-images-v1";

export interface UnitImageSet {
  name: string;
  display_name?: string;
  entry_ids: number[];
  images: Record<string, string>;
  models?: Record<string, string>;
}

export interface UnitImageManifest {
  format: typeof UNIT_IMAGE_MANIFEST_FORMAT;
  units: UnitImageSet[];
}

export type UnitImageLookup = ReadonlyMap<number, UnitImageSet>;
export type UnitImageNameLookup = ReadonlyMap<string, UnitImageSet>;

export function normalizeUnitImageName(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function unitImageManifestUrl(baseUrl = ICON_CDN): string {
  return `${stripTrailingSlash(baseUrl)}/unit-images/manifest.json`;
}

export function unitImageAssetUrl(path: string, baseUrl = ICON_CDN): string {
  return `${stripTrailingSlash(baseUrl)}/${path.replace(/^\/+/, "")}`;
}

export function parseUnitImageManifest(value: unknown): UnitImageManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unit image manifest must be an object");
  const input = value as Record<string, unknown>;
  if (input.format !== UNIT_IMAGE_MANIFEST_FORMAT) throw new Error(`Unsupported unit image manifest format: ${String(input.format || "missing")}`);
  if (!Array.isArray(input.units)) throw new Error("Unit image manifest entries must be an array");

  const assigned = new Set<number>();
  const paths = new Set<string>();
  const names = new Set<string>();
  const displayNames = new Set<string>();
  const units = input.units.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Unit image set ${index} must be an object`);
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) throw new Error(`Unit image set ${index} has no name`);
    if (names.has(name)) throw new Error(`Duplicate unit image set name: ${name}`);
    names.add(name);

    let display_name: string | undefined;
    if (item.display_name !== undefined) {
      display_name = typeof item.display_name === "string" ? item.display_name.trim() : "";
      if (!display_name) throw new Error(`Unit image set ${index} has an invalid display name`);
      const normalized = normalizeUnitImageName(display_name);
      if (displayNames.has(normalized)) throw new Error(`Duplicate unit image display name: ${display_name}`);
      displayNames.add(normalized);
    }

    if (!Array.isArray(item.entry_ids) || item.entry_ids.length === 0) throw new Error(`Unit image set ${index} has no entry IDs`);
    const entry_ids = item.entry_ids.map((entry) => {
      if (!Number.isSafeInteger(entry) || (entry as number) <= 0 || (entry as number) > 0xffff_ffff) {
        throw new Error(`Unit image set ${index} has an invalid entry ID`);
      }
      const id = entry as number;
      if (assigned.has(id)) throw new Error(`Duplicate unit image entry ID: ${id}`);
      assigned.add(id);
      return id;
    });

    if (!item.images || typeof item.images !== "object" || Array.isArray(item.images)) {
      throw new Error(`Unit image set ${index} must have labeled images`);
    }
    const images = Object.fromEntries(Object.entries(item.images as Record<string, unknown>).map(([label, rawPath]) => {
      if (!/^[a-z][a-z0-9_-]*$/.test(label)) throw new Error(`Unit image set ${index} has an invalid label: ${label}`);
      if (typeof rawPath !== "string" || !/^unit-images\/[^/\\]+\.(?:avif|jpe?g|png|webp)$/.test(rawPath)) {
        throw new Error(`Unit image set ${index} has an invalid path for ${label}`);
      }
      if (paths.has(rawPath)) throw new Error(`Duplicate unit image path: ${rawPath}`);
      paths.add(rawPath);
      return [label, rawPath];
    }));
    if (Object.keys(images).length === 0) throw new Error(`Unit image set ${index} has no images`);

    let models: Record<string, string> | undefined;
    if (item.models !== undefined) {
      if (!item.models || typeof item.models !== "object" || Array.isArray(item.models)) {
        throw new Error(`Unit image set ${index} must have labeled models`);
      }
      models = Object.fromEntries(Object.entries(item.models as Record<string, unknown>).map(([label, rawPath]) => {
        if (!/^[a-z][a-z0-9_-]*$/.test(label)) throw new Error(`Unit image set ${index} has an invalid model label: ${label}`);
        if (typeof rawPath !== "string" || !/^unit-images\/[^/\\]+\.glb$/.test(rawPath)) {
          throw new Error(`Unit image set ${index} has an invalid model path for ${label}`);
        }
        return [label, rawPath];
      }));
      if (Object.keys(models).length === 0) throw new Error(`Unit image set ${index} has no models`);
    }

    return { name, ...(display_name === undefined ? {} : { display_name }), entry_ids, images, ...(models === undefined ? {} : { models }) };
  });

  return { format: UNIT_IMAGE_MANIFEST_FORMAT, units };
}

export async function fetchUnitImageManifest(baseUrl = ICON_CDN): Promise<UnitImageManifest> {
  const response = await fetch(`${unitImageManifestUrl(baseUrl)}?format=${UNIT_IMAGE_MANIFEST_FORMAT}`);
  if (!response.ok) throw new Error(`Unit image manifest request failed with ${response.status}`);
  return parseUnitImageManifest(await response.json());
}

export async function fetchUnitImageLookup(baseUrl = ICON_CDN): Promise<UnitImageLookup> {
  const manifest = await fetchUnitImageManifest(baseUrl);
  return new Map(manifest.units.flatMap((unit) => unit.entry_ids.map((entry) => [entry, unit] as const)));
}

export async function fetchUnitImageNameLookup(baseUrl = ICON_CDN): Promise<UnitImageNameLookup> {
  const manifest = await fetchUnitImageManifest(baseUrl);
  return new Map(manifest.units.flatMap((unit) => (
    unit.display_name === undefined ? [] : [[normalizeUnitImageName(unit.display_name), unit] as const]
  )));
}

export function unitImageUrlByName(
  displayName: string | undefined,
  label: string,
  published: UnitImageNameLookup | undefined,
  baseUrl = ICON_CDN,
): string | undefined {
  const path = displayName === undefined ? undefined : published?.get(normalizeUnitImageName(displayName))?.images[label];
  return path === undefined ? undefined : unitImageAssetUrl(path, baseUrl);
}

export function unitImageModelUrl(
  entry: number | undefined,
  label: string,
  published: UnitImageLookup | undefined,
  baseUrl = ICON_CDN,
): string | undefined {
  const path = entry === undefined ? undefined : published?.get(entry)?.models?.[label];
  return path === undefined ? undefined : unitImageAssetUrl(path, baseUrl);
}

export function unitImageUrl(
  entry: number | undefined,
  label: string,
  published: UnitImageLookup | undefined,
  baseUrl = ICON_CDN,
): string | undefined {
  const path = entry === undefined ? undefined : published?.get(entry)?.images[label];
  return path === undefined ? undefined : unitImageAssetUrl(path, baseUrl);
}
