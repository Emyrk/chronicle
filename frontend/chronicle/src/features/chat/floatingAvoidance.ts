import { useEffect, useRef, useState, type RefObject } from "react";

export const BOTTOM_RIGHT_FLOATING_SELECTOR = '[data-floating-corner="bottom-right"]';
const FLOATING_GAP_PX = 8;

interface Rect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export function bottomRightAvoidanceOffset(
  launcher: Rect,
  obstacles: readonly Rect[],
  gap = FLOATING_GAP_PX,
): number {
  let top = launcher.bottom + gap;
  for (const obstacle of obstacles) {
    if (obstacle.width <= 0 || obstacle.height <= 0) continue;
    if (launcher.left >= obstacle.right || launcher.right <= obstacle.left) continue;
    top = Math.min(top, obstacle.top);
  }
  return Math.max(0, Math.ceil(launcher.bottom - top + gap));
}

export function useBottomRightAvoidance<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  offset: number;
} {
  const ref = useRef<T>(null);
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const launcher = ref.current;
    if (!launcher) return;

    let frame = 0;
    const resizeObserver = new ResizeObserver(() => scheduleMeasure());

    const measure = () => {
      const current = launcher.getBoundingClientRect();
      const currentOffset = offsetRef.current;
      const baseRect = {
        top: current.top + currentOffset,
        right: current.right,
        bottom: current.bottom + currentOffset,
        left: current.left,
        width: current.width,
        height: current.height,
      };
      const obstacles = Array.from(document.querySelectorAll<HTMLElement>(BOTTOM_RIGHT_FLOATING_SELECTOR))
        .filter((element) => element !== launcher && element.getClientRects().length > 0)
        .map((element) => element.getBoundingClientRect());
      const nextOffset = bottomRightAvoidanceOffset(baseRect, obstacles);
      if (nextOffset === offsetRef.current) return;
      offsetRef.current = nextOffset;
      setOffset(nextOffset);
    };

    const observeObstacles = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(launcher);
      document.querySelectorAll<HTMLElement>(BOTTOM_RIGHT_FLOATING_SELECTOR).forEach((element) => {
        if (element !== launcher) resizeObserver.observe(element);
      });
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    const mutationObserver = new MutationObserver(() => {
      observeObstacles();
      scheduleMeasure();
    });
    observeObstacles();
    mutationObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, []);

  return { ref, offset };
}
