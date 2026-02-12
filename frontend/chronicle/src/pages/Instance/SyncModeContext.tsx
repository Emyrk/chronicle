/**
 * Sync Mode Context - Provides state and controls for synchronizing
 * event panel processing with a target timestamp (e.g., video playback).
 * 
 * When sync mode is enabled, panels use main-thread incremental processing
 * instead of Web Workers, allowing pause/resume at arbitrary timestamps.
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from "react";

export interface SyncModeState {
  /** Whether sync mode is enabled */
  enabled: boolean;
  /** Target timestamp in combat log space (absolute time) */
  currentTimestamp: Date | null;
  /** Whether playback is actively advancing */
  isPlaying: boolean;
  /** Playback speed multiplier (1.0 = realtime) */
  playbackSpeed: number;
}

export interface SyncModeMetrics {
  /** Total events processed so far */
  processedCount: number;
  /** Events processed per second */
  eventsPerSecond: number;
  /** Time of last processing update in ms */
  lastUpdateMs: number;
}

export type SyncExternalDriver = 'none' | 'youtube';

export interface SyncModeContextValue extends SyncModeState {
  /** Enable sync mode */
  enable: () => void;
  /** Disable sync mode and return to worker processing */
  disable: () => void;
  /** Set the target timestamp (absolute time in combat log space) */
  setTimestamp: (ts: Date | null) => void;
  /** Start automatic playback (advance timestamp over time) */
  play: () => void;
  /** Pause automatic playback */
  pause: () => void;
  /** Step timestamp by delta milliseconds (positive or negative) */
  step: (deltaMs: number) => void;
  /** Set playback speed multiplier */
  setPlaybackSpeed: (speed: number) => void;
  /** Debug/performance metrics */
  metrics: SyncModeMetrics;
  /** Update metrics (called by processors) */
  updateMetrics: (processedCount: number, processingTimeMs: number) => void;
  /** Encounter bounds for UI (set by parent) */
  encounterBounds: { start: Date; end: Date } | null;
  /** Set encounter bounds */
  setEncounterBounds: (bounds: { start: Date; end: Date } | null) => void;
  /** External driver controlling timestamp (e.g., YouTube). When set, manual controls should be disabled. */
  externalDriver: SyncExternalDriver;
  /** Set the external driver */
  setExternalDriver: (driver: SyncExternalDriver) => void;
}

const defaultMetrics: SyncModeMetrics = {
  processedCount: 0,
  eventsPerSecond: 0,
  lastUpdateMs: 0,
};

const SyncModeContext = createContext<SyncModeContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useSyncModeContext(): SyncModeContextValue {
  const context = useContext(SyncModeContext);
  if (!context) {
    throw new Error("useSyncModeContext must be used within a SyncModeProvider");
  }
  return context;
}

/**
 * Optional hook that returns null if not within a provider.
 * Use this in components that should work both with and without sync mode.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSyncModeContextOptional(): SyncModeContextValue | null {
  return useContext(SyncModeContext);
}

interface SyncModeProviderProps {
  children: ReactNode;
}

export function SyncModeProvider({ children }: SyncModeProviderProps) {
  const [enabled, setEnabled] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState<Date | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [metrics, setMetrics] = useState<SyncModeMetrics>(defaultMetrics);
  const [encounterBounds, setEncounterBounds] = useState<{ start: Date; end: Date } | null>(null);
  const [externalDriver, setExternalDriver] = useState<SyncExternalDriver>('none');
  
  // Track last frame time for playback
  const lastFrameTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const enable = useCallback(() => {
    setEnabled(true);
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
    setIsPlaying(false);
    setCurrentTimestamp(null);
    setMetrics(defaultMetrics);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Track previous timestamp to detect backward seeks
  const prevTimestampRef = useRef<Date | null>(null);
  
  const setTimestamp = useCallback((ts: Date | null) => {
    // Reset metrics when seeking backward (new timestamp is before previous)
    if (ts && prevTimestampRef.current && ts.getTime() < prevTimestampRef.current.getTime()) {
      setMetrics(defaultMetrics);
    }
    prevTimestampRef.current = ts;
    setCurrentTimestamp(ts);
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    setIsPlaying(true);
    lastFrameTimeRef.current = null;
  }, [enabled]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const step = useCallback((deltaMs: number) => {
    setCurrentTimestamp(prev => {
      // If no timestamp yet, initialize from encounter bounds
      if (!prev) {
        if (encounterBounds) {
          // Start from beginning if stepping forward, end if stepping backward
          return deltaMs >= 0 ? encounterBounds.start : encounterBounds.end;
        }
        return prev; // Can't step without a reference point
      }
      
      const newTime = new Date(prev.getTime() + deltaMs);
      
      // Clamp to encounter bounds if set
      if (encounterBounds) {
        if (newTime < encounterBounds.start) return encounterBounds.start;
        if (newTime > encounterBounds.end) return encounterBounds.end;
      }
      
      return newTime;
    });
  }, [encounterBounds]);

  const updateMetrics = useCallback((processedCount: number, processingTimeMs: number) => {
    setMetrics(prev => ({
      processedCount,
      eventsPerSecond: processingTimeMs > 0 ? Math.round((processedCount / processingTimeMs) * 1000) : prev.eventsPerSecond,
      lastUpdateMs: processingTimeMs,
    }));
  }, []);

  // Track playback speed and bounds in refs so tick doesn't need effect restarts
  const playbackSpeedRef = useRef(playbackSpeed);
  const encounterBoundsRef = useRef(encounterBounds);
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);
  useEffect(() => {
    encounterBoundsRef.current = encounterBounds;
  }, [encounterBounds]);

  // Jump to encounter start if currentTimestamp is outside bounds
  // This is safe from infinite loops: the new value (encounterBounds.start) is within bounds,
  // so the next render won't trigger another update.
  // useEffect(() => {
  //   if (enabled && encounterBounds && currentTimestamp) {
  //     if (currentTimestamp < encounterBounds.start || currentTimestamp > encounterBounds.end) {
  //       // eslint-disable-next-line react-compiler/react-compiler
  //       setCurrentTimestamp(encounterBounds.start);
  //     }
  //   }
  // }, [enabled, encounterBounds, currentTimestamp]);

  // Playback loop - advance timestamp when playing
  // Uses setInterval at 100ms to match the processing throttle rate in usePanelAggregation.
  // Using requestAnimationFrame (~16ms) would update faster than processing can keep up.
  useEffect(() => {
    if (!isPlaying || !enabled) {
      lastFrameTimeRef.current = null;
      return;
    }

    const TICK_INTERVAL_MS = 100; // Match throttle rate in usePanelAggregation
    lastFrameTimeRef.current = performance.now();

    const intervalId = setInterval(() => {
      const now = performance.now();
      const deltaMs = (now - (lastFrameTimeRef.current ?? now)) * playbackSpeedRef.current;
      lastFrameTimeRef.current = now;

      setCurrentTimestamp(prev => {
        if (!prev) return prev;
        const newTime = new Date(prev.getTime() + deltaMs);
        
        // Stop at encounter end
        const bounds = encounterBoundsRef.current;
        if (bounds && newTime >= bounds.end) {
          setIsPlaying(false);
          return bounds.end;
        }
        
        return newTime;
      });
    }, TICK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [isPlaying, enabled]);

  const value: SyncModeContextValue = useMemo(() => ({
    enabled,
    currentTimestamp,
    isPlaying,
    playbackSpeed,
    enable,
    disable,
    setTimestamp,
    play,
    pause,
    step,
    setPlaybackSpeed,
    metrics,
    updateMetrics,
    encounterBounds,
    setEncounterBounds,
    externalDriver,
    setExternalDriver,
  }), [
    enabled,
    currentTimestamp,
    isPlaying,
    playbackSpeed,
    enable,
    disable,
    setTimestamp,
    play,
    pause,
    step,
    setPlaybackSpeed,
    metrics,
    updateMetrics,
    encounterBounds,
    setEncounterBounds,
    externalDriver,
  ]);

  return (
    <SyncModeContext.Provider value={value}>
      {children}
    </SyncModeContext.Provider>
  );
}
