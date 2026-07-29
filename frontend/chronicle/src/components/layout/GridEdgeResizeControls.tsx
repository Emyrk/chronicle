import { Minus, Plus } from "lucide-react";
import type { GridResizeDelta, GridResizeEdge } from "./gridEdgeResize";

interface GridEdgeResizeControlsProps {
  label: string;
  onResize: (edge: GridResizeEdge, delta: GridResizeDelta) => void;
  canResize?: (edge: GridResizeEdge, delta: GridResizeDelta) => boolean;
}

const EDGE_POSITION: Record<GridResizeEdge, string> = {
  top: "left-1/2 top-1 -translate-x-1/2 flex-row",
  right: "right-1 top-1/2 -translate-y-1/2 flex-col",
  bottom: "bottom-1 left-1/2 -translate-x-1/2 flex-row",
  left: "left-1 top-1/2 -translate-y-1/2 flex-col",
};

const EDGE_LABEL: Record<GridResizeEdge, string> = {
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
};

export function GridEdgeResizeControls({
  label,
  onResize,
  canResize = () => true,
}: GridEdgeResizeControlsProps) {
  return (
    <>
      {(["top", "right", "bottom", "left"] as const).map((edge) => (
        <div
          key={edge}
          className={`pointer-events-none absolute z-40 hidden gap-0.5 opacity-0 transition-opacity group-hover/resize-panel:flex group-hover/resize-panel:opacity-100 group-focus-within/resize-panel:flex group-focus-within/resize-panel:opacity-100 ${EDGE_POSITION[edge]}`}
        >
          {([-1, 1] as const).map((delta) => {
            const enabled = canResize(edge, delta);
            const action = delta > 0 ? "Grow" : "Shrink";
            const Icon = delta > 0 ? Plus : Minus;

            return (
              <button
                key={delta}
                type="button"
                disabled={!enabled}
                aria-label={`${action} ${label} from the ${EDGE_LABEL[edge]} by one grid unit`}
                title={`${action} from ${EDGE_LABEL[edge]}`}
                className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded-sm border border-border/80 bg-background/95 text-foreground shadow-md backdrop-blur-sm hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-30"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onResize(edge, delta);
                }}
              >
                <Icon className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}
