interface Point {
  x: number;
  y: number;
}

interface Dimensions {
  width: number;
  height: number;
}

export function clampFloatingPanelPosition(
  position: Point,
  panel: Dimensions,
  viewport: Dimensions,
): Point {
  return {
    x: Math.max(0, Math.min(position.x, Math.max(0, viewport.width - panel.width))),
    y: Math.max(0, Math.min(position.y, Math.max(0, viewport.height - panel.height))),
  };
}
