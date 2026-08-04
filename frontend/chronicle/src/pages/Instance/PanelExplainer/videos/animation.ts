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

/**
 * Every lesson opens on a LessonIntro title card for this many frames — it is
 * fully opaque at frame 0 so the player's paused preview is never blank. The
 * demo choreography mounts in a <Sequence from={INTRO_FRAMES - 10}> so it
 * enters under the card's fade-out.
 */
export const INTRO_FRAMES = 60;
