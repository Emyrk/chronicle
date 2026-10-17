import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, GripHorizontal, Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { cn } from "@/lib/utils";
import { EmbeddedPanel } from "../EmbeddedPanel";
import type { PanelContext } from "../types";
import { isMeterPanelKey, meterAvailable, METER_PANELS } from "./meterPanels";
import { MIN_HEIGHT, MIN_WIDTH, spawnMeterWindow, type MeterWindow } from "./meterWindowsState";

interface MeterWindowsProps {
  windows: MeterWindow[];
  onChange: (update: (windows: MeterWindow[]) => MeterWindow[]) => void;
  context: PanelContext;
  durationMs: number;
}

/** Every meter window, laid over the map container (which must be `relative`). */
export function MeterWindows({ windows, onChange, context, durationMs }: MeterWindowsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const patch = useCallback((id: string, change: Partial<MeterWindow>) => {
    onChange((current) => current.map((window) => (window.id === id ? { ...window, ...change } : window)));
  }, [onChange]);
  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {/* With no meters open, a "+" in the corner the first one opens in. */}
      {windows.length === 0 && (
        <button
          type="button"
          onClick={() => onChange((current) => [...current, spawnMeterWindow(current, context.instance.capabilities ?? [])])}
          title="Open a meter (Damage Done, Healing Done, …)"
          aria-label="Open a meter"
          className="pointer-events-auto absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-sm border border-black/80 bg-black/75 text-white/70 shadow-[0_4px_16px_rgba(0,0,0,.5)] hover:bg-black/90 hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
      {windows.map((window) => (
        <MeterWindowFrame
          key={window.id}
          window={window}
          containerRef={containerRef}
          onPatch={(change) => patch(window.id, change)}
          onClose={() => onChange((current) => current.filter((other) => other.id !== window.id))}
          onSpawn={() => onChange((current) => [...current, spawnMeterWindow(current, context.instance.capabilities ?? [])])}
          context={context}
          durationMs={durationMs}
        />
      ))}
    </div>
  );
}

function MeterWindowFrame({
  window,
  containerRef,
  onPatch,
  onClose,
  onSpawn,
  context,
  durationMs,
}: {
  window: MeterWindow;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onPatch: (change: Partial<MeterWindow>) => void;
  onClose: () => void;
  onSpawn: () => void;
  context: PanelContext;
  durationMs: number;
}) {
  const gesture = useRef<{ kind: "move" | "resize"; x: number; y: number; start: MeterWindow } | null>(null);
  const [active, setActive] = useState<"move" | "resize" | null>(null);

  const begin = (kind: "move" | "resize") => (event: ReactPointerEvent<HTMLElement>) => {
    // React bubbles events from portals (the meter menu) through this bar; only
    // presses on the bar itself start a drag.
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind, x: event.clientX, y: event.clientY, start: window };
    setActive(kind);
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current;
    const container = containerRef.current;
    if (!current || !container) return;
    const bounds = container.getBoundingClientRect();
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    const { start } = current;
    if (current.kind === "move") {
      onPatch({
        right: clamp(start.right - dx, 0, bounds.width - start.width),
        bottom: clamp(start.bottom - dy, 0, bounds.height - start.height),
      });
    } else {
      // The grip is top-left: dragging it out grows the window up and left.
      onPatch({
        width: clamp(start.width - dx, MIN_WIDTH, bounds.width - start.right),
        height: clamp(start.height - dy, MIN_HEIGHT, bounds.height - start.bottom),
      });
    }
  };

  const end = () => {
    gesture.current = null;
    setActive(null);
  };

  // Keep the window inside the map when the map shrinks.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (window.right + window.width > width || window.bottom + window.height > height) {
        onPatch({
          right: clamp(window.right, 0, Math.max(0, width - window.width)),
          bottom: clamp(window.bottom, 0, Math.max(0, height - window.height)),
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, onPatch, window.bottom, window.height, window.right, window.width]);

  const meter = METER_PANELS[window.meter];
  return (
    <div
      // A floating panel, not a modal dialog (focus mode's Esc ignores open dialogs).
      role="region"
      aria-label={`${meter.label} meter`}
      className={cn(
        "pointer-events-auto absolute flex flex-col overflow-hidden rounded-sm border border-black/80 bg-black/75 text-white shadow-[0_4px_16px_rgba(0,0,0,.5)] backdrop-blur-[2px]",
        active && "select-none",
      )}
      style={{ right: window.right, bottom: window.bottom, width: window.width, height: window.height }}
    >
      <div
        className={cn("flex h-6 shrink-0 items-center gap-1 border-b border-white/10 bg-white/[0.06] px-1", active === "move" ? "cursor-grabbing" : "cursor-grab")}
        onPointerDown={begin("move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span
          className="grid h-4 w-4 shrink-0 cursor-nwse-resize place-items-center text-white/40 hover:text-white/80"
          title="Resize"
          onPointerDown={(event) => { event.stopPropagation(); begin("resize")(event); }}
          onPointerMove={(event) => { event.stopPropagation(); move(event); }}
          onPointerUp={(event) => { event.stopPropagation(); end(); }}
          onPointerCancel={end}
        >
          <GripHorizontal className="h-3 w-3 -rotate-45" />
        </span>
        {/* The app's dark menu: a native <select> list renders white in some browsers. */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Meter"
              className="flex min-w-0 max-w-[60%] items-center gap-1 truncate rounded px-1 text-[11px] font-semibold text-white hover:bg-white/10"
            >
              <span className="truncate">{meter.label}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-white/60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            <DropdownMenuRadioGroup value={window.meter} onValueChange={(value) => isMeterPanelKey(value) && onPatch({ meter: value })}>
              {Object.entries(METER_PANELS)
                .filter(([key, option]) => key === window.meter || meterAvailable(option, context.instance.capabilities ?? []))
                .map(([key, option]) => (
                  <DropdownMenuRadioItem key={key} value={key} className="text-xs">{option.label}</DropdownMenuRadioItem>
                ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* The empty stretch of the title bar is the drag handle. */}
        <span className="h-full flex-1" />
        <button
          type="button"
          aria-pressed={window.perSecond}
          onClick={() => onPatch({ perSecond: !window.perSecond })}
          title="Per second"
          className={cn("rounded px-1 font-mono text-[10px]", window.perSecond ? "bg-white/15 text-white" : "text-white/50 hover:text-white")}
        >
          /s
        </button>
        <button type="button" onClick={onSpawn} title="Open another meter" aria-label="Open another meter" className="rounded p-0.5 text-white/50 hover:text-white">
          <Plus className="h-3 w-3" />
        </button>
        <button type="button" onClick={onClose} title="Close meter" aria-label="Close meter" className="rounded p-0.5 text-white/50 hover:text-red-300">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-0.5">
        <EmbeddedPanel
          key={window.meter}
          panel={meter.panel}
          context={context}
          durationMs={durationMs}
          perSecond={window.perSecond}
        />
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
