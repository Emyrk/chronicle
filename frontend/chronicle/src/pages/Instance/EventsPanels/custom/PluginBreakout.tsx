import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { GripHorizontal, X } from "lucide-react";
import { usePortalContainer } from "@/components/ui/PortalContainerContext";
import type {
  ChroniclePanelBreakoutPositionV1,
  ChroniclePanelBreakoutSizeV1,
} from "./pluginTypes";
import {
  clampPluginBreakoutPosition,
  clampPluginBreakoutSize,
} from "./pluginBreakoutLogic";
import type { PluginBreakoutEntry } from "./pluginBreakoutManager";

export type { PluginBreakoutEntry } from "./pluginBreakoutManager";

interface PluginBreakoutProps extends PluginBreakoutEntry {
  onClose: (id: string) => void;
}

export function PluginBreakout({
  id,
  title,
  mount,
  initialPosition,
  initialSize,
  onClose,
}: PluginBreakoutProps) {
  const portalContainer = usePortalContainer();
  const portalDocument = portalContainer?.ownerDocument;
  const portalWindow = portalDocument?.defaultView;
  const [isMobile, setIsMobile] = useState(
    () => (portalWindow?.innerWidth ?? 1_024) < 1_024,
  );
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    position: ChroniclePanelBreakoutPositionV1;
  } | null>(null);
  const resizeStartRef = useRef<{
    x: number;
    y: number;
    size: ChroniclePanelBreakoutSizeV1;
  } | null>(null);

  useEffect(() => {
    if (!portalWindow) return;
    const mediaQuery = portalWindow.matchMedia("(max-width: 1023px)");
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [portalWindow]);

  const viewport = useCallback(() => ({
    width: portalWindow?.innerWidth ?? initialSize.width,
    height: portalWindow?.innerHeight ?? initialSize.height,
  }), [initialSize.height, initialSize.width, portalWindow]);

  const attachMount = useCallback((node: HTMLDivElement | null) => {
    if (node && mount.parentNode !== node) node.replaceChildren(mount);
  }, [mount]);

  const handleDragStart = useCallback((event: React.MouseEvent) => {
    if (isMobile || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      position,
    };
  }, [isMobile, position]);

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    if (isMobile) return;
    event.preventDefault();
    event.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      size,
    };
  }, [isMobile, size]);

  useEffect(() => {
    if (!isDragging || !portalDocument) return;
    const handleMove = (event: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      setPosition(clampPluginBreakoutPosition({
        x: start.position.x + event.clientX - start.x,
        y: start.position.y + event.clientY - start.y,
      }, size, viewport()));
    };
    const handleEnd = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    portalDocument.addEventListener("mousemove", handleMove);
    portalDocument.addEventListener("mouseup", handleEnd);
    return () => {
      portalDocument.removeEventListener("mousemove", handleMove);
      portalDocument.removeEventListener("mouseup", handleEnd);
    };
  }, [isDragging, portalDocument, size, viewport]);

  useEffect(() => {
    if (!isResizing || !portalDocument) return;
    const handleMove = (event: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      setSize(clampPluginBreakoutSize({
        width: start.size.width + event.clientX - start.x,
        height: start.size.height + event.clientY - start.y,
      }, viewport()));
    };
    const handleEnd = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };
    portalDocument.addEventListener("mousemove", handleMove);
    portalDocument.addEventListener("mouseup", handleEnd);
    return () => {
      portalDocument.removeEventListener("mousemove", handleMove);
      portalDocument.removeEventListener("mouseup", handleEnd);
    };
  }, [isResizing, portalDocument, viewport]);

  useEffect(() => {
    if (!portalWindow) return;
    const handleResize = () => {
      setSize((currentSize) => {
        const nextSize = clampPluginBreakoutSize(currentSize, viewport());
        setPosition((currentPosition) =>
          clampPluginBreakoutPosition(currentPosition, nextSize, viewport()));
        return nextSize;
      });
    };
    portalWindow.addEventListener("resize", handleResize);
    return () => portalWindow.removeEventListener("resize", handleResize);
  }, [portalWindow, viewport]);

  if (!portalContainer) return null;

  const shell = (
    <div
      data-plugin-breakout={id}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-2xl"
    >
      <div
        data-drag-handle
        className="flex h-9 shrink-0 cursor-grab items-center gap-2 border-b bg-muted/80 px-2 active:cursor-grabbing"
        onMouseDown={handleDragStart}
      >
        <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => onClose(id)}
          aria-label={`Close ${title}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={attachMount} className="min-h-0 flex-1 overflow-auto styled-scrollbar" />
      {!isMobile && (
        <div
          data-breakout-resize-handle
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          onMouseDown={handleResizeStart}
          aria-label={`Resize ${title}`}
        />
      )}
    </div>
  );

  if (isMobile) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[200] bg-black/50" onClick={() => onClose(id)} />
        <div className="fixed inset-2 z-[200] max-h-[calc(100vh-1rem)]">{shell}</div>
      </>,
      portalContainer,
    );
  }

  const style = {
    left: position.x,
    top: position.y,
    width: size.width,
    height: size.height,
  } satisfies CSSProperties;
  return createPortal(
    <div className="fixed z-[200]" style={style}>{shell}</div>,
    portalContainer,
  );
}
