import { useCallback, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import {
  timelinePreviewPercent,
  timelinePreviewTimeAtY,
  type EventTimelinePreviewEvent,
  type EventTimelinePreviewKind,
} from "./eventTimelinePreview";

interface EventTimelinePreviewProps {
  events: EventTimelinePreviewEvent[];
  windowMilli: number;
  cursorMilli: number | null;
  onCursorMilliChange?: (relativeMilli: number) => void;
  disabled?: boolean;
  className?: string;
}

const TICK_STYLES: Record<EventTimelinePreviewKind, string> = {
  damage: "left-1 right-1 bg-red-400/75",
  healing: "left-3 right-1 bg-green-400/75",
  prevented: "left-3 right-1 bg-blue-400/80",
  other: "left-3 right-1 bg-zinc-400/55",
};

export function EventTimelinePreview({
  events,
  windowMilli,
  cursorMilli,
  onCursorMilliChange,
  disabled = false,
  className,
}: EventTimelinePreviewProps) {
  const updateCursor = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (disabled || !onCursorMilliChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onCursorMilliChange(timelinePreviewTimeAtY(event.clientY - rect.top, rect.height, windowMilli));
  }, [disabled, onCursorMilliChange, windowMilli]);

  return (
    <div
      className={cn(
        "relative w-7 shrink-0 select-none border-l border-white/[0.06] bg-white/[0.018]",
        disabled ? "cursor-default" : "cursor-ns-resize",
        className,
      )}
      onMouseMove={updateCursor}
      onMouseDown={updateCursor}
      aria-label="Event timeline preview"
      data-event-timeline-preview
    >
      {events.map((event) => (
        <div
          key={event.id}
          className={cn("pointer-events-none absolute h-0.5 rounded-full", TICK_STYLES[event.kind])}
          style={{ top: `${timelinePreviewPercent(event.relativeMilli, windowMilli)}%` }}
          data-preview-event={event.kind}
        />
      ))}
      {cursorMilli !== null && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10 h-0.5 -translate-y-1/2 bg-amber-200 shadow-[0_0_7px_rgba(253,230,138,.75)]"
          style={{ top: `${timelinePreviewPercent(cursorMilli, windowMilli)}%` }}
          data-preview-cursor
        />
      )}
    </div>
  );
}
