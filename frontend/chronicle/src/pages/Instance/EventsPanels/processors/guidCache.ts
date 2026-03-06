/**
 * GUID caching utilities for processor optimization.
 * 
 * GUID.fromString() is expensive (regex validation, BigInt parsing, object allocation).
 * For a typical raid with ~25 players + ~50 NPCs, caching reduces parsing from
 * millions of times to ~75 times.
 */

import { GUID } from "@/lib/guid/guid";

export type GuidCache = Map<string, GUID>;

/**
 * Create a new GUID cache.
 */
export function createGuidCache(): GuidCache {
  return new Map<string, GUID>();
}

/**
 * Get a GUID from cache, parsing and caching if not present.
 */
export function getCachedGuid(cache: GuidCache, guidStr: string): GUID {
  let cached = cache.get(guidStr);
  if (!cached) {
    cached = GUID.fromString(guidStr);
    cache.set(guidStr, cached);
  }
  return cached;
}

/**
 * Quick check if a GUID string represents a player without full parsing.
 * Players have high bits = 0x0000, so they start with "0x0000".
 * This avoids BigInt parsing for the common case of filtering non-players.
 */
export function isPlayerGuidFast(guidStr: string): boolean {
  // Player GUIDs: high 16 bits have form 0x00X0 where X & 0xF0 == 0x00
  // They start with "0x0000" for the simplest check
  return guidStr.startsWith("0x0000");
}

/**
 * Quick check if a GUID string represents a pet without full parsing.
 * Pets have high bits where (high & 0x00f0) === 0x0040.
 * This means the 5th character (index 4) should be '4'.
 */
export function isPetGuidFast(guidStr: string): boolean {
  // Pet GUIDs: high 16 bits have form 0x00X0 where X & 0xF0 == 0x40
  // Check the 5th character is '4' (e.g., "0x0040...")
  return guidStr.length >= 5 && guidStr[4] === '4';
}

/**
 * Quick check if a GUID string represents a player or pet without full parsing.
 */
export function isPlayerOrPetGuidFast(guidStr: string): boolean {
  return isPlayerGuidFast(guidStr) || isPetGuidFast(guidStr);
}

/**
 * Quick check if a GUID string represents a game object without full parsing.
 * Object GUIDs: high 16 bits have form 0x00X0 where X & 0xF0 == 0x10
 * e.g., "0xF110..." for explosive traps.
 */
export function isObjectGuidFast(guidStr: string): boolean {
  return guidStr.length >= 6 && guidStr[4] === '1' && guidStr[5] === '1';
}

