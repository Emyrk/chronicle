/**
 * Remotion animation hooks for lesson compositions.
 * Separated from component file for react-refresh compatibility.
 */

import { interpolate, Easing, useCurrentFrame, useVideoConfig, spring } from "remotion";

export const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

/** Fade-in entrance animation value (0→1). */
export function useEntrance(durationInFrames = 20) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame, fps, config: { damping: 200 }, durationInFrames });
}

/** Standard cursor position interpolation. */
export function useCursorMove(
  startFrame: number,
  endFrame: number,
  from: [number, number],
  to: [number, number],
) {
  const frame = useCurrentFrame();
  const ease = Easing.bezier(0.16, 1, 0.3, 1);
  const x = interpolate(frame, [startFrame, endFrame], [from[0], to[0]], { ...clamp, easing: ease });
  const y = interpolate(frame, [startFrame, endFrame], [from[1], to[1]], { ...clamp, easing: ease });
  return { x, y };
}

/** Standard click pulse (0→1→0). */
export function useClickPulse(clickFrame: number, duration = 16) {
  const frame = useCurrentFrame();
  const mid = clickFrame + duration / 2;
  return interpolate(frame, [clickFrame, mid, clickFrame + duration], [0, 1, 0], clamp);
}
