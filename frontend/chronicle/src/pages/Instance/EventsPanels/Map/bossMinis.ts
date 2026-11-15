import { ICON_CDN } from "@/config/iconUrl";

import {
  parseMiniatureManifestReport,
  type MiniatureManifest,
  type ParsedMiniatureManifest,
  type UnitModelDefinition,
} from "@/config/miniatureManifest";

// The registry's types and parser live in src/config/miniatureManifest.ts; re-exported for existing callers.
export {
  MAX_MAP_SCALE,
  MIN_MAP_SCALE,
  MINIATURE_MANIFEST_FORMAT,
  parseMiniatureManifest,
  parseMiniatureManifestReport,
  type MiniatureManifest,
  type ParsedMiniatureManifest,
  type UnitModelDefinition,
} from "@/config/miniatureManifest";

export interface PublishedUnitModel {
  url: string;
  /** Lazy animation-pack URL for original game models. */
  animationUrl?: string;
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

/** The model registry and the models dropped from it (each also logged as a console warning). */
export async function fetchMiniatureManifestReport(baseUrl = ICON_CDN): Promise<ParsedMiniatureManifest> {
  const response = await fetch(miniatureManifestUrl(baseUrl));
  if (!response.ok) throw new Error(`Miniature manifest request failed with ${response.status}`);
  const parsed = parseMiniatureManifestReport(await response.json());
  for (const problem of parsed.problems) console.warn(`Miniature manifest: dropped ${problem.path}: ${problem.reason}`);
  return parsed;
}

/** The model registry, with invalid or conflicting models dropped (each logged as a console warning). */
export async function fetchMiniatureManifest(baseUrl = ICON_CDN): Promise<MiniatureManifest> {
  return (await fetchMiniatureManifestReport(baseUrl)).manifest;
}

function modelCollectionUrls(models: UnitModelDefinition[], baseUrl: string): ReadonlyMap<number, PublishedUnitModel> {
  return new Map(models.flatMap((model) =>
    model.entry_ids.map((entry) => [entry, {
      url: miniatureAssetUrl(model.path, baseUrl),
      ...(model.animation_path === undefined ? {} : { animationUrl: miniatureAssetUrl(model.animation_path, baseUrl) }),
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
