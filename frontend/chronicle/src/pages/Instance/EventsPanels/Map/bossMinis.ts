import { ICON_CDN } from "@/config/iconUrl";

/** Shared tabletop miniatures and original game models, published in the root-level registry. */
export const MINIATURE_MANIFEST_FORMAT = "chronicle-unit-miniatures-v1";

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

export interface PublishedUnitModelUrls {
  miniatures: ReadonlyMap<number, string>;
  gameModels: ReadonlyMap<number, string>;
}

export interface ReplayModelSelection {
  url: string;
  kind: "miniature" | "game";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function miniatureManifestUrl(baseUrl = ICON_CDN): string {
  return `${stripTrailingSlash(baseUrl)}/miniatures/manifest.json`;
}

export function miniatureAssetUrl(path: string, baseUrl = ICON_CDN): string {
  return `${stripTrailingSlash(baseUrl)}/${path.replace(/^\/+/, "")}`;
}

function parseModelCollection(value: unknown, label: string): UnitModelDefinition[] {
  if (!Array.isArray(value)) throw new Error(`${label} entries must be an array`);
  const assigned = new Set<number>();
  const paths = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label} ${index} must be an object`);
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const path = typeof item.path === "string" ? item.path : "";
    if (!name) throw new Error(`${label} ${index} has no name`);
    if (!/^miniatures\/[^/\\]+\.glb$/.test(path)) throw new Error(`${label} ${index} has an invalid path`);
    if (paths.has(path)) throw new Error(`Duplicate ${label.toLowerCase()} path: ${path}`);
    paths.add(path);
    if (!Array.isArray(item.entry_ids) || item.entry_ids.length === 0) throw new Error(`${label} ${index} has no entry IDs`);
    const entry_ids = item.entry_ids.map((entry) => {
      if (!Number.isSafeInteger(entry) || (entry as number) <= 0 || (entry as number) > 0xffff_ffff) {
        throw new Error(`${label} ${index} has an invalid entry ID`);
      }
      const id = entry as number;
      if (assigned.has(id)) throw new Error(`Duplicate ${label.toLowerCase()} entry ID: ${id}`);
      assigned.add(id);
      return id;
    });
    return { name, path, entry_ids };
  });
}

export function parseMiniatureManifest(value: unknown): MiniatureManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Miniature manifest must be an object");
  const input = value as Record<string, unknown>;
  if (input.format !== MINIATURE_MANIFEST_FORMAT) throw new Error(`Unsupported miniature manifest format: ${String(input.format || "missing")}`);
  return {
    format: MINIATURE_MANIFEST_FORMAT,
    miniatures: parseModelCollection(input.miniatures, "Miniature"),
    game_models: parseModelCollection(input.game_models ?? [], "Game model"),
  };
}

export async function fetchMiniatureManifest(baseUrl = ICON_CDN): Promise<MiniatureManifest> {
  const response = await fetch(miniatureManifestUrl(baseUrl));
  if (!response.ok) throw new Error(`Miniature manifest request failed with ${response.status}`);
  return parseMiniatureManifest(await response.json());
}

function modelCollectionUrls(models: UnitModelDefinition[], baseUrl: string): ReadonlyMap<number, string> {
  return new Map(models.flatMap((model) =>
    model.entry_ids.map((entry) => [entry, miniatureAssetUrl(model.path, baseUrl)] as const),
  ));
}

export async function fetchUnitModelUrls(baseUrl = ICON_CDN): Promise<PublishedUnitModelUrls> {
  const manifest = await fetchMiniatureManifest(baseUrl);
  return {
    miniatures: modelCollectionUrls(manifest.miniatures, baseUrl),
    gameModels: modelCollectionUrls(manifest.game_models, baseUrl),
  };
}

export async function fetchMiniatureUrls(baseUrl = ICON_CDN): Promise<ReadonlyMap<number, string>> {
  return (await fetchUnitModelUrls(baseUrl)).miniatures;
}

export async function fetchGameModelUrls(baseUrl = ICON_CDN): Promise<ReadonlyMap<number, string>> {
  return (await fetchUnitModelUrls(baseUrl)).gameModels;
}

export function gameModelUrl(entry: number | undefined, published: ReadonlyMap<number, string> | undefined): string | undefined {
  return entry === undefined ? undefined : published?.get(entry);
}

export function miniatureUrl(entry: number | undefined, published: ReadonlyMap<number, string> | undefined): string | undefined {
  return entry === undefined ? undefined : published?.get(entry);
}

/**
 * Picks the model shown on the replay map. Miniatures win by default, with an
 * original game model as the fallback. Original-model-only mode deliberately
 * leaves units without a published game model on their standard map marker.
 */
export function replayModel(
  entry: number | undefined,
  published: PublishedUnitModelUrls | undefined,
  gameModelsOnly: boolean,
): ReplayModelSelection | undefined {
  if (entry === undefined || !published) return undefined;
  const gameModel = published.gameModels.get(entry);
  if (gameModelsOnly) return gameModel ? { url: gameModel, kind: "game" } : undefined;
  const miniature = published.miniatures.get(entry);
  if (miniature) return { url: miniature, kind: "miniature" };
  return gameModel ? { url: gameModel, kind: "game" } : undefined;
}
