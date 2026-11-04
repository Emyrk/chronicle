import { MARKER_COLORS } from "../EventsPanels/Map/plan/planArt";
import type { PlanMarkerIcon } from "../EventsPanels/Map/plan/mapPlan";

export interface LeeroyFeaturedUnit {
  guid: string;
  name: string;
  role: string;
  color: string;
  marker: PlanMarkerIcon;
}

export const LEEROY_FEATURED_UNITS: readonly LeeroyFeaturedUnit[] = [
  {
    guid: "0x00000000000A0001",
    name: "Leeroy",
    role: "The charge",
    color: MARKER_COLORS.square,
    marker: "square",
  },
  {
    guid: "0x00000000000A0002",
    name: "Anfrony",
    role: "Camera POV",
    color: MARKER_COLORS.triangle,
    marker: "triangle",
  },
];

export const LEEROY_UNIT_CALLOUTS = new Map(
  LEEROY_FEATURED_UNITS.map((unit) => [unit.guid, { title: unit.name, subtitle: unit.role, color: unit.color, marker: unit.marker }]),
);
