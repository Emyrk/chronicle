import type { CSSProperties, ReactNode } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/ScrollArea/ScrollArea";
import {
  HintTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";

interface TimelineEncounter {
  id: string;
  start_time: string;
  end_time: string;
}

export function TemporalTimeline({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className="h-full">
      <div className="min-w-max p-2">{children}</div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

export function TemporalTimelineHeader({
  label,
  title,
  duration,
  secondaryColumn,
}: {
  label: ReactNode;
  title: ReactNode;
  duration: ReactNode;
  secondaryColumn?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 border-b pb-1 text-[10px] font-medium text-muted-foreground">
      <span className="w-32 shrink-0">{label}</span>
      {secondaryColumn}
      <span className="min-w-[300px] flex-1">
        {title}
        <span className="ml-2 text-muted-foreground/50">({duration} total)</span>
      </span>
    </div>
  );
}

export function TemporalTimelineRow({
  label,
  secondaryColumn,
  children,
}: {
  label: ReactNode;
  secondaryColumn?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/30 py-1 hover:bg-muted/20">
      <div className="w-32 shrink-0">{label}</div>
      {secondaryColumn}
      {children}
    </div>
  );
}

export function TemporalTimelineTrack({
  rangeStartMs,
  rangeEndMs,
  encounters,
  children,
}: {
  rangeStartMs: number;
  rangeEndMs: number;
  encounters: readonly TimelineEncounter[];
  children: ReactNode;
}) {
  const durationMs = Math.max(rangeEndMs - rangeStartMs, 1);

  return (
    <div className="relative h-5 min-w-[300px] flex-1 overflow-hidden rounded bg-muted/30">
      {encounters.map((encounter) => {
        const encounterStartMs = new Date(encounter.start_time).getTime();
        const encounterEndMs = new Date(encounter.end_time).getTime();
        const left = ((encounterStartMs - rangeStartMs) / durationMs) * 100;
        const width = ((encounterEndMs - encounterStartMs) / durationMs) * 100;
        return (
          <div
            key={encounter.id}
            className="absolute h-full border-l border-r border-muted-foreground/30"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        );
      })}
      {children}
    </div>
  );
}

export function TemporalTimelineInterval({
  startMs,
  endMs,
  rangeStartMs,
  rangeEndMs,
  className,
  style,
  tooltip,
}: {
  startMs: number;
  endMs: number;
  rangeStartMs: number;
  rangeEndMs: number;
  className?: string;
  style?: CSSProperties;
  tooltip: ReactNode;
}) {
  const durationMs = Math.max(rangeEndMs - rangeStartMs, 1);
  const left = ((startMs - rangeStartMs) / durationMs) * 100;
  const width = ((endMs - startMs) / durationMs) * 100;

  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "absolute h-full cursor-help rounded transition-opacity hover:opacity-100",
            className,
          )}
          style={{
            left: `${left}%`,
            width: `${Math.max(width, 0.5)}%`,
            opacity: 0.8,
            ...style,
          }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" hideArrow className="max-w-xs bg-popover text-popover-foreground">
        {tooltip}
      </TooltipContent>
    </HintTooltip>
  );
}

export function TemporalTimelineLegend({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex items-center gap-4 border-t pt-2 text-[10px] text-muted-foreground">
      {children}
    </div>
  );
}

export function TemporalTimelineLegendItem({
  marker,
  children,
}: {
  marker: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      {marker}
      <span>{children}</span>
    </div>
  );
}
