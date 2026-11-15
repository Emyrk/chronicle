/**
 * Featured characters a cinematic reconstruction calls out on the replay map
 * (Leeroy's charge): a card for each, middle left, and a raid marker above the
 * unit. They travel on the instance (`Instance.replayFeaturedUnits`), like an
 * authored camera path, so the shared map code never checks which page it is on.
 */

import type { MapUnitCallout } from "./MapScene3D";
import type { PlanMarkerIcon } from "./plan/mapPlan";

export interface ReplayFeaturedUnit {
  guid: string;
  name: string;
  role: string;
  color: string;
  marker: PlanMarkerIcon;
}

// One callout map per featured list, so the view sees the same object every render.
const calloutCache = new WeakMap<readonly ReplayFeaturedUnit[], ReadonlyMap<string, MapUnitCallout>>();

/** The raid-marker callouts above the featured units, or undefined without any. */
export function featuredUnitCallouts(units: readonly ReplayFeaturedUnit[] | undefined): ReadonlyMap<string, MapUnitCallout> | undefined {
  if (!units?.length) return undefined;
  let callouts = calloutCache.get(units);
  if (!callouts) {
    callouts = new Map(units.map((unit) => [unit.guid, { title: unit.name, subtitle: unit.role, color: unit.color, marker: unit.marker }]));
    calloutCache.set(units, callouts);
  }
  return callouts;
}
