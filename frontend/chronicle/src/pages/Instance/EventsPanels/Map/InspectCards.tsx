import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createUnitAurasPanel } from "../UnitAuras/UnitAuras";
import type { PanelContext } from "../types";
import { useEmbeddedPanel, type EmbeddedPanelRender } from "../useEmbeddedPanel";

const UNIT_AURAS_PANEL = createUnitAurasPanel();
const BOX_WIDTH = 176;
const GAP = 8;
// New boxes line up under the raid frames (five rows of frames plus margin), four to a row.
const FIRST_TOP = 124;
const PER_ROW = 4;
const ROW_HEIGHT = 140;

interface Position {
  left: number;
  top: number;
}

function defaultPosition(index: number): Position {
  return {
    left: GAP + (index % PER_ROW) * (BOX_WIDTH + GAP),
    top: FIRST_TOP + Math.floor(index / PER_ROW) * ROW_HEIGHT,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface InspectCardsProps {
  guids: readonly string[];
  onRemove: (guid: string) => void;
  /** The map's Raid Frames render (shared with its grid): health, power and casts. */
  raidFrames: EmbeddedPanelRender;
  context: PanelContext;
  durationMs: number;
}

/**
 * A movable box per inspected unit, laid over the map container (which must
 * be `relative`): the Raid Frames panel's inspect frame (health, power, cast)
 * over the Unit Auras panel's icons, drawn for `u:<guid>` from one run of each
 * panel.
 */
export function InspectCards({ guids, onRemove, raidFrames, context, durationMs }: InspectCardsProps) {
  const auras = useEmbeddedPanel({ panel: UNIT_AURAS_PANEL, context, durationMs, enabled: guids.length > 0 });
  const layerRef = useRef<HTMLDivElement>(null);
  // Where each box was dragged to; the rest take their slot in the line-up.
  const [moved, setMoved] = useState<ReadonlyMap<string, Position>>(new Map());
  if (guids.length === 0) return null;
  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {guids.map((guid, index) => (
        <InspectBox
          key={guid}
          layerRef={layerRef}
          position={moved.get(guid) ?? defaultPosition(index)}
          onMove={(position) => setMoved((current) => new Map(current).set(guid, position))}
          onRemove={() => onRemove(guid)}
        >
          {raidFrames(`u:${guid}`)}
          {auras(`u:${guid}`)}
        </InspectBox>
      ))}
    </div>
  );
}

function InspectBox({
  layerRef,
  position,
  onMove,
  onRemove,
  children,
}: {
  layerRef: RefObject<HTMLDivElement | null>;
  position: Position;
  onMove: (position: Position) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; start: Position } | null>(null);
  const [dragging, setDragging] = useState(false);

  const clampToLayer = (next: Position): Position => {
    const layer = layerRef.current?.getBoundingClientRect();
    const box = boxRef.current?.getBoundingClientRect();
    if (!layer || !box) return next;
    return { left: clamp(next.left, 0, layer.width - box.width), top: clamp(next.top, 0, layer.height - box.height) };
  };

  // Press anywhere on the box (but its button) to drag it.
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { x: event.clientX, y: event.clientY, start: position };
    setDragging(true);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current) return;
    onMove(clampToLayer({ left: current.start.left + event.clientX - current.x, top: current.start.top + event.clientY - current.y }));
  };
  const end = () => {
    gesture.current = null;
    setDragging(false);
  };

  // Keep the box on the map when the map shrinks.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const observer = new ResizeObserver(() => {
      const next = clampToLayer(position);
      if (next.left !== position.left || next.top !== position.top) onMove(next);
    });
    observer.observe(layer);
    return () => observer.disconnect();
  });

  return (
    <div
      ref={boxRef}
      role="region"
      aria-label="Inspected unit"
      className={cn(
        "pointer-events-auto absolute flex flex-col gap-1 rounded-sm border border-black/80 bg-black/75 p-1.5 text-white shadow-[0_4px_16px_rgba(0,0,0,.5)]",
        dragging ? "cursor-grabbing select-none" : "cursor-grab",
      )}
      style={{ left: position.left, top: position.top, width: BOX_WIDTH }}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <button
        type="button"
        onClick={onRemove}
        title="Stop inspecting"
        aria-label="Stop inspecting"
        className="absolute right-0.5 top-0.5 z-10 rounded p-0.5 text-white/50 hover:text-red-300"
      >
        <X className="h-3 w-3" />
      </button>
      {children}
    </div>
  );
}
