import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/useIsMobile";

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
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

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

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  if (isMobile) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[200] bg-black/50" onClick={onClose} />
        <div className="fixed inset-x-2 top-1/2 z-[200] max-h-[85vh] -translate-y-1/2 overflow-auto styled-scrollbar">
          {children}
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <div
      data-breakout-panel
      className="fixed z-[200] w-[min(620px,90vw)]"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? "grabbing" : "default",
      }}
      onMouseDown={handleMouseDown}
    >
      {children}
    </div>,
    document.body,
  );
}
