import { useEffect, useMemo, useRef, useState } from "react";
import GridLayout, { type LayoutItem } from "react-grid-layout";
import { GripVertical } from "lucide-react";
import "react-grid-layout/css/styles.css";
import { cn } from "@/lib/utils";
import { GridEdgeResizeControls } from "./GridEdgeResizeControls";
import {
  gridItemChanged,
  resizeGridItemFromEdge,
  type GridResizeDelta,
  type GridResizeEdge,
} from "./gridEdgeResize";

export type LayoutItemKind = "panel" | "strip";
export type StripOrientation = "horizontal" | "vertical";

export interface GridEditorItem {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Legacy items omit kind and are treated as panels. */
  kind?: LayoutItemKind;
  /** Strip visualization ID. Present only when kind is "strip". */
  stripType?: string;
  /** Persisted now so vertical strips can be introduced without a schema change. */
  orientation?: StripOrientation;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

interface GridLayoutEditorProps {
  items: GridEditorItem[];
  onItemsChange: (items: GridEditorItem[]) => void;
  renderItem: (item: GridEditorItem) => React.ReactNode;
  editable?: boolean;
  cols?: number;
  rowHeight?: number;
  className?: string;
  showItemHeader?: boolean;
  pulseFirstResizeHandle?: boolean;
  onResizeStop?: () => void;
}

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(ref.current);
    setWidth(ref.current.offsetWidth);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}

export function GridLayoutEditor({
  items,
  onItemsChange,
  renderItem,
  editable = true,
  cols = 12,
  rowHeight = 110,
  className,
  showItemHeader = true,
  pulseFirstResizeHandle = false,
  onResizeStop,
}: GridLayoutEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  const layout = useMemo(
    () =>
      items.map((item) => ({
        i: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: item.minW ?? 4,
        minH: item.minH ?? 4,
        maxW: item.maxW ?? cols,
        maxH: item.maxH ?? 20,
      })),
    [items, cols]
  );

  const commitLayout = (newLayout: readonly LayoutItem[]) => {
    const byId = new Map(newLayout.map((entry) => [entry.i, entry]));
    const next = items.map((item) => {
      const entry = byId.get(item.id);
      if (!entry) return item;
      return {
        ...item,
        x: entry.x,
        y: entry.y,
        w: entry.w,
        h: entry.h,
      };
    });
    onItemsChange(next);
  };

  const resizeItemFromEdge = (
    itemId: string,
    edge: GridResizeEdge,
    delta: GridResizeDelta,
  ) => {
    const layoutItem = layout.find((entry) => entry.i === itemId);
    if (!layoutItem) return;

    const resized = resizeGridItemFromEdge(layoutItem, edge, delta, cols);
    if (!gridItemChanged(layoutItem, resized)) return;
    commitLayout(layout.map((entry) => (entry.i === itemId ? resized : entry)));
    onResizeStop?.();
  };

  const canResizeItemFromEdge = (
    itemId: string,
    edge: GridResizeEdge,
    delta: GridResizeDelta,
  ) => {
    const layoutItem = layout.find((entry) => entry.i === itemId);
    if (!layoutItem) return false;
    return gridItemChanged(
      layoutItem,
      resizeGridItemFromEdge(layoutItem, edge, delta, cols),
    );
  };

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <GridLayout
        className="layout"
        layout={layout}
        width={containerWidth}
        gridConfig={{
          cols,
          rowHeight,
          containerPadding: [0, 0],
        }}
        dragConfig={{
          handle: ".grid-layout-editor-handle",
          enabled: editable,
        }}
        resizeConfig={{
          enabled: editable,
        }}
        onDragStop={(newLayout) => commitLayout(newLayout)}
        onResizeStop={(newLayout) => {
          commitLayout(newLayout);
          onResizeStop?.();
        }}
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            className={cn(
              "group/resize-panel relative overflow-hidden rounded-lg border border-border bg-card shadow-sm",
              pulseFirstResizeHandle && index === 0 && "grid-layout-editor-pulse-resize",
            )}
          >
            {editable && (
              <GridEdgeResizeControls
                label={item.title}
                onResize={(edge, delta) => resizeItemFromEdge(item.id, edge, delta)}
                canResize={(edge, delta) => canResizeItemFromEdge(item.id, edge, delta)}
              />
            )}
            {showItemHeader ? (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                {editable && (
                  <div className="grid-layout-editor-handle flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background/80 cursor-move text-muted-foreground shadow-sm transition-colors hover:text-foreground hover:bg-background">
                    <GripVertical className="h-5 w-5" />
                  </div>
                )}
                <span className="text-sm font-medium">{item.title}</span>
              </div>
            ) : (
              editable && (
                <div className="grid-layout-editor-handle absolute left-2 top-2 z-20 flex h-8 w-8 items-center justify-center cursor-move rounded-md border border-border/70 bg-background/90 text-muted-foreground shadow-md transition-colors hover:text-foreground hover:bg-background">
                  <GripVertical className="h-5 w-5" />
                </div>
              )
            )}
            <div className={cn("overflow-auto styled-scrollbar", showItemHeader ? "h-[calc(100%-41px)] p-3" : "h-full p-0")}>
              {renderItem(item)}
            </div>
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
