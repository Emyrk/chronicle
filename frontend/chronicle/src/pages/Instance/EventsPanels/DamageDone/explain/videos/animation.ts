/**
 * Frame-driven animation constants for lesson compositions (kept separate
 * from shared.tsx so component files only export components).
 */

import { Easing } from "remotion";

/** Clamp both ends — the default for every interpolate() in lesson videos. */
export const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

/** Standard entrance easing (remotion-markup guidance). */
export const entranceEasing = Easing.bezier(0.16, 1, 0.3, 1);
