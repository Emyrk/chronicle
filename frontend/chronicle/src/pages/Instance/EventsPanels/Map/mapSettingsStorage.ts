/** The Map panel's saved choices (local storage): the 3D map, the 2D artwork, A/D strafe and the frames. */

import { DEFAULT_AD_STRAFE } from "./mapControls";
import type { ReplayMapSource } from "./mapModel";

export const MESH_STORAGE_KEY = "chronicle.map.mesh";
export const MAP_SOURCE_STORAGE_KEY = "chronicle.map.source2d";

export function readStoredMapSource(): ReplayMapSource {
  try {
    const stored = localStorage.getItem(MAP_SOURCE_STORAGE_KEY);
    return stored === "renders" || stored === "art" ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function storeMapSource(source: ReplayMapSource) {
  try {
    if (source === "auto") localStorage.removeItem(MAP_SOURCE_STORAGE_KEY);
    else localStorage.setItem(MAP_SOURCE_STORAGE_KEY, source);
  } catch {
    // Storage may be unavailable; the choice still applies for this session.
  }
}

export function readStoredMesh(): boolean | null {
  try {
    const stored = localStorage.getItem(MESH_STORAGE_KEY);
    return stored === null ? null : stored === "true";
  } catch {
    return null;
  }
}

export const RAID_FRAMES_STORAGE_KEY = "chronicle.map.raidFrames";
export const ENEMY_FRAMES_STORAGE_KEY = "chronicle.map.enemyFrames";

// A/D strafe is optional; the default keeps A/D turning.
export const AD_STRAFE_STORAGE_KEY = "chronicle.map.adStrafe";

export function readStoredAdStrafe(): boolean {
  try {
    const stored = localStorage.getItem(AD_STRAFE_STORAGE_KEY);
    return stored === null ? DEFAULT_AD_STRAFE : stored === "strafe";
  } catch {
    return DEFAULT_AD_STRAFE;
  }
}

export function storeAdStrafe(on: boolean) {
  try {
    localStorage.setItem(AD_STRAFE_STORAGE_KEY, on ? "strafe" : "turn");
  } catch {
    // Storage may be unavailable; the choice still applies for this session.
  }
}

export function readStoredShown(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "hidden";
  } catch {
    return true;
  }
}

export function storeShown(key: string, shown: boolean) {
  try {
    localStorage.setItem(key, shown ? "shown" : "hidden");
  } catch {
    // Storage may be unavailable; the choice still applies for this session.
  }
}

// null forgets the choice, so the default (preferredMeshState) applies again.
export function storeMesh(on: boolean | null) {
  try {
    if (on === null) localStorage.removeItem(MESH_STORAGE_KEY);
    else localStorage.setItem(MESH_STORAGE_KEY, String(on));
  } catch {
    // Storage may be unavailable (private mode); the toggle still works for this session.
  }
}
