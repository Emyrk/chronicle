import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";

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

interface TimeRangeProviderProps {
  children: ReactNode;
  /** Total duration of selected encounters in ms */
  totalDurationMs: number;
}

export function TimeRangeProvider({ children, totalDurationMs }: TimeRangeProviderProps) {
  const [enabled, setEnabled] = useState(false);
  const [startOffsetMs, setStartOffsetMs] = useState<number | null>(null);
  const [endOffsetMs, setEndOffsetMs] = useState<number | null>(null);

  const setRange = useCallback((start: number | null, end: number | null) => {
    setStartOffsetMs(start);
    setEndOffsetMs(end);
    // Auto-enable when user sets a range
    if (start != null || end != null) setEnabled(true);
  }, []);

  const reset = useCallback(() => {
    setStartOffsetMs(null);
    setEndOffsetMs(null);
    setEnabled(false);
  }, []);

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
