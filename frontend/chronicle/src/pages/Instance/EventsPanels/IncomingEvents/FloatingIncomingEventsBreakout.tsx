import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePortalContainer } from "@/components/ui/PortalContainerContext";
import {
  clampBreakoutBodyHeight,
  DEFAULT_BREAKOUT_BODY_HEIGHT,
} from "./floatingIncomingEventsBreakoutLogic.ts";

interface FloatingIncomingEventsBreakoutProps {
  initialPosition: { x: number; y: number };
  onClose: () => void;
  children: ReactNode;
}

export function FloatingIncomingEventsBreakout({
  initialPosition,
  onClose,
  children,
}: FloatingIncomingEventsBreakoutProps) {
  const isMobile = useIsMobile();
  const portalContainer = usePortalContainer();
  const portalDocument = portalContainer?.ownerDocument;
  const portalWindow = portalDocument?.defaultView;
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(DEFAULT_BREAKOUT_BODY_HEIGHT);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      isMobile
      || !target.closest("[data-drag-handle]")
      || target.closest("button, input, select, a")
    ) return;

    event.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [isMobile, position]);

  const handleResizeMouseDown = useCallback((event: React.MouseEvent) => {
    if (isMobile) return;
    event.preventDefault();
    event.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = { y: event.clientY, height: bodyHeight };
  }, [bodyHeight, isMobile]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!dragStartRef.current) return;
      setPosition({
        x: dragStartRef.current.posX + event.clientX - dragStartRef.current.x,
        y: dragStartRef.current.posY + event.clientY - dragStartRef.current.y,
      });
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    if (!portalDocument) return;
    portalDocument.addEventListener("mousemove", handleMouseMove);
    portalDocument.addEventListener("mouseup", handleMouseUp);
    return () => {
      portalDocument.removeEventListener("mousemove", handleMouseMove);
      portalDocument.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, portalDocument]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeStartRef.current) return;
      setBodyHeight(clampBreakoutBodyHeight(
        resizeStartRef.current.height + event.clientY - resizeStartRef.current.y,
        (portalWindow?.innerHeight ?? 0) - position.y,
      ));
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    if (!portalDocument) return;
    portalDocument.addEventListener("mousemove", handleMouseMove);
    portalDocument.addEventListener("mouseup", handleMouseUp);
    return () => {
      portalDocument.removeEventListener("mousemove", handleMouseMove);
      portalDocument.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, position.y, portalDocument, portalWindow]);

  const breakoutStyle = {
    left: position.x,
    top: position.y,
    cursor: isDragging ? "grabbing" : "default",
    "--incoming-events-body-height": `${bodyHeight}px`,
  } as CSSProperties;

  if (!portalContainer) return null;

  if (isMobile) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[200] bg-black/50" onClick={onClose} />
        <div className="fixed inset-x-2 top-1/2 z-[200] max-h-[85vh] -translate-y-1/2 overflow-auto styled-scrollbar">
          {children}
        </div>
      </>,
      portalContainer,
    );
  }

  return createPortal(
    <div
      data-breakout-panel
      className="fixed z-[200] w-[min(620px,90vw)]"
      style={breakoutStyle}
      onMouseDown={handleMouseDown}
    >
      {children}
      <div
        className="group absolute -bottom-1 left-0 right-0 flex h-3 cursor-ns-resize items-center justify-center"
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={() => setBodyHeight(DEFAULT_BREAKOUT_BODY_HEIGHT)}
        title="Drag to resize; double-click to reset"
        aria-label="Resize event breakout height"
        data-breakout-resize-handle
      >
        <span className="h-px w-10 rounded-full bg-border transition-colors group-hover:bg-muted-foreground" />
      </div>
    </div>,
    portalContainer,
  );
}
