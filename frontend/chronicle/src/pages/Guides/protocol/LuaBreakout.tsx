import { useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { GripHorizontal, X } from "lucide-react";
import { usePortalContainer } from "@/components/ui/PortalContainerContext";
import { BREAKOUT_HEADER, breakoutPosition, type BreakoutPosition } from "./breakoutPosition";
import type { SceneNode } from "./types";

/**
 * A Lua Breakout frame. It is portaled out of the module's panel, so it is never clipped by the
 * panel's size or scrolling, and looks like Chronicle's own pinned breakouts. The viewer can drag
 * it by its header and close it; closing tells Lua, which runs OnClose. Render it only while open.
 */
export function LuaBreakout({ node, sceneRoot, onClose, children }: {
  node: SceneNode;
  sceneRoot: RefObject<HTMLElement | null>;
  onClose: (node: SceneNode) => void;
  children: ReactNode;
}) {
  const portalContainer = usePortalContainer();
  const props = node.props;
  const width = typeof props.width === "number" ? props.width : 320;
  const height = typeof props.height === "number" ? props.height : 200;
  const anchorTo = typeof props.anchorTo === "string" ? props.anchorTo : null;
  const title = typeof props.title === "string" ? props.title : "";
  const accent = typeof props.borderColor === "string" ? props.borderColor : undefined;
  const [position, setPosition] = useState<BreakoutPosition | null>(null);
  const drag = useRef<{ x: number; y: number; from: BreakoutPosition } | null>(null);

  // The scene mounts this only while the breakout is open, keyed by its anchor, so it is placed
  // each time it opens. It renders hidden once, measures, then shows; dragging moves it from there.
  const place = (element: HTMLDivElement | null) => {
    if (!element || position) return;
    const root = sceneRoot.current;
    const escaped = anchorTo && typeof CSS !== "undefined" ? CSS.escape(anchorTo) : anchorTo;
    const anchor = (escaped && root?.querySelector(`[data-guide-node="${escaped}"]`)) || root?.closest("[data-lua-panel-host]") || root;
    const rect = anchor?.getBoundingClientRect() ?? { top: 0, left: 0, right: 0, bottom: 0 };
    const size = { width: element.offsetWidth, height: element.offsetHeight };
    setPosition(breakoutPosition(rect, size, { width: window.innerWidth, height: window.innerHeight }));
  };

  if (!portalContainer) return null;

  const startDrag = (event: ReactMouseEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    if (!position) return;
    drag.current = { x: event.clientX, y: event.clientY, from: position };
    const doc = (event.currentTarget as HTMLElement).ownerDocument;
    const move = (moved: MouseEvent) => {
      const start = drag.current;
      if (start) setPosition({ x: start.from.x + moved.clientX - start.x, y: start.from.y + moved.clientY - start.y });
    };
    const up = () => { drag.current = null; doc.removeEventListener("mousemove", move); doc.removeEventListener("mouseup", up); };
    doc.addEventListener("mousemove", move);
    doc.addEventListener("mouseup", up);
  };

  return createPortal(
    <div
      ref={place}
      data-breakout-panel
      data-guide-node={node.id}
      className="fixed z-[200] max-w-[95vw] rounded-md bg-popover text-foreground shadow-md"
      style={{
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        visibility: position ? undefined : "hidden",
        opacity: typeof props.alpha === "number" ? props.alpha : undefined,
        border: `1px solid ${accent ? `color-mix(in oklch, ${accent} 60%, transparent)` : "var(--border)"}`,
      }}
    >
      <div
        className="flex items-center gap-2 border-b border-border bg-background/45 px-2.5"
        style={{ height: BREAKOUT_HEADER, cursor: "grab" }}
        onMouseDown={startDrag}
      >
        <GripHorizontal className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: accent }}>{title}</span>
        <button
          type="button"
          aria-label="Close"
          onClick={(event) => { event.stopPropagation(); onClose(node); }}
          className="cursor-pointer rounded p-0.5 text-destructive/75 transition-colors hover:bg-destructive/15 hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Children are positioned inside this box exactly as they would be inside a Frame. */}
      <div className="styled-scrollbar relative max-h-[80vh] overflow-auto" style={{ width, height }}>
        {children}
      </div>
    </div>,
    portalContainer,
  );
}
