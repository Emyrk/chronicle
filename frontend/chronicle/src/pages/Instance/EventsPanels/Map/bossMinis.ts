import { ICON_CDN } from "@/config/iconUrl";

/** Shared tabletop miniatures and original game models, published in the root-level registry. */
export const MINIATURE_MANIFEST_FORMAT = "chronicle-unit-miniatures-v1";

export const MIN_MAP_SCALE = 0.1;
export const MAX_MAP_SCALE = 10;

export interface UnitModelDefinition {
  name: string;
  path: string;
  entry_ids: number[];
  map_scale: number;
  /** Client-derived standing height in world yards, keyed by creature entry ID. */
  world_heights?: Readonly<Record<number, number>>;
}

export interface MiniatureManifest {
  format: typeof MINIATURE_MANIFEST_FORMAT;
  miniatures: UnitModelDefinition[];
  game_models: UnitModelDefinition[];
}

export interface PublishedUnitModel {
  url: string;
  mapScale: number;
  /** Client-derived standing height in world yards. */
  worldHeight?: number;
}

export interface PublishedUnitModelUrls {
  miniatures: ReadonlyMap<number, PublishedUnitModel>;
  gameModels: ReadonlyMap<number, PublishedUnitModel>;
}

export interface ReplayModelSelection extends PublishedUnitModel {
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

function parseWorldHeights(value: unknown, entries: readonly number[], label: string): Readonly<Record<number, number>> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} world heights must be an object`);
  const assigned = new Set(entries);
  const heights: Record<number, number> = {};
  for (const [rawEntry, rawHeight] of Object.entries(value)) {
    const entry = Number(rawEntry);
    if (!Number.isSafeInteger(entry) || !assigned.has(entry)) throw new Error(`${label} has a world height for unassigned entry ID ${rawEntry}`);
    if (typeof rawHeight !== "number" || !Number.isFinite(rawHeight) || rawHeight < 0.1 || rawHeight > 100) {
      throw new Error(`${label} entry ${entry} has an invalid world height`);
    }
    heights[entry] = rawHeight;
  }
  return heights;
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
    const map_scale = item.map_scale === undefined ? 1 : item.map_scale;
    if (!name) throw new Error(`${label} ${index} has no name`);
    if (!/^miniatures\/[^/\\]+\.glb$/.test(path)) throw new Error(`${label} ${index} has an invalid path`);
    if (typeof map_scale !== "number" || !Number.isFinite(map_scale) || map_scale < MIN_MAP_SCALE || map_scale > MAX_MAP_SCALE) {
      throw new Error(`${label} ${index} has an invalid map scale`);
    }
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
    const world_heights = parseWorldHeights(item.world_heights, entry_ids, `${label} ${index}`);
    return { name, path, entry_ids, map_scale, ...(world_heights === undefined ? {} : { world_heights }) };
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

function modelCollectionUrls(models: UnitModelDefinition[], baseUrl: string): ReadonlyMap<number, PublishedUnitModel> {
  return new Map(models.flatMap((model) =>
    model.entry_ids.map((entry) => [entry, {
      url: miniatureAssetUrl(model.path, baseUrl),
      mapScale: model.map_scale,
      ...(model.world_heights?.[entry] === undefined ? {} : { worldHeight: model.world_heights[entry] }),
    }] as const),
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
  const models = (await fetchUnitModelUrls(baseUrl)).miniatures;
  return new Map([...models].map(([entry, model]) => [entry, model.url]));
}

export async function fetchGameModelUrls(baseUrl = ICON_CDN): Promise<ReadonlyMap<number, string>> {
  const models = (await fetchUnitModelUrls(baseUrl)).gameModels;
  return new Map([...models].map(([entry, model]) => [entry, model.url]));
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
  if (gameModelsOnly) return gameModel ? { ...gameModel, kind: "game" } : undefined;
  const miniature = published.miniatures.get(entry);
  if (miniature) return { ...miniature, kind: "miniature" };
  return gameModel ? { ...gameModel, kind: "game" } : undefined;
}
