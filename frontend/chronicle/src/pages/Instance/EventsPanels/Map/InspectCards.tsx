import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { GripHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createUnitAurasPanel } from "../UnitAuras/UnitAuras";
import type { PanelContext } from "../types";
import { useEmbeddedPanel, type EmbeddedPanelRender } from "../useEmbeddedPanel";

const UNIT_AURAS_PANEL = createUnitAurasPanel();
const POSITION_STORAGE_KEY = "chronicle.map.inspect";
// Starts under the raid frames (five rows of frames plus their margin).
const DEFAULT_POSITION = { left: 8, top: 124 };
const FRAME_WIDTH = 176;

interface Position {
  left: number;
  top: number;
}

function readStoredPosition(): Position {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) ?? "null") as Position | null;
    return parsed && typeof parsed.left === "number" && typeof parsed.top === "number" ? parsed : DEFAULT_POSITION;
  } catch {
    return DEFAULT_POSITION;
  }
}

function storePosition(position: Position) {
  try {
    localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Storage may be unavailable; the frame still moves for this session.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface InspectCardsProps {
  guids: readonly string[];
  onRemove: (guid: string) => void;
  onClear: () => void;
  /** The map's Raid Frames render (shared with its grid): health, power and casts. */
  raidFrames: EmbeddedPanelRender;
  context: PanelContext;
  durationMs: number;
}

/**
 * A movable frame of inspect cards, laid over the map container (which must
 * be `relative`). Each card is the Raid Frames panel's inspect frame (health,
 * power, cast) over the Unit Auras panel's icons, drawn for `u:<guid>` from
 * one run of each panel.
 */
export function InspectCards({ guids, onRemove, onClear, raidFrames, context, durationMs }: InspectCardsProps) {
  const auras = useEmbeddedPanel({ panel: UNIT_AURAS_PANEL, context, durationMs, enabled: guids.length > 0 });
  const layerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(readStoredPosition);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; y: number; start: Position } | null>(null);

  const clampToLayer = (next: Position): Position => {
    const layer = layerRef.current?.getBoundingClientRect();
    const frame = frameRef.current?.getBoundingClientRect();
    if (!layer || !frame) return next;
    return { left: clamp(next.left, 0, layer.width - frame.width), top: clamp(next.top, 0, layer.height - Math.min(frame.height, 40)) };
  };

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
    setPosition(clampToLayer({ left: current.start.left + event.clientX - current.x, top: current.start.top + event.clientY - current.y }));
  };
  const end = () => {
    if (!gesture.current) return;
    gesture.current = null;
    setDragging(false);
    setPosition((current) => {
      storePosition(current);
      return current;
    });
  };

  // Keep the frame on the map when the map shrinks.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const observer = new ResizeObserver(() => setPosition((current) => {
      const next = clampToLayer(current);
      return next.left === current.left && next.top === current.top ? current : next;
    }));
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  if (guids.length === 0) return null;
  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <div
        ref={frameRef}
        role="dialog"
        aria-label="Inspected units"
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-sm border border-black/80 bg-black/75 text-white shadow-[0_4px_16px_rgba(0,0,0,.5)]"
        style={{ left: position.left, top: position.top, width: FRAME_WIDTH, maxHeight: `calc(100% - ${position.top + 8}px)` }}
      >
        <div
          className={cn("flex h-5 shrink-0 items-center gap-1 border-b border-white/10 bg-white/[0.06] px-1 text-[10px] font-semibold text-white/80", dragging ? "cursor-grabbing select-none" : "cursor-grab")}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <GripHorizontal className="h-3 w-3 shrink-0 text-white/40" />
          <span className="flex-1 truncate">Inspecting {guids.length}</span>
          <button type="button" onClick={onClear} title="Stop inspecting all" aria-label="Stop inspecting all" className="rounded p-0.5 text-white/50 hover:text-red-300">
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="styled-scrollbar flex min-h-0 flex-col divide-y divide-white/10 overflow-y-auto">
          {guids.map((guid) => (
            <div key={guid} className="relative flex shrink-0 flex-col gap-1 p-1.5">
              <button
                type="button"
                onClick={() => onRemove(guid)}
                title="Stop inspecting"
                aria-label="Stop inspecting"
                className="absolute right-0.5 top-0.5 rounded p-0.5 text-white/50 hover:text-red-300"
              >
                <X className="h-3 w-3" />
              </button>
              {raidFrames(`u:${guid}`)}
              {auras(`u:${guid}`)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
