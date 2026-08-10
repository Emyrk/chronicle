/**
 * Temporal unit ownership state for processors.
 *
 * Ingests unit_classification events in timestamp order and tracks
 * possession/charm so that resolveEntity and filter predicates see the
 * correct owner at any point during event processing.
 *
 * Also centralises the GuidCache and isPlayer cache so every processor
 * and filter shares one set of lookups.
 *
 * Pure TypeScript, worker-safe. No React.
 */

import {
  type GuidCache,
  createGuidCache,
  getCachedGuid,
  isPlayerGuidFast,
} from "./guidCache";
import type {
  ProcessorUnit,
  ProcessorVehicleControlInterval,
  UnitClassificationProcessorEvent,
} from "../processorTypes";

const MAX_OWNER_DEPTH = 5;

export class UnitState {
  private guidCache: GuidCache;
  /** Static unit data from server */
  private units: Record<string, ProcessorUnit>;
  /** Permanent owners observed from inline classification events. */
  private classificationOwners: Map<string, string>;
  /** Temporal controller overrides from inline possession events. */
  private controllers: Map<string, { controller: string; spellId: number }>;
  /** Vehicle controller intervals grouped by vehicle GUID. */
  private vehicleIntervals: Map<string, ProcessorVehicleControlInterval[]>;
  /** Absolute timestamp of the event currently being processed. */
  private currentTimestampMs: number | null;
  /** Per-event cache of active vehicle controllers. */
  private vehicleOwnerCache: Map<string, string | null>;
  /** Cache: GUID → isPlayer result */
  private playerCache: Map<string, boolean>;

  constructor(
    units: Record<string, ProcessorUnit>,
    vehicleIntervals: ProcessorVehicleControlInterval[] = [],
  ) {
    this.guidCache = createGuidCache();
    this.units = units;
    this.classificationOwners = new Map();
    this.controllers = new Map();
    this.vehicleIntervals = new Map();
    for (const interval of vehicleIntervals) {
      const existing = this.vehicleIntervals.get(interval.vehicleGuid) ?? [];
      existing.push(interval);
      this.vehicleIntervals.set(interval.vehicleGuid, existing);
    }
    for (const intervals of this.vehicleIntervals.values()) {
      intervals.sort((a, b) => a.assignedAtMs - b.assignedAtMs);
    }
    this.currentTimestampMs = null;
    this.vehicleOwnerCache = new Map();
    this.playerCache = new Map();
  }

  /** Feed a unit_classification event to update ownership and temporal state. */
  processClassification(event: UnitClassificationProcessorEvent): void {
    if (event.owner) {
      this.classificationOwners.set(event.target, event.owner);
    } else {
      this.classificationOwners.delete(event.target);
    }

    if (event.controller) {
      this.controllers.set(event.target, {
        controller: event.controller,
        spellId: event.spellId,
      });
    } else {
      this.controllers.delete(event.target);
    }
  }

  /** Set the absolute timestamp used to resolve static vehicle intervals. */
  setCurrentTimestamp(timestampMs: number): void {
    if (this.currentTimestampMs === timestampMs) return;
    this.currentTimestampMs = timestampMs;
    this.vehicleOwnerCache.clear();
  }

  /**
   * Get the effective root owner for a GUID.
   * Inline possession takes priority, followed by active vehicle control, then static ownership.
   */
  getOwner(guid: string): string | null {
    const firstOwner = this.getDirectOwner(guid);
    if (firstOwner === null || firstOwner === guid) return null;

    // The normal case is a unit directly owned by a player. Keep it allocation
    // and loop free: one extra lookup proves the first owner is already root.
    const secondOwner = this.getDirectOwner(firstOwner);
    if (secondOwner === null) return firstOwner;
    if (secondOwner === guid || secondOwner === firstOwner) return null;

    // Chained summons are rare. Resolve at most five ownership edges and stop
    // immediately if corrupt data repeats a GUID.
    let owner = secondOwner;
    const seen = new Set([guid, firstOwner]);
    for (let depth = 2; depth < MAX_OWNER_DEPTH; depth++) {
      if (seen.has(owner)) return null;
      seen.add(owner);

      const nextOwner = this.getDirectOwner(owner);
      if (nextOwner === null) return owner;
      owner = nextOwner;
    }

    return seen.has(owner) ? null : owner;
  }

  private getDirectOwner(guid: string): string | null {
    const temporal = this.controllers.get(guid);
    if (temporal) return temporal.controller;

    if (this.vehicleIntervals.has(guid)) {
      return this.getVehicleOwner(guid);
    }

    return this.classificationOwners.get(guid) ?? this.units[guid]?.owner ?? null;
  }

  private getVehicleOwner(guid: string): string | null {
    const cached = this.vehicleOwnerCache.get(guid);
    if (cached !== undefined) return cached;

    const timestampMs = this.currentTimestampMs;
    const intervals = this.vehicleIntervals.get(guid);
    if (timestampMs === null || !intervals || intervals.length === 0) {
      this.vehicleOwnerCache.set(guid, null);
      return null;
    }

    let low = 0;
    let high = intervals.length - 1;
    let candidate: ProcessorVehicleControlInterval | null = null;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const interval = intervals[mid];
      if (interval.assignedAtMs <= timestampMs) {
        candidate = interval;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const owner = candidate &&
      (candidate.releasedAtMs === null || timestampMs < candidate.releasedAtMs)
      ? candidate.controllerGuid
      : null;
    this.vehicleOwnerCache.set(guid, owner);
    return owner;
  }

  /** Check if a GUID is a player (cached). */
  isPlayer(guid: string): boolean {
    let cached = this.playerCache.get(guid);
    if (cached === undefined) {
      cached = isPlayerGuidFast(guid);
      this.playerCache.set(guid, cached);
    }
    return cached;
  }

  /** Check if a GUID currently acts as a "pet" (has any owner — static or temporal). */
  isPet(guid: string): boolean {
    return this.getOwner(guid) !== null;
  }

  /** Check if a GUID is a friendly pet (owner is a player). */
  isPlayerPet(guid: string): boolean {
    const owner = this.getOwner(guid);
    return owner !== null && this.isPlayer(owner);
  }

  /** Get static unit info (name, entry). */
  getUnit(guid: string): ProcessorUnit | undefined {
    return this.units[guid];
  }

  /** Shared GUID parse cache (avoids expensive GUID.fromString per processor). */
  getGuidCache(): GuidCache {
    return this.guidCache;
  }

  /** Cached GUID parse helper. */
  getCachedGuid(guidStr: string) {
    return getCachedGuid(this.guidCache, guidStr);
  }
}
