import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  calculateRelativeHealth,
  type RelativeHealthMessage,
  type RelativeHealthState,
} from "./relativeHealth";

interface RelativeHealthBarProps {
  messages: RelativeHealthMessage[];
  className?: string;
  state?: RelativeHealthState;
}

function segmentStyle(from: number, to: number, toPercent: (value: number) => number) {
  const fromPercent = toPercent(from);
  const toPercentValue = toPercent(to);
  return {
    left: `${Math.min(fromPercent, toPercentValue)}%`,
    width: `${Math.abs(toPercentValue - fromPercent)}%`,
  };
}

function formatSigned(value: number): string {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${Math.abs(Math.round(value)).toLocaleString()}`;
}

export function RelativeHealthBar({ messages, className, state: suppliedState }: RelativeHealthBarProps) {
  const calculatedState = useMemo(() => calculateRelativeHealth(messages), [messages]);
  const state = suppliedState ?? calculatedState;
  const transition = state.lastTransition;
  const overhealEnd = transition?.kind === "healing"
    ? transition.to + transition.overheal
    : state.current;
  const unpreventedEnd = transition?.kind === "damage"
    ? transition.to - transition.prevented
    : state.current;
  const scale = Math.max(
    1,
    Math.abs(state.minimum),
    Math.abs(state.maximum),
    Math.abs(overhealEnd),
    Math.abs(unpreventedEnd),
  ) * 1.08;
  const toPercent = (value: number) => 50 + (value / scale) * 50;
  const currentColor = state.current < 0 ? "bg-red-500/55" : "bg-green-500/50";
  const transitionColor = transition?.kind === "damage" ? "bg-red-300" : "bg-green-300";

  return (
    <div className={cn("space-y-1", className)} data-relative-health-bar>
      <div className="relative h-6 overflow-hidden rounded-sm border border-white/10 bg-[#17181b]">
        {/* Net change from the relative zero baseline to the current position. */}
        {state.current !== 0 && (
          <div
            className={cn("absolute bottom-1 top-1 rounded-[1px]", currentColor)}
            style={segmentStyle(0, state.current, toPercent)}
            data-current-range
          />
        )}

        {/* Where the latest heal would have reached if the overheal were effective. */}
        {transition?.kind === "healing" && transition.overheal > 0 && (
          <div
            className="absolute bottom-1 top-1 border-x border-green-200/35 bg-[repeating-linear-gradient(115deg,rgba(74,222,128,.35)_0_3px,rgba(74,222,128,.08)_3px_6px)]"
            style={segmentStyle(transition.to, overhealEnd, toPercent)}
            title={`${Math.round(transition.overheal).toLocaleString()} overheal`}
            data-overheal-range
          />
        )}

        {/* Damage that was prevented; it shows the avoided leftward movement. */}
        {transition?.kind === "damage" && transition.prevented > 0 && (
          <div
            className="absolute bottom-1 top-1 border-x border-blue-200/40 bg-[repeating-linear-gradient(115deg,rgba(96,165,250,.65)_0_3px,rgba(96,165,250,.16)_3px_6px)]"
            style={segmentStyle(unpreventedEnd, transition.to, toPercent)}
            title={`${Math.round(transition.prevented).toLocaleString()} prevented`}
            data-prevented-range
          />
        )}

        {/* The latest health-changing movement, nested inside the net bar when possible. */}
        {transition && transition.from !== transition.to && (
          <div
            className={cn("absolute bottom-[9px] top-[9px] rounded-full shadow-[0_0_5px_currentColor]", transitionColor)}
            style={segmentStyle(transition.from, transition.to, toPercent)}
            data-transition-range
          />
        )}

        {/* Relative zero, extrema endcaps, and current position. */}
        <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-white/55" data-zero-marker />
        <div
          className="absolute bottom-0 top-0 w-0.5 -translate-x-1/2 bg-red-300/80"
          style={{ left: `${toPercent(state.minimum)}%` }}
          title={`Minimum ${formatSigned(state.minimum)}`}
          data-minimum-marker
        />
        <div
          className="absolute bottom-0 top-0 w-0.5 -translate-x-1/2 bg-green-300/80"
          style={{ left: `${toPercent(state.maximum)}%` }}
          title={`Maximum ${formatSigned(state.maximum)}`}
          data-maximum-marker
        />
        <div
          className="absolute bottom-0 top-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_5px_rgba(255,255,255,.7)]"
          style={{ left: `${toPercent(state.current)}%` }}
          title={`Current ${formatSigned(state.current)}`}
          data-current-marker
        />
      </div>

      <div className="flex items-center font-mono text-[9px] text-muted-foreground">
        <span className="text-red-300/80">min {formatSigned(state.minimum)}</span>
        <span className="mx-auto text-foreground/75">
          {state.current < 0 ? "deficit" : state.current > 0 ? "surplus" : "baseline"} {formatSigned(state.current)}
        </span>
        <span className="text-green-300/80">max {formatSigned(state.maximum)}</span>
      </div>
    </div>
  );
}
