import { useCallback, useRef, useState, useEffect } from "react";
import { Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTimeRangeContext } from "./TimeRangeContext";

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Floating time range controller overlay — dual-handle timeline slider.
 * Triggered from the hamburger menu. Shows selected encounter timeline.
 */
export function TimeRangeController({ onClose }: { onClose: () => void }) {
  const timeRange = useTimeRangeContext();
  const { totalDurationMs, startOffsetMs, endOffsetMs, setRange, reset, enabled } = timeRange;

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const startPct = totalDurationMs > 0 && startOffsetMs != null
    ? (startOffsetMs / totalDurationMs) * 100
    : 0;
  const endPct = totalDurationMs > 0 && endOffsetMs != null
    ? (endOffsetMs / totalDurationMs) * 100
    : 100;

  const pctToMs = useCallback((pct: number) => {
    return Math.round((pct / 100) * totalDurationMs);
  }, [totalDurationMs]);

  const getPositionPct = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }, []);

  const handlePointerDown = useCallback((handle: "start" | "end") => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(handle);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const pct = getPositionPct(e.clientX);
    const ms = pctToMs(pct);
    if (dragging === "start") {
      const clampedMs = endOffsetMs != null ? Math.min(ms, endOffsetMs) : ms;
      setRange(clampedMs, endOffsetMs);
    } else {
      const clampedMs = startOffsetMs != null ? Math.max(ms, startOffsetMs) : ms;
      setRange(startOffsetMs, clampedMs);
    }
  }, [dragging, getPositionPct, pctToMs, startOffsetMs, endOffsetMs, setRange]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 bg-popover border rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Clock className="h-4 w-4" />
          Time Range
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={reset} title="Reset">
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={onClose}>
            ✕
          </Button>
        </div>
      </div>

      {totalDurationMs <= 0 ? (
        <p className="text-xs text-muted-foreground">Select encounters to use the time range controller.</p>
      ) : (
        <>
          {/* Time labels */}
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{formatMs(startOffsetMs ?? 0)}</span>
            <span className="text-foreground font-medium">
              {enabled ? `${formatMs(startOffsetMs ?? 0)} – ${formatMs(endOffsetMs ?? totalDurationMs)}` : "Full range"}
            </span>
            <span>{formatMs(endOffsetMs ?? totalDurationMs)}</span>
          </div>

          {/* Dual-handle slider track */}
          <div
            ref={trackRef}
            className="relative h-6 cursor-pointer select-none touch-none"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Track background */}
            <div className="absolute top-2.5 left-0 right-0 h-1 bg-muted rounded-full" />

            {/* Active range highlight */}
            <div
              className="absolute top-2.5 h-1 bg-primary rounded-full"
              style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
            />

            {/* Start handle */}
            <div
              className="absolute top-1 w-3.5 h-3.5 bg-primary rounded-full border-2 border-background shadow cursor-grab active:cursor-grabbing"
              style={{ left: `${startPct}%`, transform: "translateX(-50%)" }}
              onPointerDown={handlePointerDown("start")}
            />

            {/* End handle */}
            <div
              className="absolute top-1 w-3.5 h-3.5 bg-primary rounded-full border-2 border-background shadow cursor-grab active:cursor-grabbing"
              style={{ left: `${endPct}%`, transform: "translateX(-50%)" }}
              onPointerDown={handlePointerDown("end")}
            />
          </div>

          {/* Total duration label */}
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>0:00</span>
            <span>{formatMs(totalDurationMs)}</span>
          </div>
        </>
      )}
    </div>
  );
}
