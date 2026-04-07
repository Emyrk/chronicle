import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

export interface TimeRangeState {
  /** Whether the time range controller is active */
  enabled: boolean;
  /** Start offset in ms from encounter start. null = no lower bound. */
  startOffsetMs: number | null;
  /** End offset in ms from encounter start. null = no upper bound. */
  endOffsetMs: number | null;
  /** Total duration of selected encounters in ms (for slider range) */
  totalDurationMs: number;
}

export interface TimeRangeActions {
  setRange: (start: number | null, end: number | null) => void;
  setEnabled: (enabled: boolean) => void;
  reset: () => void;
}

export type TimeRangeContextValue = TimeRangeState & TimeRangeActions;

const TimeRangeContext = createContext<TimeRangeContextValue | null>(null);

export function useTimeRangeContext(): TimeRangeContextValue {
  const ctx = useContext(TimeRangeContext);
  if (!ctx) throw new Error("useTimeRangeContext must be used within TimeRangeProvider");
  return ctx;
}

export function useTimeRangeContextOptional(): TimeRangeContextValue | null {
  return useContext(TimeRangeContext);
}

/** Parse the `t` URL param (format: `startMs-endMs`) into offset values. */
function parseTimeParam(param: string | null): { start: number | null; end: number | null } {
  if (!param) return { start: null, end: null };
  const dash = param.indexOf("-");
  if (dash < 0) return { start: null, end: null };
  const s = Number(param.slice(0, dash));
  const e = Number(param.slice(dash + 1));
  if (isNaN(s) || isNaN(e)) return { start: null, end: null };
  return { start: s, end: e };
}

interface TimeRangeProviderProps {
  children: ReactNode;
  /** Total duration of selected encounters in ms */
  totalDurationMs: number;
}

export function TimeRangeProvider({ children, totalDurationMs }: TimeRangeProviderProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialise from URL on first render
  const urlTime = parseTimeParam(searchParams.get("t"));

  const [enabled, setEnabled] = useState(urlTime.start != null);
  const [startOffsetMs, setStartOffsetMs] = useState<number | null>(urlTime.start);
  const [endOffsetMs, setEndOffsetMs] = useState<number | null>(urlTime.end);

  const setRange = useCallback((start: number | null, end: number | null) => {
    setStartOffsetMs(start);
    setEndOffsetMs(end);
    // Auto-enable when user sets a range
    if (start != null || end != null) setEnabled(true);
    // Persist to URL
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (start != null && end != null) {
        next.set("t", `${start}-${end}`);
      } else {
        next.delete("t");
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const reset = useCallback(() => {
    setStartOffsetMs(null);
    setEndOffsetMs(null);
    setEnabled(false);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("t");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const value = useMemo<TimeRangeContextValue>(() => ({
    enabled,
    startOffsetMs,
    endOffsetMs,
    totalDurationMs,
    setRange,
    setEnabled,
    reset,
  }), [enabled, startOffsetMs, endOffsetMs, totalDurationMs, setRange, reset]);

  return (
    <TimeRangeContext.Provider value={value}>
      {children}
    </TimeRangeContext.Provider>
  );
}
