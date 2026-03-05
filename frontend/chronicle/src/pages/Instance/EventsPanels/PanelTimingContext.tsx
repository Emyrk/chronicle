/**
 * PanelTimingContext - Tracks how long it takes for all panels to finish loading
 * and captures per-panel processing metrics for diagnostics.
 *
 * Usage:
 * 1. Wrap panels in <PanelTimingProvider panelCount={4}>
 * 2. Each panel calls usePanelTiming() and reports when done
 * 3. usePanelAggregation reports detailed per-panel metrics
 * 4. Use <PanelTimingDisplay /> to show the total time
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";

export interface PanelMetrics {
  /** Stable key for a panel slot, e.g. "panel-0" */
  panelKey: string;
  /** Panel processor id (e.g. "damage_done") */
  panelId: string;
  /** Human-readable panel label */
  panelLabel: string;
  /** Layout position index */
  panelIndex: number;
  /** Streams requested by this panel */
  streams: string[];
  /** Byte size per stream */
  streamBytes: Record<string, number>;
  /** Total stream bytes sent to worker */
  totalStreamBytes: number;
  /** Total events processed by this panel */
  totalEvents: number;
  /** Worker-side total processing time */
  processingTimeMs: number;
  /** Worker-side stream processing time */
  streamProcessingTimeMs: number;
  /** Worker-side serialization time */
  serializationTimeMs: number;
  /** Main-thread deserialization time */
  deserializationTimeMs: number;
  /** End-to-end wall clock time (fetch + queue + worker + deserialize) */
  wallTimeMs: number;
  /** Time spent waiting for a worker slot */
  queueWaitMs: number;
  /** Time spent fetching required streams */
  fetchTimeMs: number;
  /** Timestamp when this metric was last updated */
  updatedAtMs: number;
}

interface PanelTimingContextValue {
  /** Report that a panel has finished loading */
  reportPanelDone: (panelId: string) => void;
  /** Report/update detailed metrics for a panel slot */
  reportPanelMetrics: (metrics: PanelMetrics) => void;
  /** Reset timing (call when encounter selection changes) */
  resetTiming: () => void;
  /** Total time from first panel start to last panel done (ms) */
  totalTimeMs: number | null;
  /** Number of panels that have reported done */
  doneCount: number;
  /** Total number of panels expected */
  panelCount: number;
  /** Whether all panels are done */
  allDone: boolean;
  /** Per-panel metrics keyed by panel slot key (e.g. panel-0) */
  panelMetrics: Map<string, PanelMetrics>;
}

const PanelTimingContext = createContext<PanelTimingContextValue | null>(null);

interface PanelTimingProviderProps {
  children: ReactNode;
  panelCount: number;
}

export function PanelTimingProvider({ children, panelCount }: PanelTimingProviderProps) {
  const [totalTimeMs, setTotalTimeMs] = useState<number | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [panelMetrics, setPanelMetrics] = useState<Map<string, PanelMetrics>>(new Map());

  // Start timer immediately on first render
  const startTimeRef = useRef<number>(performance.now());
  const donePanelsRef = useRef<Set<string>>(new Set());

  const resetTiming = useCallback(() => {
    // Start timer immediately when reset is called (i.e., when encounters change)
    startTimeRef.current = performance.now();
    donePanelsRef.current.clear();
    setDoneCount(0);
    setTotalTimeMs(null);
    setPanelMetrics(new Map());
  }, []);

  const reportPanelDone = useCallback((panelId: string) => {
    // Skip if already reported
    if (donePanelsRef.current.has(panelId)) return;

    donePanelsRef.current.add(panelId);
    const newCount = donePanelsRef.current.size;
    setDoneCount(newCount);

    // When all panels done, record total time
    if (newCount >= panelCount) {
      const elapsed = performance.now() - startTimeRef.current;
      setTotalTimeMs(elapsed);
    }
  }, [panelCount]);

  const reportPanelMetrics = useCallback((metrics: PanelMetrics) => {
    setPanelMetrics((prev) => {
      const next = new Map(prev);
      next.set(metrics.panelKey, metrics);
      return next;
    });
  }, []);

  const value: PanelTimingContextValue = {
    reportPanelDone,
    reportPanelMetrics,
    resetTiming,
    totalTimeMs,
    doneCount,
    panelCount,
    allDone: doneCount >= panelCount,
    panelMetrics,
  };

  return (
    <PanelTimingContext.Provider value={value}>
      {children}
    </PanelTimingContext.Provider>
  );
}

export function usePanelTimingContext(): PanelTimingContextValue | null {
  return useContext(PanelTimingContext);
}

/**
 * Hook for panels to report their timing.
 * Call with a stable panelId.
 */
export function usePanelTiming(panelId: string, isDone: boolean): void {
  const ctx = usePanelTimingContext();

  useEffect(() => {
    if (isDone && ctx) {
      ctx.reportPanelDone(panelId);
    }
  }, [isDone, panelId, ctx]);
}

/**
 * Display component showing panel loading time.
 */
export function PanelTimingDisplay() {
  const ctx = usePanelTimingContext();

  if (!ctx) return null;

  const { totalTimeMs, doneCount, panelCount, allDone } = ctx;

  return (
    <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md font-mono">
      {allDone ? (
        <span>
          All {panelCount} panels loaded in{" "}
          <span className="text-foreground font-semibold">
            {totalTimeMs?.toFixed(0)}ms
          </span>
        </span>
      ) : (
        <span>
          Loading panels... {doneCount}/{panelCount}
        </span>
      )}
    </div>
  );
}

/**
 * Component that resets timing when encounters change.
 * Render this inside PanelTimingProvider.
 */
export function PanelTimingResetter({ encounters }: { encounters: unknown[] }) {
  const ctx = usePanelTimingContext();

  // Create a stable key from encounters
  const encounterKey = JSON.stringify(encounters.map((e: unknown) => (e as { id: string }).id));

  useEffect(() => {
    ctx?.resetTiming();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when encounters change, not on ctx changes
  }, [encounterKey]);

  return null;
}
