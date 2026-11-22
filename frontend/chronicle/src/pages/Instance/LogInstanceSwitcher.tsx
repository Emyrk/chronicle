import { Check, ChevronDown, ChevronLeft, ChevronRight, Skull } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { formatDurationMs } from "./phaseTimeRange";

/** One parsed instance from the same uploaded log, in log order. */
export interface LogInstanceSibling {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  bossKills: number;
  bossTotal: number;
  wipes: number;
}

interface SwitcherProps {
  instances: readonly LogInstanceSibling[];
  currentId: string;
  onSelect: (id: string) => void;
}

const SEGMENT_COLORS = ["bg-sky-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];

/** Repeated names get "#n" in log order so resets of one dungeon stay distinguishable. */
function siblingLabels(instances: readonly LogInstanceSibling[]): Map<string, string> {
  const totals = new Map<string, number>();
  for (const instance of instances) totals.set(instance.name, (totals.get(instance.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const instance of instances) {
    const ordinal = (seen.get(instance.name) ?? 0) + 1;
    seen.set(instance.name, ordinal);
    labels.set(instance.id, (totals.get(instance.name) ?? 0) > 1 ? `${instance.name} #${ordinal}` : instance.name);
  }
  return labels;
}

function durationMs(instance: LogInstanceSibling): number {
  return new Date(instance.endTime).getTime() - new Date(instance.startTime).getTime();
}

function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function BossProgress({ instance, className }: { instance: LogInstanceSibling; className?: string }) {
  const cleared = instance.bossTotal > 0 && instance.bossKills >= instance.bossTotal;
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", cleared ? "text-emerald-400" : "text-amber-400", className)}>
      {cleared ? <Check className="h-3 w-3" /> : <Skull className="h-3 w-3" />}
      {instance.bossKills}/{instance.bossTotal}
    </span>
  );
}

/** Option A: a tab strip below the header. Each tab carries enough to tell resets apart at a glance. */
export function LogInstanceTabs({ instances, currentId, onSelect }: SwitcherProps) {
  const labels = siblingLabels(instances);
  return (
    <div className="styled-scrollbar -mt-4 mb-4 flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-background/40 p-1">
      {instances.map((instance) => {
        const active = instance.id === currentId;
        return (
          <button
            key={instance.id}
            type="button"
            onClick={() => onSelect(instance.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-40 shrink-0 flex-col items-start rounded-md px-3 py-1.5 text-left transition-colors",
              active ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-white/5",
            )}
          >
            <span className={cn("text-sm font-medium", !active && "text-muted-foreground")}>{labels.get(instance.id)}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{clockLabel(instance.startTime)}</span>
              <span>{formatDurationMs(durationMs(instance))}</span>
              <BossProgress instance={instance} />
              {instance.wipes > 0 && <span className="text-rose-400">{instance.wipes} wipe{instance.wipes === 1 ? "" : "s"}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Option B: a compact stepper beside the title, with the full list in a dropdown. */
export function LogInstanceStepper({ instances, currentId, onSelect }: SwitcherProps) {
  const labels = siblingLabels(instances);
  const index = Math.max(0, instances.findIndex((instance) => instance.id === currentId));
  const step = (delta: number) => {
    const next = instances[index + delta];
    if (next) onSelect(next.id);
  };
  return (
    <span className="inline-flex items-center rounded-md border border-white/10 bg-background/40 text-sm font-normal">
      <button
        type="button"
        aria-label="Previous instance in this log"
        disabled={index === 0}
        onClick={() => step(-1)}
        className="rounded-l-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 px-2 py-0.5 text-muted-foreground hover:text-foreground">
          <span className="tabular-nums">{index + 1} of {instances.length}</span>
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>In this log</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {instances.map((instance) => (
            <DropdownMenuItem
              key={instance.id}
              onSelect={() => onSelect(instance.id)}
              className={cn("flex items-center justify-between gap-3", instance.id === currentId && "bg-primary/10")}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{labels.get(instance.id)}</span>
                <span className="text-xs text-muted-foreground">
                  {clockLabel(instance.startTime)} · {formatDurationMs(durationMs(instance))}
                </span>
              </span>
              <BossProgress instance={instance} className="text-xs" />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        aria-label="Next instance in this log"
        disabled={index === instances.length - 1}
        onClick={() => step(1)}
        className="rounded-r-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </span>
  );
}

/** Option C: the log's night as a timeline. Segment width is real time, gaps are breaks between instances. */
export function LogInstanceTimeline({ instances, currentId, onSelect }: SwitcherProps) {
  const labels = siblingLabels(instances);
  const first = instances[0];
  const last = instances[instances.length - 1];
  if (!first || !last) return null;
  const start = new Date(first.startTime).getTime();
  const span = Math.max(1, new Date(last.endTime).getTime() - start);
  const offset = (iso: string) => ((new Date(iso).getTime() - start) / span) * 100;

  return (
    <div className="-mt-4 mb-4 rounded-lg border border-white/10 bg-background/40 px-3 pb-2 pt-3">
      <div className="relative h-7 rounded bg-white/5">
        {instances.map((instance, index) => {
          const active = instance.id === currentId;
          const left = offset(instance.startTime);
          return (
            <Tooltip key={instance.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={labels.get(instance.id)}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelect(instance.id)}
                  style={{ left: `${left}%`, width: `${Math.max(1, offset(instance.endTime) - left)}%` }}
                  className={cn(
                    "absolute inset-y-0 overflow-hidden rounded px-2 text-left text-xs font-medium text-white transition-opacity",
                    SEGMENT_COLORS[index % SEGMENT_COLORS.length],
                    active ? "opacity-100 ring-2 ring-white/80" : "opacity-45 hover:opacity-75",
                  )}
                >
                  <span className="block truncate leading-7">{labels.get(instance.id)}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="border border-white/10 bg-zinc-950 text-zinc-100" hideArrow>
                <div className="font-medium">{labels.get(instance.id)}</div>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  {clockLabel(instance.startTime)}–{clockLabel(instance.endTime)}
                  <BossProgress instance={instance} />
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{clockLabel(first.startTime)}</span>
        <span>{formatDurationMs(span)} in this log</span>
        <span>{clockLabel(last.endTime)}</span>
      </div>
    </div>
  );
}
