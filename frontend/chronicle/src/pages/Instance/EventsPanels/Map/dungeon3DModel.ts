/**
 * What the replay map tells a player about the 3D dungeon (pure, tested):
 * which state it is in, what shows on the map, and what the Walk, Plan and
 * settings controls say. Copy is plain: no internal words (the "mesh" is "the
 * 3D dungeon" or "the 3D map"; the tiles are "the flat map").
 */

import type { DungeonMeshState } from "./MapScene3D";

/**
 * - `no-webgl`: this browser cannot show 3D (the 2D map shows; handled elsewhere).
 * - `no-3d-map`: this dungeon has no 3D map published.
 * - `off`: the player turned the 3D map off.
 * - `loading`, `ready`, `failed`: the 3D dungeon's load.
 */
export type Dungeon3DStatus = "no-webgl" | "no-3d-map" | "off" | "loading" | "ready" | "failed";

export function dungeon3DStatus(input: { show3D: boolean; hasMesh: boolean; meshWanted: boolean; meshState: DungeonMeshState }): Dungeon3DStatus {
  if (!input.show3D) return "no-webgl";
  if (!input.hasMesh) return "no-3d-map";
  if (!input.meshWanted) return "off";
  return input.meshState;
}

/** Every user-facing string this module adds. */
export const DUNGEON_3D_COPY = {
  notice: "The 3D dungeon didn't load. Showing the flat map.",
  retry: "Retry",
  dismiss: "Dismiss",
  coverLoading: "Loading the 3D dungeon…",
  coverFailed: "The 3D dungeon didn't load.",
  coverFailedDetail: "This dungeon has no flat map to show instead.",
  walkFailed: "Walk mode: the 3D dungeon didn't load",
  walkNoMap: "Walk mode: this dungeon has no 3D map yet",
  planLoading: "Plan: waiting for the 3D map to load",
  planFailed: "Plan: the 3D dungeon didn't load",
  planNoMap: "Plan: this dungeon has no 3D map yet",
  settingsFailed: "The 3D dungeon didn't load. Showing the flat map.",
  settingsFailedOnly: "The 3D dungeon didn't load.",
} as const;

// Unchanged strings, kept here so the tooltips stay in one place.
const WALK_WAITING = "Walk mode: waiting for the 3D map to load";
const WALK_NO_SCALE = "Walk mode unavailable: this map has no world scale";
const PLAN_NEEDS_3D = "Planning needs the 3D map (Map settings → World → 3D map)";

/**
 * What shows over the map. A failed load on a dungeon with a flat map: a
 * small, dismissible notice (the flat map shows). On a dungeon with only a 3D
 * map, a cover instead of units on an empty ground: loading, or failed with a
 * Retry. A new failure (after a Retry) shows the notice again.
 */
export function dungeon3DOverlay(status: Dungeon3DStatus, input: { meshOnly: boolean; failures: number; dismissedAt: number }): { notice: boolean; cover: "loading" | "failed" | null } {
  if (input.meshOnly && (status === "loading" || status === "failed")) return { notice: false, cover: status };
  return { notice: status === "failed" && input.dismissedAt !== input.failures, cover: null };
}

/** Walk's tooltip while it cannot be used. */
export function walkUnavailableTitle(status: Dungeon3DStatus, meshWanted: boolean): string {
  if (status === "no-3d-map") return DUNGEON_3D_COPY.walkNoMap;
  if (status === "failed") return DUNGEON_3D_COPY.walkFailed;
  return meshWanted ? WALK_WAITING : WALK_NO_SCALE;
}

/** Plan's tooltip while it cannot be used. */
export function planUnavailableTitle(status: Dungeon3DStatus): string {
  if (status === "no-3d-map") return DUNGEON_3D_COPY.planNoMap;
  if (status === "failed") return DUNGEON_3D_COPY.planFailed;
  if (status === "loading") return DUNGEON_3D_COPY.planLoading;
  return PLAN_NEEDS_3D;
}

/**
 * Retry only after a failed load: re-issuing the request then fetches the
 * dungeon again (a failed download or parse is not cached). Never while it
 * loads or once it is up, so a good cached dungeon is never reloaded, and
 * only when the player asks, so it cannot loop.
 */
export function canRetryDungeon(status: Dungeon3DStatus): boolean {
  return status === "failed";
}
