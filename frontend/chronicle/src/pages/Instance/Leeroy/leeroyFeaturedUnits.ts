import { MARKER_COLORS } from "../EventsPanels/Map/plan/planArt";
import type { ReplayFeaturedUnit } from "../EventsPanels/Map/replayFeaturedUnits";

/** Leeroy's featured characters, handed to the replay map on the page's instance (`replayFeaturedUnits`). */
export const LEEROY_FEATURED_UNITS: readonly ReplayFeaturedUnit[] = [
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
