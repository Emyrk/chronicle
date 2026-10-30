import { ICON_CDN } from "./iconUrl";

export const UNIT_IMAGE_MANIFEST_FORMAT = "chronicle-unit-images-v1";

export interface UnitImageSet {
  name: string;
  entry_ids: number[];
  images: Record<string, string>;
}

export interface UnitImageManifest {
  format: typeof UNIT_IMAGE_MANIFEST_FORMAT;
  units: UnitImageSet[];
}

export type UnitImageLookup = ReadonlyMap<number, UnitImageSet>;

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
  const units = input.units.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Unit image set ${index} must be an object`);
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) throw new Error(`Unit image set ${index} has no name`);
    if (names.has(name)) throw new Error(`Duplicate unit image set name: ${name}`);
    names.add(name);

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

    return { name, entry_ids, images };
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

export function unitImageUrl(
  entry: number | undefined,
  label: string,
  published: UnitImageLookup | undefined,
  baseUrl = ICON_CDN,
): string | undefined {
  const path = entry === undefined ? undefined : published?.get(entry)?.images[label];
  return path === undefined ? undefined : unitImageAssetUrl(path, baseUrl);
}
