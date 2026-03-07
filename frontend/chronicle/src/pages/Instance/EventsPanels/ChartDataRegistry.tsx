/**
 * ChartDataRegistry - Shared context for panels to publish their PlayerMetricChartData[].
 *
 * Panels that produce PlayerMetricChartData[] register their computed data here.
 * The Comparison panel reads from this registry to cross-reference data.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import type { EventsPanelType } from "./EventsPanel";

export interface ChartDataEntry {
  panelIndex: number;
  panelType: EventsPanelType;
  label: string;
  borderColor: string | null;
  data: PlayerMetricChartData[];
}

interface ChartDataRegistryContextType {
  /** Current entries keyed by panelIndex. */
  entries: Map<number, ChartDataEntry>;
  /** Register (or update) chart data for a panel slot. */
  register: (entry: ChartDataEntry) => void;
  /** Remove chart data when a panel unmounts or changes type. */
  unregister: (panelIndex: number) => void;
}

const ChartDataRegistryContext = createContext<ChartDataRegistryContextType | null>(null);

export function ChartDataRegistryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Map<number, ChartDataEntry>>(() => new Map());

  const register = useCallback((entry: ChartDataEntry) => {
    setEntries((prev) => {
      const existing = prev.get(entry.panelIndex);
      // Skip update if data reference hasn't changed (avoids infinite loops).
      if (existing && existing.data === entry.data && existing.borderColor === entry.borderColor && existing.label === entry.label) {
        return prev;
      }
      const next = new Map(prev);
      next.set(entry.panelIndex, entry);
      return next;
    });
  }, []);

  const unregister = useCallback((panelIndex: number) => {
    setEntries((prev) => {
      if (!prev.has(panelIndex)) return prev;
      const next = new Map(prev);
      next.delete(panelIndex);
      return next;
    });
  }, []);

  return (
    <ChartDataRegistryContext.Provider value={{ entries, register, unregister }}>
      {children}
    </ChartDataRegistryContext.Provider>
  );
}

/** No-op fallback when used outside a provider (Layout Lab, Storybook, etc.). */
const NOOP_REGISTRY: ChartDataRegistryContextType = {
  entries: new Map(),
  register: () => {},
  unregister: () => {},
};

// eslint-disable-next-line react-refresh/only-export-components
export function useChartDataRegistry(): ChartDataRegistryContextType {
  return useContext(ChartDataRegistryContext) ?? NOOP_REGISTRY;
}
