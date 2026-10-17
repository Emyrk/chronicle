import { useCallback, useState } from "react";
import { isMeterPanelKey, meterAvailable, METER_PANELS, type MeterPanelKey } from "./meterPanels";

/** A Details-style meter window over the map, anchored to the map's bottom-right corner. */
export interface MeterWindow {
  id: string;
  meter: MeterPanelKey;
  /** Distance from the map's right and bottom edges, so the window stays in that corner as the map resizes. */
  right: number;
  bottom: number;
  width: number;
  height: number;
  perSecond: boolean;
}

const STORAGE_KEY = "chronicle.map.meters";
export const MIN_WIDTH = 180;
export const MIN_HEIGHT = 96;
const EDGE = 8;

const DEFAULT_WINDOWS: MeterWindow[] = [
  { id: "meter-1", meter: "damage_done", right: EDGE, bottom: EDGE, width: 260, height: 210, perSecond: true },
];

function readStoredWindows(): MeterWindow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WINDOWS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_WINDOWS;
    return parsed.filter((window): window is MeterWindow =>
      typeof window === "object" && window !== null && isMeterPanelKey((window as MeterWindow).meter)
      && [window.right, window.bottom, window.width, window.height].every((value) => typeof value === "number"));
  } catch {
    return DEFAULT_WINDOWS;
  }
}

/** The map's meter windows, remembered per browser. */
export function useMeterWindows(): [MeterWindow[], (update: (windows: MeterWindow[]) => MeterWindow[]) => void] {
  const [windows, setWindows] = useState(readStoredWindows);
  const update = useCallback((change: (windows: MeterWindow[]) => MeterWindow[]) => {
    setWindows((current) => {
      const next = change(current);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage may be unavailable; the windows still work for this session.
      }
      return next;
    });
  }, []);
  return [windows, update];
}

/**
 * A new window to the left of the rightmost one (or in the corner when there
 * is none), showing the first meter not already open.
 */
export function spawnMeterWindow(windows: readonly MeterWindow[], capabilities: readonly string[] = []): MeterWindow {
  const right = windows.reduce((edge, window) => Math.max(edge, window.right + window.width + 4), EDGE);
  const open = new Set(windows.map((window) => window.meter));
  const keys = (Object.keys(METER_PANELS) as MeterPanelKey[]).filter((key) => meterAvailable(METER_PANELS[key], capabilities));
  const meter = keys.find((key) => !open.has(key)) ?? keys[0] ?? "damage_done";
  return { id: `meter-${Date.now()}`, meter, right, bottom: EDGE, width: 260, height: 210, perSecond: true };
}
