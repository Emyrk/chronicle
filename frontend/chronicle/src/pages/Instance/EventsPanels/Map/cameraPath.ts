export type MapCameraVector = [number, number, number];

/** A complete, serializable orbit-camera pose. */
export interface MapCameraPose {
  position: MapCameraVector;
  target: MapCameraVector;
  fov?: number;
  near?: number;
  far?: number;
}

/** A camera pose pinned to an encounter-relative replay timestamp. */
export interface MapCameraMark extends MapCameraPose {
  timestampMs: number;
  label?: string;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function interpolateVector(from: MapCameraVector, to: MapCameraVector, amount: number): MapCameraVector {
  return [
    lerp(from[0], to[0], amount),
    lerp(from[1], to[1], amount),
    lerp(from[2], to[2], amount),
  ];
}

/**
 * Samples an authored camera path. Marks may arrive in any order; timestamps
 * outside the path clamp to the first or last pose. The smoothstep easing gives
 * each authored shot a gentle arrival without storing renderer-specific state.
 */
export function cameraPoseAt(marks: readonly MapCameraMark[], timestampMs: number): MapCameraPose | null {
  if (marks.length === 0) return null;
  const sorted = [...marks].sort((a, b) => a.timestampMs - b.timestampMs);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (timestampMs <= first.timestampMs) return first;
  if (timestampMs >= last.timestampMs) return last;

  const toIndex = sorted.findIndex((mark) => mark.timestampMs >= timestampMs);
  const from = sorted[toIndex - 1];
  const to = sorted[toIndex];
  const span = to.timestampMs - from.timestampMs;
  const linear = span <= 0 ? 1 : (timestampMs - from.timestampMs) / span;
  const amount = linear * linear * (3 - 2 * linear);

  return {
    position: interpolateVector(from.position, to.position, amount),
    target: interpolateVector(from.target, to.target, amount),
    fov: lerp(from.fov ?? 45, to.fov ?? 45, amount),
    near: lerp(from.near ?? 0.1, to.near ?? 0.1, amount),
    far: lerp(from.far ?? 10_000, to.far ?? 10_000, amount),
  };
}
