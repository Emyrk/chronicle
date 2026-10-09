import { useEffect, useRef, useState } from "react";

/** Never run further ahead of the last real replay tick than this (real time). */
const MAX_EXTRAPOLATE_MS = 250;
/** A tick further than this from the smoothed time is a seek: snap to it. */
const SNAP_MS = 1000;

/**
 * Replay time advances in coarse ticks (SyncModeContext steps every 100 ms),
 * which makes a scrolling timeline look jumpy. While playing, this projects
 * the time forward every animation frame from the last tick and the playback
 * speed. Paused, seeking, or not replaying, it returns the real time.
 */
export function useSmoothReplayTime(targetMs: number | null, playing: boolean, speed: number): number | null {
  const anchor = useRef<{ ms: number; at: number } | null>(null);
  const [frameMs, setFrameMs] = useState<number | null>(null);

  useEffect(() => {
    anchor.current = targetMs == null ? null : { ms: targetMs, at: performance.now() };
  }, [targetMs]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const a = anchor.current;
      if (a) {
        const elapsed = Math.min(performance.now() - a.at, MAX_EXTRAPOLATE_MS);
        setFrameMs(a.ms + elapsed * speed);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  if (!playing || targetMs == null || frameMs == null || Math.abs(frameMs - targetMs) > SNAP_MS * Math.max(1, speed)) {
    return targetMs;
  }
  return frameMs;
}
