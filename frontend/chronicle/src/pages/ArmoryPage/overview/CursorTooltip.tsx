import type { ReactNode } from "react";

export interface CursorPos {
  x: number;
  y: number;
}

/** Estimated tooltip footprint used to flip away from viewport edges. */
const EST_WIDTH = 360;
const EST_HEIGHT = 420;
const OFFSET = 14;

/**
 * Fixed-position wrapper that places its content next to the cursor,
 * flipping to the other side when it would run off the viewport.
 */
export function CursorTooltip({ pos, children }: { pos: CursorPos; children: ReactNode }) {
  const flipX = pos.x + OFFSET + EST_WIDTH > window.innerWidth;
  const flipY = pos.y + OFFSET + EST_HEIGHT > window.innerHeight;
  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: pos.x + (flipX ? -OFFSET : OFFSET),
        top: pos.y + (flipY ? -OFFSET : OFFSET),
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
      }}
    >
      {children}
    </div>
  );
}
