import { ICON_CDN } from "@/config/iconUrl";

/**
 * Shared unit miniatures for the 3D Replay Map. Published models from the
 * root-level registry take priority; the bundled Wailing Caverns models remain
 * a fallback while deployments populate that registry.
 */
export const MINIATURE_MANIFEST_FORMAT = "chronicle-unit-miniatures-v1";
export const BOSS_MINIS_BASE_URL = `${import.meta.env.BASE_URL}boss-minis`;

export interface MiniatureManifest {
  format: typeof MINIATURE_MANIFEST_FORMAT;
  miniatures: {
    name: string;
    path: string;
    entry_ids: number[];
  }[];
}

/** NPC entry -> bundled model file name. */
export const BOSS_MINI_SLUGS: ReadonlyMap<number, string> = new Map([
  [3671, "lady-anacondra"],
  [3670, "lord-pythas"],
  [3669, "lord-cobrahn"],
  [3653, "kresh"],
  [3674, "skum"],
  [3673, "lord-serpentis"],
  [5775, "verdan-the-everliving"],
  [3654, "mutanus-the-devourer"],
  [5912, "deviate-faerie-dragon"],
]);

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function miniatureManifestUrl(baseUrl = ICON_CDN): string {
  return `${stripTrailingSlash(baseUrl)}/miniatures/manifest.json`;
}

export function miniatureAssetUrl(path: string, baseUrl = ICON_CDN): string {
  return `${stripTrailingSlash(baseUrl)}/${path.replace(/^\/+/, "")}`;
}

export function parseMiniatureManifest(value: unknown): MiniatureManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Miniature manifest must be an object");
  const input = value as Record<string, unknown>;
  if (input.format !== MINIATURE_MANIFEST_FORMAT) throw new Error(`Unsupported miniature manifest format: ${String(input.format || "missing")}`);
  if (!Array.isArray(input.miniatures)) throw new Error("Miniature manifest entries must be an array");
  const assigned = new Set<number>();
  const paths = new Set<string>();
  const miniatures = input.miniatures.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Miniature ${index} must be an object`);
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const path = typeof item.path === "string" ? item.path : "";
    if (!name) throw new Error(`Miniature ${index} has no name`);
    if (!/^miniatures\/[^/\\]+\.glb$/.test(path)) throw new Error(`Miniature ${index} has an invalid path`);
    if (paths.has(path)) throw new Error(`Duplicate miniature path: ${path}`);
    paths.add(path);
    if (!Array.isArray(item.entry_ids) || item.entry_ids.length === 0) throw new Error(`Miniature ${index} has no entry IDs`);
    const entry_ids = item.entry_ids.map((entry) => {
      if (!Number.isSafeInteger(entry) || (entry as number) <= 0 || (entry as number) > 0xffff_ffff) {
        throw new Error(`Miniature ${index} has an invalid entry ID`);
      }
      const id = entry as number;
      if (assigned.has(id)) throw new Error(`Duplicate miniature entry ID: ${id}`);
      assigned.add(id);
      return id;
    });
    return { name, path, entry_ids };
  });
  return { format: MINIATURE_MANIFEST_FORMAT, miniatures };
}

export async function fetchMiniatureUrls(baseUrl = ICON_CDN): Promise<ReadonlyMap<number, string>> {
  const response = await fetch(miniatureManifestUrl(baseUrl));
  if (!response.ok) throw new Error(`Miniature manifest request failed with ${response.status}`);
  const manifest = parseMiniatureManifest(await response.json());
  return new Map(manifest.miniatures.flatMap((miniature) =>
    miniature.entry_ids.map((entry) => [entry, miniatureAssetUrl(miniature.path, baseUrl)] as const),
  ));
}

export function bossMiniSlug(entry: number | undefined): string | undefined {
  return entry === undefined ? undefined : BOSS_MINI_SLUGS.get(entry);
}

export function bossMiniUrl(entry: number | undefined, baseUrl = BOSS_MINIS_BASE_URL): string | undefined {
  const slug = bossMiniSlug(entry);
  return slug ? `${stripTrailingSlash(baseUrl)}/${slug}.glb` : undefined;
}

/** Published model first, bundled compatibility model second. */
export function miniatureUrlCandidates(
  entry: number | undefined,
  published: ReadonlyMap<number, string> | undefined,
  fallbackBaseUrl = BOSS_MINIS_BASE_URL,
): string[] {
  if (entry === undefined) return [];
  const urls = [published?.get(entry), bossMiniUrl(entry, fallbackBaseUrl)].filter((url): url is string => Boolean(url));
  return [...new Set(urls)];
}
