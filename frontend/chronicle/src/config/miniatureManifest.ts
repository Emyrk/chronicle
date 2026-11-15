/**
 * The shared creature-model registry (`miniatures/manifest.json` on the root
 * icon CDN): tabletop miniatures and original game models, each assigned to
 * creature entry IDs. One parser on the viewer side, in the map manifest's
 * style: an invalid model is dropped on its own, with a reason, and the rest
 * still load. (The Foundry keeps its own copy in frontend/telemetry; it should
 * be tested against the same fixture, miniatureManifest.fixture.json.)
 */

import type { ManifestProblem } from "./mapManifest";

export const MINIATURE_MANIFEST_FORMAT = "chronicle-unit-miniatures-v1";

export const MIN_MAP_SCALE = 0.1;
export const MAX_MAP_SCALE = 10;

export interface UnitModelDefinition {
  name: string;
  /** Skinned base GLB. Original game models retain their skeleton and Stand clip. */
  path: string;
  /** Optional meshless GLB containing clips for lazy loading against the base skeleton. */
  animation_path?: string;
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

export interface ParsedMiniatureManifest {
  manifest: MiniatureManifest;
  /** Models dropped from the manifest, each with its reason. */
  problems: ManifestProblem[];
}

const MODEL_PATH = /^miniatures\/[^/\\]+\.glb$/;

function parseWorldHeights(value: unknown, entries: readonly number[], label: string): Readonly<Record<number, number>> | string | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return `${label} world heights must be an object`;
  const assigned = new Set(entries);
  const heights: Record<number, number> = {};
  for (const [rawEntry, rawHeight] of Object.entries(value)) {
    const entry = Number(rawEntry);
    if (!Number.isSafeInteger(entry) || !assigned.has(entry)) return `${label} has a world height for unassigned entry ID ${rawEntry}`;
    if (typeof rawHeight !== "number" || !Number.isFinite(rawHeight) || rawHeight < 0.1 || rawHeight > 100) {
      return `${label} entry ${entry} has an invalid world height`;
    }
    heights[entry] = rawHeight;
  }
  return heights;
}

/**
 * One collection (miniatures or game models). A model is dropped with its
 * reason when it is malformed, or when its path or an entry ID repeats one an
 * earlier model already claimed (the earlier one wins).
 */
function parseModelCollection(value: unknown, label: string, problems: ManifestProblem[]): UnitModelDefinition[] {
  const collection = label === "Miniature" ? "miniatures" : "game_models";
  if (!Array.isArray(value)) {
    problems.push({ path: collection, reason: `${label} entries must be an array` });
    return [];
  }
  const assigned = new Set<number>();
  const paths = new Set<string>();
  return value.flatMap((raw, index): UnitModelDefinition[] => {
    const drop = (reason: string) => {
      const name = raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).name === "string" ? ` "${(raw as Record<string, unknown>).name as string}"` : "";
      problems.push({ path: `${collection}[${index}]${name}`, reason });
      return [];
    };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return drop(`${label} ${index} must be an object`);
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const path = typeof item.path === "string" ? item.path : "";
    const animation_path = item.animation_path === undefined ? undefined : item.animation_path;
    const map_scale = item.map_scale === undefined ? 1 : item.map_scale;
    if (!name) return drop(`${label} ${index} has no name`);
    if (!MODEL_PATH.test(path)) return drop(`${label} ${index} has an invalid path`);
    if (animation_path !== undefined && (typeof animation_path !== "string" || !MODEL_PATH.test(animation_path))) {
      return drop(`${label} ${index} has an invalid animation path`);
    }
    if (typeof map_scale !== "number" || !Number.isFinite(map_scale) || map_scale < MIN_MAP_SCALE || map_scale > MAX_MAP_SCALE) {
      return drop(`${label} ${index} has an invalid map scale`);
    }
    if (paths.has(path)) return drop(`Duplicate ${label.toLowerCase()} path: ${path}`);
    if (animation_path !== undefined && (paths.has(animation_path) || animation_path === path)) {
      return drop(`Duplicate ${label.toLowerCase()} path: ${animation_path}`);
    }
    if (!Array.isArray(item.entry_ids) || item.entry_ids.length === 0) return drop(`${label} ${index} has no entry IDs`);
    const entry_ids: number[] = [];
    for (const entry of item.entry_ids) {
      if (!Number.isSafeInteger(entry) || (entry as number) <= 0 || (entry as number) > 0xffff_ffff) return drop(`${label} ${index} has an invalid entry ID`);
      if (assigned.has(entry as number) || entry_ids.includes(entry as number)) return drop(`Duplicate ${label.toLowerCase()} entry ID: ${entry as number}`);
      entry_ids.push(entry as number);
    }
    const world_heights = parseWorldHeights(item.world_heights, entry_ids, `${label} ${index}`);
    if (typeof world_heights === "string") return drop(world_heights);
    // Claimed only once the whole model is valid, so a dropped model never blocks a later one.
    paths.add(path);
    if (animation_path !== undefined) paths.add(animation_path);
    for (const entry of entry_ids) assigned.add(entry);
    return [{
      name,
      path,
      ...(animation_path === undefined ? {} : { animation_path }),
      entry_ids,
      map_scale,
      ...(world_heights === undefined ? {} : { world_heights }),
    }];
  });
}

/**
 * Checks a fetched model registry. Throws only when the whole manifest is
 * unusable (not an object, an unsupported format); invalid or conflicting
 * models are dropped on their own and listed in `problems`.
 */
export function parseMiniatureManifestReport(value: unknown): ParsedMiniatureManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Miniature manifest must be an object");
  const input = value as Record<string, unknown>;
  if (input.format !== MINIATURE_MANIFEST_FORMAT) throw new Error(`Unsupported miniature manifest format: ${String(input.format || "missing")}`);
  const problems: ManifestProblem[] = [];
  const manifest: MiniatureManifest = {
    format: MINIATURE_MANIFEST_FORMAT,
    miniatures: parseModelCollection(input.miniatures, "Miniature", problems),
    game_models: parseModelCollection(input.game_models ?? [], "Game model", problems),
  };
  return { manifest, problems };
}

/** The strict form (publishing checks, tests): any problem rejects the manifest with its reason. */
export function parseMiniatureManifest(value: unknown): MiniatureManifest {
  const { manifest, problems } = parseMiniatureManifestReport(value);
  if (problems.length > 0) throw new Error(problems[0].reason);
  return manifest;
}
